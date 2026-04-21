import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";

type Candidate = {
  id: string;
  candidate_name: string | null;
  candidate_email: string | null;
  score: number | null;
  rank: number | null;
  shortlisted: boolean;
  parse_status: string;
  created_at: string;
};

const AdminCandidates = () => {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("screening_candidates")
        .select("id,candidate_name,candidate_email,score,rank,shortlisted,parse_status,created_at")
        .order("score", { ascending: false, nullsFirst: false })
        .limit(200);
      setRows((data ?? []) as Candidate[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) => r.candidate_name?.toLowerCase().includes(q) || r.candidate_email?.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Candidates</h1>
        <p className="text-sm text-muted-foreground mt-1">All screened candidates across your jobs.</p>
      </div>

      <Card className="glass">
        <div className="p-5 border-b border-border/60">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name or email" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Shortlisted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">Loading…</TableCell></TableRow>}
              {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No candidates yet</TableCell></TableRow>}
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.rank ?? "—"}</TableCell>
                  <TableCell className="font-medium">{c.candidate_name ?? "Unnamed"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.candidate_email ?? "—"}</TableCell>
                  <TableCell>{c.score != null ? c.score.toFixed(0) : "—"}</TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{c.parse_status}</Badge></TableCell>
                  <TableCell>{c.shortlisted ? <Badge>Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

export default AdminCandidates;
