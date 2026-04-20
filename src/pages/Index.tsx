import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, Mic, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/TopNav";

const features = [
  {
    icon: FileText,
    title: "Resume-based questions",
    desc: "Gemini parses your resume and generates context-aware questions for your target role.",
  },
  {
    icon: Mic,
    title: "Voice AI interview",
    desc: "Speak naturally. We transcribe in real-time while the AI conducts the conversation.",
  },
  {
    icon: BarChart3,
    title: "Smart score report",
    desc: "Radar-chart analytics across technical, communication, confidence and problem solving.",
  },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background grain">
      <TopNav />

      <main className="relative">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-hero" />
          <div className="container relative pt-24 pb-32 md:pt-36 md:pb-44">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-3xl mx-auto text-center"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-muted-foreground mb-8">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Powered by Gemini · Voice + Vision
              </div>

              <h1 className="font-display text-5xl md:text-7xl font-semibold tracking-tight text-gradient leading-[1.05]">
                AI-Powered Interview
                <br />
                Preparation & Hiring
                <br />
                Assessment.
              </h1>

              <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
                A real-time voice interviewer that adapts to your resume, scores your performance, and tells you exactly what to improve.
              </p>

              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link to="/auth">
                  <Button size="lg" className="rounded-full shadow-glow group">
                    Start interview
                    <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <Link to="/auth">
                  <Button size="lg" variant="outline" className="rounded-full">
                    Admin portal
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section className="container pb-32">
          <div className="grid md:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="group relative rounded-3xl glass p-7 hover:border-primary/40 transition-colors"
              >
                <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center mb-5 group-hover:bg-primary/10 transition-colors">
                  <f.icon className="h-5 w-5 text-foreground" />
                </div>
                <h3 className="font-display text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      <footer className="container py-10 border-t border-border/60">
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} HirevAI</p>
      </footer>
    </div>
  );
};

export default Index;
