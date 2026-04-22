import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)),
  ]);
}

async function extractFromPdf(bytes: Uint8Array): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
    const pdf = await withTimeout(getDocumentProxy(bytes), 25000, "pdf load");
    const { text } = await withTimeout(extractText(pdf, { mergePages: true }), 25000, "pdf extract");
    return Array.isArray(text) ? text.join("\n") : (text || "");
  } catch (e) {
    console.error("pdf parse error", e);
    return "";
  }
}

async function extractFromDocx(bytes: Uint8Array): Promise<string> {
  try {
    const { default: JSZip } = await import("https://esm.sh/jszip@3.10.1");
    const zip = await withTimeout(JSZip.loadAsync(bytes), 15000, "docx unzip");
    const xml = await zip.file("word/document.xml")?.async("string");
    if (!xml) return "";
    return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  } catch (e) {
    console.error("docx parse error", e);
    return "";
  }
}

function fallbackText(bytes: Uint8Array): string {
  // Best-effort: decode bytes and strip non-printable characters.
  try {
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    // Keep printable ASCII + basic latin + whitespace
    const cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim();
    return cleaned;
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { candidateId } = await req.json();
    if (!candidateId) throw new Error("candidateId required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cand, error } = await supabase
      .from("screening_candidates")
      .select("id, resume_path")
      .eq("id", candidateId)
      .single();
    if (error || !cand) throw new Error("candidate not found");

    await supabase.from("screening_candidates").update({ parse_status: "parsing" }).eq("id", candidateId);

    const { data: file, error: dlErr } = await supabase.storage
      .from("screening-resumes")
      .download(cand.resume_path);
    if (dlErr || !file) throw new Error("download failed: " + (dlErr?.message ?? "no file"));

    const bytes = new Uint8Array(await file.arrayBuffer());
    const lower = cand.resume_path.toLowerCase();
    let text = "";

    if (lower.endsWith(".pdf")) {
      text = await extractFromPdf(bytes);
      if (!text || text.length < 30) text = fallbackText(bytes);
    } else if (lower.endsWith(".docx")) {
      text = await extractFromDocx(bytes);
      if (!text || text.length < 30) text = fallbackText(bytes);
    } else {
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    }

    text = (text || "").slice(0, 20000);

    await supabase
      .from("screening_candidates")
      .update({ resume_text: text, parse_status: text && text.length >= 30 ? "parsed" : "failed" })
      .eq("id", candidateId);

    return new Response(JSON.stringify({ ok: true, length: text.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-resume error", e);
    // Best-effort: mark candidate as failed so UI/flow doesn't hang
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body?.candidateId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await supabase.from("screening_candidates")
          .update({ parse_status: "failed" })
          .eq("id", body.candidateId);
      }
    } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
