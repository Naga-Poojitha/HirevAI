import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function extractFromPdf(bytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  } catch (e) {
    console.error("pdf parse error", e);
    return "";
  }
}

async function extractFromDocx(bytes: Uint8Array): Promise<string> {
  // DOCX = zip with word/document.xml. Minimal extraction via DecompressionStream.
  try {
    const blob = new Blob([bytes]);
    // Use JSZip via esm
    const { default: JSZip } = await import("https://esm.sh/jszip@3.10.1");
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file("word/document.xml")?.async("string");
    if (!xml) return "";
    // strip tags
    return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  } catch (e) {
    console.error("docx parse error", e);
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

    const { data: file, error: dlErr } = await supabase.storage
      .from("screening-resumes")
      .download(cand.resume_path);
    if (dlErr || !file) throw new Error("download failed");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const lower = cand.resume_path.toLowerCase();
    let text = "";
    if (lower.endsWith(".pdf")) text = await extractFromPdf(bytes);
    else if (lower.endsWith(".docx")) text = await extractFromDocx(bytes);
    else if (lower.endsWith(".txt") || lower.endsWith(".md")) text = new TextDecoder().decode(bytes);
    else text = new TextDecoder().decode(bytes);

    text = text.slice(0, 20000);

    await supabase
      .from("screening_candidates")
      .update({ resume_text: text, parse_status: text ? "parsed" : "failed" })
      .eq("id", candidateId);

    return new Response(JSON.stringify({ ok: true, length: text.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-resume error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
