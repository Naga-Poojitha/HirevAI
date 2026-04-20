import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { candidateId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cand, error } = await supabase
      .from("screening_candidates")
      .select("id, job_id, resume_text, candidate_name")
      .eq("id", candidateId)
      .single();
    if (error || !cand) throw new Error("candidate not found");
    if (!cand.resume_text) throw new Error("resume not parsed yet");

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

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
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
                candidate_name: { type: "string", description: "Best-effort full name parsed from resume" },
                candidate_email: { type: "string", description: "Email parsed from resume, or empty string" },
                score: { type: "number", description: "0-100 overall match score" },
                summary: { type: "string", description: "1-2 sentence verdict" },
                reasons: { type: "array", items: { type: "string" }, description: "3-5 concrete reasons for the score" },
                strengths: { type: "array", items: { type: "string" } },
                gaps: { type: "array", items: { type: "string" } },
              },
              required: ["candidate_name", "candidate_email", "score", "summary", "reasons", "strengths", "gaps"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_score" } },
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await resp.text();
      console.error("Gateway error", resp.status, t);
      throw new Error("AI gateway error");
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall ? JSON.parse(toolCall.function.arguments) : null;
    if (!args) throw new Error("No tool call returned");

    const update: Record<string, unknown> = {
      score: args.score,
      reasons: [...(args.reasons || []), args.summary].filter(Boolean),
      strengths: args.strengths || [],
      gaps: args.gaps || [],
    };
    if (!cand.candidate_name && args.candidate_name) update.candidate_name = args.candidate_name;
    if (args.candidate_email) update.candidate_email = args.candidate_email;

    await supabase.from("screening_candidates").update(update).eq("id", candidateId);

    return new Response(JSON.stringify({ ok: true, score: args.score }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("screen-candidate error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
