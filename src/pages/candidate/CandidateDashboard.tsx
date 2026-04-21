import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mic, Gauge, History, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type Interview = {
  id: string;
  role: string;
  experience_level: string;
  status: string;
  scores: any;
  created_at: string;
  completed_at: string | null;
};

const CandidateDashboard = () => {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("interviews")
        .select("id,role,experience_level,status,scores,created_at,completed_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(10);
      setInterviews((data ?? []) as Interview[]);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const completed = interviews.filter((i) => i.status === "completed");
    const scores = completed.map((i) => (i.scores as any)?.overall).filter((s) => typeof s === "number");
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    return { total: interviews.length, completed: completed.length, avg };
  }, [interviews]);

  return (
    <div className="container py-10 space-y-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-gradient">Welcome back</h1>
        <p className="text-muted-foreground mt-2">Practice interviews, track your progress, and sharpen your skills.</p>
      </motion.div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="p-5 glass">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Interviews taken</p>
              <p className="mt-2 text-3xl font-display font-semibold">{stats.total}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><Mic className="h-5 w-5 text-primary" /></div>
          </div>
        </Card>
        <Card className="p-5 glass">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Completed</p>
              <p className="mt-2 text-3xl font-display font-semibold">{stats.completed}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><History className="h-5 w-5 text-primary" /></div>
          </div>
        </Card>
        <Card className="p-5 glass">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Average score</p>
              <p className="mt-2 text-3xl font-display font-semibold">{stats.avg ?? "—"}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><Gauge className="h-5 w-5 text-primary" /></div>
          </div>
        </Card>
      </div>

      <Card className="p-6 glass bg-gradient-hero">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Ready for another round?</h2>
            <p className="text-sm text-muted-foreground mt-1">Upload your resume and start a tailored AI interview.</p>
          </div>
          <Link to="/setup">
            <Button size="lg" className="rounded-full shadow-glow">
              Start Interview
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </Card>

      <div>
        <div className="flex items-end justify-between mb-4">
          <h2 className="font-display text-xl font-semibold">Recent interviews</h2>
          <Link to="/history" className="text-sm text-primary hover:underline">View all</Link>
        </div>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && interviews.length === 0 && (
          <Card className="p-10 glass text-center">
            <p className="text-sm text-muted-foreground">No interviews yet. Start your first one above.</p>
          </Card>
        )}
        <div className="grid gap-3">
          {interviews.map((i) => (
            <Card key={i.id} className="p-4 glass flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium truncate">{i.role}</p>
                <p className="text-xs text-muted-foreground">{i.experience_level} · {new Date(i.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant={i.status === "completed" ? "default" : "secondary"} className="capitalize">{i.status.replace("_", " ")}</Badge>
                <span className="text-sm tabular-nums">{(i.scores as any)?.overall ?? "—"}</span>
                {i.status === "completed" && (
                  <Link to={`/report/${i.id}`}>
                    <Button variant="ghost" size="sm">Report <ArrowUpRight className="h-3 w-3" /></Button>
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CandidateDashboard;
