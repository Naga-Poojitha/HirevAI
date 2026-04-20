import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TopNav } from "@/components/TopNav";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, Upload, FileCheck2 } from "lucide-react";

const ROLES = ["Frontend Engineer", "Backend Engineer", "Full Stack Engineer", "Data Scientist", "Product Manager", "DevOps Engineer", "ML Engineer", "Designer"];
const LEVELS = [
  { value: "junior", label: "Junior", desc: "0–2 years" },
  { value: "mid", label: "Mid-level", desc: "2–5 years" },
  { value: "senior", label: "Senior", desc: "5–8 years" },
  { value: "staff", label: "Staff+", desc: "8+ years" },
];

const Setup = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [level, setLevel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
        return;
      }
      setUserId(session.user.id);
      supabase.from("profiles").select("full_name").eq("user_id", session.user.id).maybeSingle().then(({ data }) => {
        if (data?.full_name) setFullName(data.full_name);
      });
    });
  }, [navigate]);

  const finalRole = role === "Other" ? customRole : role;

  const canNext = () => {
    if (step === 0) return fullName.trim().length > 1;
    if (step === 1) return finalRole.trim().length > 1;
    if (step === 2) return !!level;
    return true;
  };

  const readFileAsText = (f: File): Promise<string> =>
    new Promise((resolve) => {
      if (!f.name.match(/\.(txt|md)$/i) && f.type !== "text/plain") {
        // For PDF/DOCX we send filename only — actual parsing deferred to AI via raw text fallback.
        resolve("");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsText(f);
    });

  const handleSubmit = async () => {
    if (!userId || !file) {
      toast.error("Please upload your resume.");
      return;
    }
    setLoading(true);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("resumes").upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      const resumeText = await readFileAsText(file);

      const { data: qData, error: qErr } = await supabase.functions.invoke("generate-questions", {
        body: { resumeText, fullName, role: finalRole, experienceLevel: level },
      });
      if (qErr) throw qErr;
      if (qData?.error) throw new Error(qData.error);

      const { data: interview, error: insErr } = await supabase
        .from("interviews")
        .insert({
          user_id: userId,
          full_name: fullName,
          role: finalRole,
          experience_level: level,
          resume_path: path,
          resume_data: { summary: qData.profile_summary, key_skills: qData.key_skills },
          questions: qData.questions,
          status: "in_progress",
        })
        .select()
        .single();
      if (insErr) throw insErr;

      await supabase.from("profiles").update({
        full_name: fullName,
        role: finalRole,
        experience_level: level,
        resume_path: path,
      }).eq("user_id", userId);

      toast.success("Interview ready");
      navigate(`/interview/${interview.id}`);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const steps = ["Identity", "Role", "Experience", "Resume"];

  return (
    <div className="min-h-screen bg-background grain">
      <TopNav />
      <div className="absolute inset-0 bg-gradient-hero opacity-40 pointer-events-none" />

      <main className="container max-w-2xl py-12 md:py-20 relative">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-10">
          {steps.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-border"}`} />
            </div>
          ))}
        </div>

        <div className="rounded-3xl glass-strong p-8 md:p-10 shadow-elegant min-h-[420px] flex flex-col">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Step {step + 1} of 4</p>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex-1"
            >
              {step === 0 && (
                <>
                  <h2 className="font-display text-3xl font-semibold tracking-tight">What should we call you?</h2>
                  <p className="text-muted-foreground mt-2">Your full name will appear on the report.</p>
                  <div className="mt-8 space-y-2">
                    <Label htmlFor="fn">Full name</Label>
                    <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ada Lovelace" className="rounded-xl h-12 text-lg" />
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <h2 className="font-display text-3xl font-semibold tracking-tight">Which role are you targeting?</h2>
                  <p className="text-muted-foreground mt-2">We'll tailor every question.</p>
                  <div className="mt-8 grid grid-cols-2 gap-2">
                    {[...ROLES, "Other"].map((r) => (
                      <button
                        key={r}
                        onClick={() => setRole(r)}
                        className={`text-left rounded-xl border px-4 py-3 text-sm transition-all ${role === r ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30"}`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  {role === "Other" && (
                    <div className="mt-4">
                      <Input value={customRole} onChange={(e) => setCustomRole(e.target.value)} placeholder="Type your role" className="rounded-xl" />
                    </div>
                  )}
                </>
              )}

              {step === 2 && (
                <>
                  <h2 className="font-display text-3xl font-semibold tracking-tight">Your experience level?</h2>
                  <p className="text-muted-foreground mt-2">Calibrates question difficulty.</p>
                  <div className="mt-8 space-y-2">
                    {LEVELS.map((l) => (
                      <button
                        key={l.value}
                        onClick={() => setLevel(l.value)}
                        className={`w-full text-left rounded-2xl border px-5 py-4 transition-all ${level === l.value ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30"}`}
                      >
                        <div className="font-medium">{l.label}</div>
                        <div className="text-xs text-muted-foreground">{l.desc}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <h2 className="font-display text-3xl font-semibold tracking-tight">Upload your resume</h2>
                  <p className="text-muted-foreground mt-2">PDF, DOCX or TXT — up to 10MB.</p>

                  <label htmlFor="resume" className="mt-8 block cursor-pointer">
                    <div className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${file ? "border-primary bg-primary/5" : "border-border hover:border-foreground/40"}`}>
                      {file ? (
                        <div className="flex flex-col items-center gap-2">
                          <FileCheck2 className="h-8 w-8 text-primary" />
                          <div className="font-medium">{file.name}</div>
                          <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB · click to replace</div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center">
                            <Upload className="h-5 w-5" />
                          </div>
                          <div className="font-medium">Drop your resume here</div>
                          <div className="text-xs text-muted-foreground">or click to browse</div>
                        </div>
                      )}
                    </div>
                    <input
                      id="resume"
                      type="file"
                      accept=".pdf,.docx,.txt,.md"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 10 * 1024 * 1024) {
                          toast.error("File too large (max 10MB)");
                          return;
                        }
                        setFile(f);
                      }}
                    />
                  </label>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex items-center justify-between pt-6 border-t border-border/60">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || loading}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()} className="rounded-full">
                Continue
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={!file || loading} className="rounded-full shadow-glow">
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Start interview
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Setup;
