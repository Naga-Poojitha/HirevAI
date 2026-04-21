import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, FileCheck2, Gauge, Layers, ArrowUpRight, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

type Interview = {
  id: string;
  full_name: string;
  role: string;
  experience_level: string;
  status: string;
  scores: any;
  created_at: string;
  completed_at: string | null;
};

const StatCard = ({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string | number; hint?: string }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
    <Card className="p-5 glass">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="mt-2 text-3xl font-display font-semibold tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </Card>
  </motion.div>
);

const AdminDashboard = () => {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [candidatesCount, setCandidatesCount] = useState(0);
  const [jobsCount, setJobsCount] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: ints }, { count: ccount }, { count: jcount }] = await Promise.all([
        supabase.from("interviews").select("id,full_name,role,experience_level,status,scores,created_at,completed_at").order("created_at", { ascending: false }).limit(50),
        supabase.from("screening_candidates").select("*", { count: "exact", head: true }),
        supabase.from("screening_jobs").select("*", { count: "exact", head: true }),
      ]);
      setInterviews((ints ?? []) as Interview[]);
      setCandidatesCount(ccount ?? 0);
      setJobsCount(jcount ?? 0);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const completed = interviews.filter((i) => i.status === "completed");
    const scores = completed.map((i) => (i.scores as any)?.overall).filter((s) => typeof s === "number");
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return { total: interviews.length, completed: completed.length, avg };
  }, [interviews]);

  const filtered = useMemo(() => {
    if (!query.trim()) return interviews;
    const q = query.toLowerCase();
    return interviews.filter(
      (i) => i.full_name?.toLowerCase().includes(q) || i.role?.toLowerCase().includes(q) || i.status.toLowerCase().includes(q),
    );
  }, [interviews, query]);

  return (
    <div className="container py-8 space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Live overview of candidates, interviews, and screening activity.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/roles"><Button variant="outline" size="sm">Manage roles</Button></Link>
          <Link to="/screen"><Button size="sm">New screening</Button></Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Screened candidates" value={candidatesCount} hint="across all jobs" />
        <StatCard icon={FileCheck2} label="Interviews completed" value={stats.completed} hint={`${stats.total} total`} />
        <StatCard icon={Gauge} label="Average score" value={stats.avg ? `${stats.avg}` : "—"} hint="out of 100" />
        <StatCard icon={Layers} label="Screening jobs" value={jobsCount} hint="total created" />
      </div>

      <Card className="glass">
        <div className="flex items-center justify-between gap-4 p-5 border-b border-border/60">
          <div>
            <h2 className="font-display text-lg font-semibold">Recent interviews</h2>
            <p className="text-xs text-muted-foreground">Latest 50 interviews across the platform</p>
          </div>
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, role, status" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Loading…</TableCell></TableRow>}
              {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">No interviews yet</TableCell></TableRow>}
              {filtered.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{i.role}</TableCell>
                  <TableCell className="text-muted-foreground">{i.experience_level}</TableCell>
                  <TableCell>
                    <Badge variant={i.status === "completed" ? "default" : "secondary"} className="capitalize">{i.status.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell>{(i.scores as any)?.overall ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{new Date(i.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    {i.status === "completed" && (
                      <Link to={`/report/${i.id}`}>
                        <Button variant="ghost" size="sm">Report <ArrowUpRight className="h-3 w-3" /></Button>
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

export default AdminDashboard;
