import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Search, ArrowUpRight } from "lucide-react";

type Report = {
  id: string;
  full_name: string;
  role: string;
  experience_level: string;
  status: string;
  scores: any;
  recommendation: string | null;
  completed_at: string | null;
};

const AdminReports = () => {
  const [rows, setRows] = useState<Report[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("interviews")
        .select("id,full_name,role,experience_level,status,scores,recommendation,completed_at")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(200);
      setRows((data ?? []) as Report[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) => r.full_name?.toLowerCase().includes(q) || r.role?.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">Completed interview reports.</p>
      </div>

      <Card className="glass">
        <div className="p-5 border-b border-border/60">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Recommendation</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">Loading…</TableCell></TableRow>}
              {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No reports yet</TableCell></TableRow>}
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.role} · {r.experience_level}</TableCell>
                  <TableCell>{(r.scores as any)?.overall ?? "—"}</TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{r.recommendation ?? "—"}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.completed_at ? new Date(r.completed_at).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Link to={`/report/${r.id}`}>
                      <Button variant="ghost" size="sm">View <ArrowUpRight className="h-3 w-3" /></Button>
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

export default AdminReports;
