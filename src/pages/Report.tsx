import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/TopNav";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, AlertCircle, Sparkles, ArrowRight } from "lucide-react";

const RECOMMENDATION_MAP: Record<string, { label: string; tone: string }> = {
  strong_hire: { label: "Strong Hire", tone: "bg-success/15 text-success border-success/30" },
  hire: { label: "Hire", tone: "bg-success/10 text-success border-success/30" },
  lean_hire: { label: "Lean Hire", tone: "bg-warning/15 text-warning border-warning/30" },
  no_hire: { label: "No Hire", tone: "bg-destructive/15 text-destructive border-destructive/30" },
};

const Report = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [interview, setInterview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
        return;
      }
      supabase.from("interviews").select("*").eq("id", id).maybeSingle().then(({ data }) => {
        setInterview(data);
        setLoading(false);
      });
    });
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!interview) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <div className="container py-20 text-center">
          <p className="text-muted-foreground">Report not found.</p>
        </div>
      </div>
    );
  }

  const scores = interview.scores || { technical: 0, communication: 0, confidence: 0, problem_solving: 0, overall: 0 };
  const recommendation = RECOMMENDATION_MAP[interview.recommendation] || RECOMMENDATION_MAP.lean_hire;
  const radarData = [
    { axis: "Technical", value: scores.technical },
    { axis: "Communication", value: scores.communication },
    { axis: "Confidence", value: scores.confidence },
    { axis: "Problem Solving", value: scores.problem_solving },
  ];

  return (
    <div className="min-h-screen bg-background grain">
      <TopNav />
      <div className="absolute inset-0 bg-gradient-hero opacity-30 pointer-events-none" />

      <main className="container max-w-5xl py-10 md:py-16 relative">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Interview Report</p>
            <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight mt-1">{interview.full_name}</h1>
            <p className="text-muted-foreground mt-1">{interview.role} · {interview.experience_level}</p>
          </div>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium ${recommendation.tone}`}>
            <Sparkles className="h-4 w-4" />
            {recommendation.label}
          </div>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-4 mt-10">
          {/* Radar */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="md:col-span-2 rounded-3xl glass-strong p-6 md:p-8">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-semibold">Performance breakdown</h2>
              <div className="text-right">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Overall</div>
                <div className="font-display text-3xl font-semibold tabular-nums">{Math.round(scores.overall)}</div>
              </div>
            </div>
            <div className="h-[320px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="75%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Score list */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-3xl glass-strong p-6">
            <h2 className="font-display text-lg font-semibold mb-4">Scores</h2>
            <div className="space-y-4">
              {radarData.map((s) => (
                <div key={s.axis}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-muted-foreground">{s.axis}</span>
                    <span className="tabular-nums font-medium">{Math.round(s.value)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-gradient-glow rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, s.value))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Strengths / Improvements */}
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-3xl glass-strong p-6 md:p-8">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <h2 className="font-display text-lg font-semibold">Strengths</h2>
            </div>
            <ul className="space-y-3">
              {(interview.strengths || []).map((s: string, i: number) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-success mt-2 shrink-0" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="rounded-3xl glass-strong p-6 md:p-8">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="h-5 w-5 text-warning" />
              <h2 className="font-display text-lg font-semibold">Improvements</h2>
            </div>
            <ul className="space-y-3">
              {(interview.improvements || []).map((s: string, i: number) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning mt-2 shrink-0" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        {/* Transcript */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-3xl glass-strong p-6 md:p-8 mt-4">
          <h2 className="font-display text-lg font-semibold mb-4">Transcript</h2>
          <div className="space-y-6">
            {(interview.transcript || []).map((t: any, i: number) => (
              <div key={i} className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Q{i + 1} · {t.category || "general"}</div>
                <div className="text-sm font-medium">{t.question}</div>
                <div className="text-sm text-muted-foreground italic">{t.answer || "(no answer)"}</div>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="mt-10 flex justify-center">
          <Link to="/setup">
            <Button size="lg" className="rounded-full shadow-glow">
              Run another interview
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Report;
