import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { ArrowUpRight } from "lucide-react";

type Interview = {
  id: string;
  role: string;
  experience_level: string;
  status: string;
  scores: any;
  recommendation: string | null;
  created_at: string;
  completed_at: string | null;
};

const MyHistory = () => {
  const [rows, setRows] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("interviews")
        .select("id,role,experience_level,status,scores,recommendation,created_at,completed_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });
      setRows((data ?? []) as Interview[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="container py-10 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">My History</h1>
        <p className="text-sm text-muted-foreground mt-1">Every interview you've taken on HirevAI.</p>
      </div>

      <Card className="glass">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">Loading…</TableCell></TableRow>}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    No interviews yet. <Link to="/setup" className="text-primary underline">Start one</Link>.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.role}</TableCell>
                  <TableCell className="text-muted-foreground">{i.experience_level}</TableCell>
                  <TableCell><Badge variant={i.status === "completed" ? "default" : "secondary"} className="capitalize">{i.status.replace("_", " ")}</Badge></TableCell>
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

export default MyHistory;
