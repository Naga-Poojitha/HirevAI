import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { jobId } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: job } = await supabase
      .from("screening_jobs").select("top_x").eq("id", jobId).single();
    const topX = job?.top_x ?? 5;

    const { data: cands, error } = await supabase
      .from("screening_candidates")
      .select("id, score")
      .eq("job_id", jobId)
      .order("score", { ascending: false, nullsFirst: false });
    if (error) throw error;

    let rank = 1;
    for (const c of cands ?? []) {
      await supabase.from("screening_candidates").update({
        rank,
        shortlisted: rank <= topX && c.score != null,
      }).eq("id", c.id);
      rank++;
    }

    await supabase.from("screening_jobs").update({ status: "completed" }).eq("id", jobId);

    return new Response(JSON.stringify({ ok: true, ranked: (cands ?? []).length, topX }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("finalize-screening error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
