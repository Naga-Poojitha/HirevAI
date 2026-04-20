const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  resumeText?: string;
  fullName: string;
  role: string;
  experienceLevel: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { resumeText, fullName, role, experienceLevel } = (await req.json()) as ReqBody;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const system = `You are an expert technical interviewer. Generate exactly 6 progressive interview questions tailored to the candidate's resume, target role, and experience level. Mix: 1 intro/background, 3 role-specific technical/scenario, 1 behavioral, 1 forward-looking. Keep each question crisp (max 30 words). Return via the provided tool only.`;

    const user = `Candidate: ${fullName}
Target Role: ${role}
Experience Level: ${experienceLevel}
Resume:
${resumeText?.slice(0, 6000) || "(no resume text provided)"}`;

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
            name: "return_questions",
            description: "Return interview questions and a parsed resume summary.",
            parameters: {
              type: "object",
              properties: {
                profile_summary: { type: "string", description: "1-2 sentence resume summary" },
                key_skills: { type: "array", items: { type: "string" } },
                questions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "number" },
                      category: { type: "string", enum: ["intro", "technical", "scenario", "behavioral", "forward"] },
                      question: { type: "string" },
                    },
                    required: ["id", "category", "question"],
                    additionalProperties: false,
                  },
                  minItems: 6,
                  maxItems: 6,
                },
              },
              required: ["profile_summary", "key_skills", "questions"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_questions" } },
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in workspace settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await resp.text();
      console.error("Gateway error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall ? JSON.parse(toolCall.function.arguments) : null;
    if (!args) throw new Error("No tool call returned");

    return new Response(JSON.stringify(args), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("generate-questions error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
