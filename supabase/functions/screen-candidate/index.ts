import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(body: unknown, apiKey: string, retries = 2): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetchWithTimeout(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        45000,
      );
      // Don't retry on auth/credit/rate errors — surface them
      if (resp.status === 401 || resp.status === 402 || resp.status === 429) return resp;
      if (resp.ok) return resp;
      lastErr = new Error(`gateway ${resp.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw lastErr ?? new Error("gateway failed");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let candidateIdForCleanup: string | null = null;
  try {
    const { candidateId } = await req.json();
    candidateIdForCleanup = candidateId;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cand, error } = await supabase
      .from("screening_candidates")
      .select("id, job_id, resume_text, candidate_name, parse_status")
      .eq("id", candidateId)
      .single();
    if (error || !cand) throw new Error("candidate not found");

    // If parsing failed or empty, score 0 and continue gracefully
    if (!cand.resume_text || cand.resume_text.length < 30 || cand.parse_status === "failed") {
      await supabase.from("screening_candidates").update({
        score: 0,
        reasons: ["Resume could not be parsed."],
        strengths: [],
        gaps: ["Unreadable resume file"],
      }).eq("id", candidateId);
      return new Response(JSON.stringify({ ok: true, score: 0, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job, error: jerr } = await supabase
      .from("screening_jobs")
      .select("title, job_description")
      .eq("id", cand.job_id)
      .single();
    if (jerr || !job) throw new Error("job not found");

    const system = `You are an expert technical recruiter. Score a candidate's resume against a job description on a 0-100 scale. Be strict, evidence-based, and concise. Return only via the provided tool.`;
    const user = `JOB TITLE: ${job.title}

JOB DESCRIPTION:
${job.job_description}

CANDIDATE NAME: ${cand.candidate_name || "Unknown"}
RESUME:
${cand.resume_text.slice(0, 8000)}`;

    const resp = await callGemini({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [{
        type: "function",
        function: {
          name: "return_score",
          description: "Score the candidate against the job.",
          parameters: {
            type: "object",
            properties: {
              candidate_name: { type: "string" },
              candidate_email: { type: "string" },
              score: { type: "number" },
              summary: { type: "string" },
              reasons: { type: "array", items: { type: "string" } },
              strengths: { type: "array", items: { type: "string" } },
              gaps: { type: "array", items: { type: "string" } },
            },
            required: ["candidate_name", "candidate_email", "score", "summary", "reasons", "strengths", "gaps"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "return_score" } },
    }, LOVABLE_API_KEY);

    if (!resp.ok) {
      if (resp.status === 429) {
        // Mark as pending-retry style: leave score null but record reason
        await supabase.from("screening_candidates").update({
          reasons: ["Rate limited by AI gateway. Retry later."],
        }).eq("id", candidateId);
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const t = await resp.text();
      console.error("Gateway error", resp.status, t);
      throw new Error("AI gateway error " + resp.status);
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall ? JSON.parse(toolCall.function.arguments) : null;
    if (!args) throw new Error("No tool call returned");

    const update: Record<string, unknown> = {
      score: typeof args.score === "number" ? args.score : 0,
      reasons: [...(args.reasons || []), args.summary].filter(Boolean),
      strengths: args.strengths || [],
      gaps: args.gaps || [],
    };
    if (!cand.candidate_name && args.candidate_name) update.candidate_name = args.candidate_name;
    if (args.candidate_email) update.candidate_email = args.candidate_email;

    await supabase.from("screening_candidates").update(update).eq("id", candidateId);

    return new Response(JSON.stringify({ ok: true, score: update.score }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("screen-candidate error", e);
    // Mark candidate so flow doesn't hang
    try {
      if (candidateIdForCleanup) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await supabase.from("screening_candidates").update({
          score: 0,
          reasons: ["Scoring failed: " + (e instanceof Error ? e.message : "unknown")],
        }).eq("id", candidateIdForCleanup);
      }
    } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
