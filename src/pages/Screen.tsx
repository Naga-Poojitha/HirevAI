import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, Sparkles, Trophy, Mail, Loader2, FileText, Trash2, ShieldCheck } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/use-role";

type Candidate = {
  id: string;
  candidate_name: string | null;
  candidate_email: string | null;
  resume_path: string;
  parse_status: string;
  score: number | null;
  rank: number | null;
  reasons: string[] | null;
  strengths: string[] | null;
  gaps: string[] | null;
  shortlisted: boolean;
  interview_id: string | null;
  invite_status: string;
};

type ScreeningPhase = "idle" | "creating" | "uploading" | "parsing" | "scoring" | "ranking" | "completed" | "failed";
type ProgressState = { done: number; total: number; failed: number };

const STARTUP_BATCH_SIZE = 3;
const PARSE_BATCH_SIZE = 4;
const SCORE_BATCH_SIZE = 3;
const JOB_TIMEOUT_MS = 20000;
const DB_TIMEOUT_MS = 20000;
const UPLOAD_TIMEOUT_MS = 45000;
const PARSE_TIMEOUT_MS = 60000;
const SCORE_TIMEOUT_MS = 75000;
const FINALIZE_TIMEOUT_MS = 30000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const Screen = () => {
  const navigate = useNavigate();
  const { isRecruiter, loading: roleLoading } = useRole();
  const [userId, setUserId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [jd, setJd] = useState("");
  const [topX, setTopX] = useState(5);
  const [files, setFiles] = useState<File[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [progress, setProgress] = useState<ProgressState>({ done: 0, total: 0, failed: 0 });
  const [phase, setPhase] = useState<ScreeningPhase>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [grantingRole, setGrantingRole] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/auth");
      else setUserId(session.user.id);
    });
  }, [navigate]);

  // Realtime updates for candidates
  useEffect(() => {
    if (!jobId) return;
    const channel = supabase
      .channel(`screening:${jobId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "screening_candidates", filter: `job_id=eq.${jobId}` },
        () => refreshCandidates(jobId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [jobId]);

  const refreshCandidates = async (id: string) => {
    const { data } = await supabase
      .from("screening_candidates")
      .select("*")
      .eq("job_id", id)
      .order("rank", { ascending: true, nullsFirst: false })
      .order("score", { ascending: false, nullsFirst: false });
    setCandidates((data ?? []) as Candidate[]);
  };

  const grantRecruiter = async () => {
    if (!userId) return;
    setGrantingRole(true);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "recruiter" });
    setGrantingRole(false);
    if (error) toast.error(error.message);
    else { toast.success("Recruiter access granted"); window.location.reload(); }
  };

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list).filter((f) => /\.(pdf|docx|txt|md)$/i.test(f.name));
    if (arr.length !== list.length) toast.warning("Only PDF, DOCX, TXT, MD accepted");
    setFiles((prev) => [...prev, ...arr]);
  };

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const startScreening = async () => {
    if (!userId) return;
    if (!title.trim() || !jd.trim()) return toast.error("Add a role title and job description");
    if (files.length === 0) return toast.error("Upload at least one resume");
    if (topX < 1 || topX > files.length) return toast.error("Top X must be between 1 and total resumes");

    setRunning(true);
    setRunError(null);
    setStatusMessage("Starting screening job...");
    setProgress({ done: 0, total: 0, failed: 0 });
    setPhase("creating");

    let activeJobId: string | null = null;
    try {
      const nextJobId = crypto.randomUUID();
      const job = await expectSingle<{ id: string }>(
        "create screening job",
        async () => await supabase
          .from("screening_jobs")
          .upsert({ id: nextJobId, user_id: userId, title, job_description: jd, top_x: topX, status: "uploading" }, { onConflict: "id" })
          .select("id")
          .single(),
        JOB_TIMEOUT_MS,
        2,
      );
      activeJobId = job.id;
      setJobId(job.id);

      // 2. Upload + insert candidate rows
      const candidateIds: string[] = [];
      setPhase("uploading");
      setStatusMessage(`Uploading ${files.length} resume${files.length === 1 ? "" : "s"}...`);
      setProgress({ done: 0, total: files.length, failed: 0 });
      let uploadDone = 0;
      let uploadFailed = 0;
      for (const batch of chunk(files, STARTUP_BATCH_SIZE)) {
        const batchResults = await Promise.allSettled(batch.map(async (f) => {
          const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const candidateId = crypto.randomUUID();
          const path = `${userId}/${job.id}/${candidateId}-${safeName}`;

          await retryTask(
            `upload ${f.name}`,
            async () => {
              const { error } = await supabase.storage.from("screening-resumes").upload(path, f, { upsert: true });
              if (error) throw error;
            },
            UPLOAD_TIMEOUT_MS,
            2,
          );

          const candidate = await expectSingle<{ id: string }>(
            `create candidate for ${f.name}`,
            async () => await supabase
              .from("screening_candidates")
              .upsert({
                id: candidateId,
                job_id: job.id,
                user_id: userId,
                candidate_name: f.name.replace(/\.[^.]+$/, ""),
                resume_path: path,
                parse_status: "pending",
              }, { onConflict: "id" })
              .select("id")
              .single(),
            DB_TIMEOUT_MS,
            2,
          );

          return candidate.id;
        }));

        for (const result of batchResults) {
          uploadDone += 1;
          if (result.status === "fulfilled") {
            candidateIds.push(result.value);
          } else {
            uploadFailed += 1;
            console.error("resume startup failed", result.reason);
          }
          setProgress({ done: uploadDone, total: files.length, failed: uploadFailed });
        }
      }

      if (candidateIds.length === 0) throw new Error("No resumes were uploaded successfully");
      await refreshCandidates(job.id);

      // 3. Parse resumes (parallel batches, never block on a single one)
      setPhase("parsing");
      setStatusMessage(`Parsing ${candidateIds.length} candidate resume${candidateIds.length === 1 ? "" : "s"}...`);
      await updateJobStatus(job.id, "parsing");
      setProgress({ done: 0, total: candidateIds.length, failed: 0 });
      let parseDone = 0;
      let parseFailed = 0;
      for (const batch of chunk(candidateIds, PARSE_BATCH_SIZE)) {
        await Promise.allSettled(batch.map((id) =>
          invokeWithTimeout("parse-resume", { candidateId: id }, PARSE_TIMEOUT_MS).catch((e) => {
            console.error("parse failed", id, e);
            parseFailed += 1;
            // mark as failed so scoring step skips gracefully
            return supabase.from("screening_candidates")
              .update({ parse_status: "failed" }).eq("id", id);
          })
        ));
        parseDone += batch.length;
        setProgress({ done: parseDone, total: candidateIds.length, failed: parseFailed });
      }

      // 4. Score (parallel batches of 3, with timeout per call)
      setPhase("scoring");
      setStatusMessage(`Scoring ${candidateIds.length} candidate${candidateIds.length === 1 ? "" : "s"}...`);
      await updateJobStatus(job.id, "scoring");
      setProgress({ done: 0, total: candidateIds.length, failed: 0 });
      let scoreDone = 0;
      let scoreFailed = 0;
      for (const batch of chunk(candidateIds, SCORE_BATCH_SIZE)) {
        await Promise.allSettled(batch.map((id) =>
          invokeWithTimeout("screen-candidate", { candidateId: id }, SCORE_TIMEOUT_MS).catch((e) => {
            console.error("score failed", id, e);
            scoreFailed += 1;
            return supabase.from("screening_candidates")
              .update({ score: 0, reasons: ["Scoring failed (timeout or error)"] })
              .eq("id", id);
          })
        ));
        scoreDone += batch.length;
        setProgress({ done: scoreDone, total: candidateIds.length, failed: scoreFailed });
      }

      // 5. Finalize ranking
      setPhase("ranking");
      setStatusMessage("Ranking candidates and building shortlist...");
      await invokeWithTimeout("finalize-screening", { jobId: job.id }, FINALIZE_TIMEOUT_MS)
        .catch((e) => { console.error("finalize failed", e); });
      await refreshCandidates(job.id);
      setPhase("completed");
      setStatusMessage(`Completed. Ranked ${candidateIds.length} candidate${candidateIds.length === 1 ? "" : "s"}.`);
      toast.success("Screening complete");
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : "Screening failed";
      setPhase("failed");
      setRunError(message);
      setStatusMessage("Screening stopped before processing could finish.");
      if (activeJobId) await updateJobStatus(activeJobId, "draft");
      toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  // Wrap supabase.functions.invoke with a hard timeout so a single hanging call can't freeze the flow.
  async function invokeWithTimeout(name: string, body: unknown, ms: number) {
    return await Promise.race([
      supabase.functions.invoke(name, { body }).then((res) => {
        if (res.error) throw res.error;
        return res.data;
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${name} timeout`)), ms)),
    ]);
  }

  async function updateJobStatus(id: string, status: string) {
    try {
      await retryTask(
        `update job status to ${status}`,
        async () => {
          const { error } = await supabase.from("screening_jobs").update({ status }).eq("id", id);
          if (error) throw error;
        },
        DB_TIMEOUT_MS,
        1,
      );
    } catch (error) {
      console.error("job status update failed", id, status, error);
    }
  }

  async function expectSingle<T>(
    label: string,
    task: () => Promise<{ data: T | null; error: { message?: string } | null }>,
    timeoutMs: number,
    retries = 1,
  ): Promise<T> {
    return retryTask(label, async () => {
      const { data, error } = await task();
      if (error || !data) throw new Error(error?.message ?? `${label} failed`);
      return data;
    }, timeoutMs, retries);
  }

  async function retryTask<T>(label: string, task: () => Promise<T>, timeoutMs: number, retries = 1): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await Promise.race([
          task(),
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs)),
        ]);
      } catch (error) {
        lastError = error;
        if (attempt === retries) break;
        setStatusMessage(`${label} retrying (${attempt + 1}/${retries})...`);
        await sleep(1200 * (attempt + 1));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
  }

  const sendInvite = async (c: Candidate) => {
    if (!userId) return;
    let interviewId = c.interview_id;
    if (!interviewId) {
      const { data, error } = await supabase
        .from("interviews")
        .insert({
          user_id: userId,
          full_name: c.candidate_name || "Candidate",
          role: title || "Role",
          experience_level: "mid",
          status: "invited",
          screening_candidate_id: c.id,
        })
        .select("id").single();
      if (error || !data) return toast.error(error?.message ?? "Invite failed");
      interviewId = data.id;
      await supabase.from("screening_candidates")
        .update({ interview_id: interviewId, invite_status: "sent" })
        .eq("id", c.id);
    }
    const link = `${window.location.origin}/interview/${interviewId}`;
    await navigator.clipboard.writeText(link);
    toast.success("Interview link copied", { description: link });
  };

  const updateTopX = async (newTopX: number) => {
    if (!jobId) { setTopX(newTopX); return; }
    setTopX(newTopX);
    await updateJobStatus(jobId, phase === "completed" ? "ranking" : "draft");
    await retryTask(
      "update shortlist size",
      async () => {
        const { error } = await supabase.from("screening_jobs").update({ top_x: newTopX }).eq("id", jobId);
        if (error) throw error;
      },
      DB_TIMEOUT_MS,
      1,
    );
    await invokeWithTimeout("finalize-screening", { jobId }, FINALIZE_TIMEOUT_MS);
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background grain">
        <TopNav />
        <div className="container py-32 flex items-center justify-center">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!isRecruiter) {
    return (
      <div className="min-h-screen bg-background grain">
        <TopNav />
        <div className="container py-24 max-w-xl">
          <Card className="p-8 text-center space-y-4">
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
            <h1 className="font-display text-2xl">Recruiter access required</h1>
            <p className="text-sm text-muted-foreground">
              Bulk screening is available to recruiters and admins. Grant yourself recruiter access to continue.
            </p>
            <Button onClick={grantRecruiter} disabled={grantingRole} className="rounded-full">
              {grantingRole ? <Loader2 className="animate-spin" /> : "Grant me recruiter access"}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const shortlistedCount = candidates.filter((c) => c.shortlisted).length;

  return (
    <div className="min-h-screen bg-background grain">
      <TopNav />
      <main className="container py-12 space-y-10 max-w-6xl">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" /> Bulk Resume Screening
          </div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight text-gradient">
            Screen hundreds. Shortlist the best.
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Upload resumes, paste a job description, and let AI rank every candidate against your criteria.
          </p>
        </motion.div>

        {/* Setup form */}
        <Card className="p-6 md:p-8 space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="title">Role title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Senior Frontend Engineer" disabled={running} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topx">Shortlist size (top X)</Label>
              <Input id="topx" type="number" min={1} value={topX}
                onChange={(e) => updateTopX(parseInt(e.target.value || "1"))} disabled={running} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="jd">Job description</Label>
            <Textarea id="jd" value={jd} onChange={(e) => setJd(e.target.value)} rows={6}
              placeholder="Paste the full JD: responsibilities, required skills, experience, nice-to-haves…"
              disabled={running} />
          </div>

          <div className="space-y-3">
            <Label>Resumes ({files.length})</Label>
            <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-border/80 rounded-xl py-10 cursor-pointer hover:bg-muted/40 transition-colors">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Click to upload PDF, DOCX, TXT or MD</span>
              <input type="file" multiple accept=".pdf,.docx,.txt,.md" className="hidden"
                onChange={(e) => onFiles(e.target.files)} disabled={running} />
            </label>
            {files.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate flex-1">{f.name}</span>
                    {!running && (
                      <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              {running ? (
                <div className="space-y-1">
                  <div>
                    {phase === "creating" && "Creating screening job"}
                    {phase === "uploading" && "Uploading resumes"}
                    {phase === "parsing" && "Parsing resumes"}
                    {phase === "scoring" && "Scoring candidates"}
                    {phase === "ranking" && "Ranking candidates"}
                    {progress.total > 0 ? ` · ${progress.done}/${progress.total}` : ""}
                    {progress.failed > 0 ? ` · ${progress.failed} failed` : ""}
                  </div>
                  {statusMessage && <div className="text-xs text-muted-foreground/80">{statusMessage}</div>}
                </div>
              ) : phase === "completed" ? (
                <span className="text-primary">Completed · {candidates.length} candidates ranked</span>
              ) : phase === "failed" && runError ? (
                <span className="text-destructive">{runError}</span>
              ) : (
                <span>{files.length} resume(s) · top {topX} will be shortlisted</span>
              )}
            </div>
            <Button onClick={startScreening} disabled={running} size="lg" className="rounded-full shadow-glow">
              {running ? <><Loader2 className="animate-spin" /> Screening…</> : <><Sparkles /> Start screening</>}
            </Button>
          </div>
          {running && (
            <Progress value={progress.total > 0 ? (progress.done / progress.total) * 100 : 8} />
          )}
          {!running && runError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {runError}
            </div>
          )}
        </Card>

        {/* Results */}
        {candidates.length > 0 && (
          <Card className="p-6 md:p-8 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl flex items-center gap-2">
                  <Trophy className="text-primary" /> Ranked candidates
                </h2>
                <p className="text-sm text-muted-foreground">
                  {shortlistedCount} shortlisted of {candidates.length}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Reasons</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((c) => (
                    <TableRow key={c.id} className={c.shortlisted ? "bg-primary/5" : ""}>
                      <TableCell className="font-mono text-muted-foreground">{c.rank ?? "—"}</TableCell>
                      <TableCell>
                        <div className="font-medium">{c.candidate_name || "Unknown"}</div>
                        {c.candidate_email && (
                          <div className="text-xs text-muted-foreground">{c.candidate_email}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.score != null ? (
                          <span className="font-mono text-lg">{Math.round(c.score)}</span>
                        ) : c.parse_status === "failed" ? (
                          <Badge variant="destructive">Parse failed</Badge>
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="max-w-md">
                        {c.reasons && c.reasons.length > 0 ? (
                          <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
                            {c.reasons.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.shortlisted && <Badge className="bg-primary text-primary-foreground">Shortlisted</Badge>}
                        {c.invite_status === "sent" && <Badge variant="secondary" className="ml-1">Invited</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant={c.shortlisted ? "default" : "outline"}
                          onClick={() => sendInvite(c)} disabled={c.score == null}>
                          <Mail className="h-3 w-3" />
                          {c.invite_status === "sent" ? "Copy link" : "Invite"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default Screen;
