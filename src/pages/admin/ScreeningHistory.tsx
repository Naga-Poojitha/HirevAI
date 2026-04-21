import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { ArrowUpRight } from "lucide-react";

type Job = {
  id: string;
  title: string;
  status: string;
  top_x: number;
  created_at: string;
  candidate_count?: number;
};

const ScreeningHistory = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("screening_jobs")
        .select("id,title,status,top_x,created_at")
        .order("created_at", { ascending: false });

      const jobsList = (data ?? []) as Job[];
      const withCounts = await Promise.all(
        jobsList.map(async (j) => {
          const { count } = await supabase
            .from("screening_candidates")
            .select("*", { count: "exact", head: true })
            .eq("job_id", j.id);
          return { ...j, candidate_count: count ?? 0 };
        }),
      );
      setJobs(withCounts);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Screening History</h1>
        <p className="text-sm text-muted-foreground mt-1">All bulk screening jobs you've run.</p>
      </div>

      <Card className="glass">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job title</TableHead>
                <TableHead>Candidates</TableHead>
                <TableHead>Top X</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">Loading…</TableCell></TableRow>}
              {!loading && jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    No screening jobs yet. <Link to="/screen" className="text-primary underline">Start one</Link>.
                  </TableCell>
                </TableRow>
              )}
              {jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="font-medium">{j.title}</TableCell>
                  <TableCell>{j.candidate_count}</TableCell>
                  <TableCell>{j.top_x}</TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{j.status}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-xs">{new Date(j.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Link to="/screen">
                      <Button variant="ghost" size="sm">Open <ArrowUpRight className="h-3 w-3" /></Button>
                    </Link>
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

export default ScreeningHistory;
