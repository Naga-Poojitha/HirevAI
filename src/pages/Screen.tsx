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
  const [progress, setProgress] = useState({ done: 0, total: 0 });
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
    try {
      // 1. Create job
      const { data: job, error: jerr } = await supabase
        .from("screening_jobs")
        .insert({ user_id: userId, title, job_description: jd, top_x: topX, status: "uploading" })
        .select("id").single();
      if (jerr || !job) throw jerr ?? new Error("job create failed");
      setJobId(job.id);

      // 2. Upload + insert candidate rows
      const candidateIds: string[] = [];
      setProgress({ done: 0, total: files.length });
      for (const f of files) {
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${userId}/${job.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("screening-resumes").upload(path, f, { upsert: false });
        if (upErr) { toast.error(`Upload failed: ${f.name}`); continue; }
        const { data: cand, error: cErr } = await supabase
          .from("screening_candidates")
          .insert({
            job_id: job.id,
            user_id: userId,
            candidate_name: f.name.replace(/\.[^.]+$/, ""),
            resume_path: path,
            parse_status: "pending",
          })
          .select("id").single();
        if (cErr || !cand) continue;
        candidateIds.push(cand.id);
      }
      await refreshCandidates(job.id);

      // 3. Parse resumes (in parallel batches of 4)
      await supabase.from("screening_jobs").update({ status: "parsing" }).eq("id", job.id);
      const batches = chunk(candidateIds, 4);
      let done = 0;
      for (const batch of batches) {
        await Promise.all(batch.map(async (id) => {
          const { error } = await supabase.functions.invoke("parse-resume", { body: { candidateId: id } });
          if (error) console.error("parse error", id, error);
        }));
        done += batch.length;
        setProgress({ done, total: candidateIds.length });
      }

      // 4. Score
      await supabase.from("screening_jobs").update({ status: "scoring" }).eq("id", job.id);
      done = 0;
      setProgress({ done: 0, total: candidateIds.length });
      for (const batch of chunk(candidateIds, 3)) {
        await Promise.all(batch.map(async (id) => {
          const { error } = await supabase.functions.invoke("screen-candidate", { body: { candidateId: id } });
          if (error) console.error("score error", id, error);
        }));
        done += batch.length;
        setProgress({ done, total: candidateIds.length });
      }

      // 5. Finalize ranking
      await supabase.functions.invoke("finalize-screening", { body: { jobId: job.id } });
      await refreshCandidates(job.id);
      toast.success("Screening complete");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Screening failed");
    } finally {
      setRunning(false);
    }
  };

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
    await supabase.from("screening_jobs").update({ top_x: newTopX }).eq("id", jobId);
    await supabase.functions.invoke("finalize-screening", { body: { jobId } });
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
              {running && progress.total > 0 ? (
                <span>Processing {progress.done}/{progress.total}…</span>
              ) : (
                <span>{files.length} resume(s) · top {topX} will be shortlisted</span>
              )}
            </div>
            <Button onClick={startScreening} disabled={running} size="lg" className="rounded-full shadow-glow">
              {running ? <><Loader2 className="animate-spin" /> Screening…</> : <><Sparkles /> Start screening</>}
            </Button>
          </div>
          {running && progress.total > 0 && (
            <Progress value={(progress.done / progress.total) * 100} />
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
