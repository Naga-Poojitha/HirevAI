import { corsHeaders } from "@supabase/supabase-js/cors";

interface TranscriptItem {
  question: string;
  answer: string;
  category?: string;
}

interface ReqBody {
  fullName: string;
  role: string;
  experienceLevel: string;
  transcript: TranscriptItem[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fullName, role, experienceLevel, transcript } = (await req.json()) as ReqBody;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const system = `You are a senior hiring manager. Evaluate the candidate's interview transcript fairly. Score 0-100 across four dimensions: technical, communication, confidence, problem_solving. Provide concrete strengths and improvements (each 3-5 short items). Recommendation must be one of: strong_hire, hire, lean_hire, no_hire. Use the tool to return JSON.`;

    const userPayload = `Candidate: ${fullName}\nRole: ${role}\nExperience: ${experienceLevel}\n\nTranscript:\n${transcript.map((t, i) => `Q${i + 1} [${t.category || "general"}]: ${t.question}\nA: ${t.answer || "(no answer)"}`).join("\n\n")}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPayload },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_evaluation",
            description: "Return interview evaluation",
            parameters: {
              type: "object",
              properties: {
                scores: {
                  type: "object",
                  properties: {
                    technical: { type: "number" },
                    communication: { type: "number" },
                    confidence: { type: "number" },
                    problem_solving: { type: "number" },
                    overall: { type: "number" },
                  },
                  required: ["technical", "communication", "confidence", "problem_solving", "overall"],
                  additionalProperties: false,
                },
                recommendation: { type: "string", enum: ["strong_hire", "hire", "lean_hire", "no_hire"] },
                summary: { type: "string" },
                strengths: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
                improvements: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
              },
              required: ["scores", "recommendation", "summary", "strengths", "improvements"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_evaluation" } },
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await resp.text();
      console.error("Gateway error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall ? JSON.parse(toolCall.function.arguments) : null;
    if (!args) throw new Error("No evaluation returned");

    return new Response(JSON.stringify(args), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("evaluate-interview error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
