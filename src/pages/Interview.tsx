import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mic, MicOff, PhoneOff, Loader2, Volume2 } from "lucide-react";

type Question = { id: number; category: string; question: string };
type Turn = { question: string; category?: string; answer: string };

// Web Speech API typing
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

const Interview = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [meta, setMeta] = useState<{ fullName: string; role: string; experienceLevel: string } | null>(null);
  const [idx, setIdx] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [interimAnswer, setInterimAnswer] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loadingInit, setLoadingInit] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  // Load interview
  useEffect(() => {
    if (!id) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
        return;
      }
      supabase.from("interviews").select("*").eq("id", id).maybeSingle().then(({ data, error }) => {
        if (error || !data) {
          toast.error("Interview not found");
          navigate("/setup");
          return;
        }
        setQuestions((data.questions as any) || []);
        setMeta({ fullName: data.full_name, role: data.role, experienceLevel: data.experience_level });
        setLoadingInit(false);
      });
    });
  }, [id, navigate]);

  // Webcam
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e) {
        toast.error("Camera/mic permission required");
      }
    })();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Timer
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Speech recognition setup
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";

    r.onresult = (event: any) => {
      let interim = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalChunk += transcript + " ";
        else interim += transcript;
      }
      if (finalChunk) setCurrentAnswer((prev) => (prev + " " + finalChunk).trim());
      setInterimAnswer(interim);
    };
    r.onerror = (e: any) => {
      console.warn("SR error", e.error);
      if (e.error === "not-allowed") toast.error("Microphone blocked");
    };
    r.onend = () => setListening(false);

    recognitionRef.current = r;
    return () => {
      try { r.stop(); } catch {}
    };
  }, []);

  // TTS for current question
  const speakQuestion = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => /Google US English|Samantha|Daniel|en-US/i.test(v.name + v.lang));
    if (preferred) u.voice = preferred;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  // Auto-speak first question once loaded
  useEffect(() => {
    if (loadingInit || startedRef.current || questions.length === 0) return;
    startedRef.current = true;
    setTimeout(() => speakQuestion(questions[0].question), 600);
  }, [loadingInit, questions]);

  const toggleMic = () => {
    if (!recognitionRef.current) {
      toast.error("Speech recognition not supported in this browser. Use Chrome/Edge.");
      return;
    }
    if (listening) {
      try { recognitionRef.current.stop(); } catch {}
      setListening(false);
    } else {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
      setInterimAnswer("");
      try {
        recognitionRef.current.start();
        setListening(true);
      } catch (e) {
        console.warn(e);
      }
    }
  };

  const submitAnswer = () => {
    if (listening) {
      try { recognitionRef.current?.stop(); } catch {}
      setListening(false);
    }
    const q = questions[idx];
    const finalAnswer = (currentAnswer + " " + interimAnswer).trim();
    const newTurns = [...turns, { question: q.question, category: q.category, answer: finalAnswer }];
    setTurns(newTurns);
    setCurrentAnswer("");
    setInterimAnswer("");

    if (idx + 1 >= questions.length) {
      finishInterview(newTurns);
    } else {
      const next = idx + 1;
      setIdx(next);
      setTimeout(() => speakQuestion(questions[next].question), 400);
    }
  };

  const finishInterview = async (finalTurns: Turn[]) => {
    if (!id || !meta) return;
    setSubmitting(true);
    try {
      window.speechSynthesis?.cancel();
      streamRef.current?.getTracks().forEach((t) => t.stop());

      const { data, error } = await supabase.functions.invoke("evaluate-interview", {
        body: {
          fullName: meta.fullName,
          role: meta.role,
          experienceLevel: meta.experienceLevel,
          transcript: finalTurns,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await supabase.from("interviews").update({
        transcript: finalTurns,
        scores: data.scores,
        recommendation: data.recommendation,
        strengths: data.strengths,
        improvements: data.improvements,
        resume_data: { ...(meta as any), summary: data.summary },
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", id);

      navigate(`/report/${id}`);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message ?? "Failed to evaluate");
      setSubmitting(false);
    }
  };

  const endEarly = () => {
    if (!confirm("End interview now? Your report will be generated from answers so far.")) return;
    finishInterview(turns);
  };

  // Auto-scroll transcript
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, currentAnswer, interimAnswer, idx]);

  const currentQuestion = questions[idx];
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  if (loadingInit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background grain">
        <div className="absolute inset-0 bg-gradient-hero" />
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative text-center">
          <div className="h-16 w-16 rounded-3xl bg-gradient-glow shadow-glow mx-auto flex items-center justify-center mb-6">
            <Loader2 className="h-7 w-7 animate-spin text-primary-foreground" />
          </div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Generating your report</h2>
          <p className="text-muted-foreground mt-2">Scoring technical, communication, confidence and problem solving…</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border/60 backdrop-blur-xl bg-background/60 sticky top-0 z-10">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
            </span>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Recording</span>
            <span className="text-xs text-muted-foreground tabular-nums ml-2">{mm}:{ss}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Question <span className="text-foreground font-medium">{idx + 1}</span> / {questions.length}
          </div>
          <Button variant="destructive" size="sm" onClick={endEarly} className="rounded-full">
            <PhoneOff className="h-4 w-4 mr-1.5" />
            End
          </Button>
        </div>
      </header>

      {/* Split layout */}
      <main className="flex-1 grid lg:grid-cols-2 gap-px bg-border/60">
        {/* Left: video */}
        <div className="bg-background p-4 md:p-6 flex flex-col">
          <div className="relative flex-1 rounded-3xl overflow-hidden bg-black border border-border/60 min-h-[320px]">
            <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover [transform:scaleX(-1)]" />
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest bg-black/60 text-white backdrop-blur-md border border-white/10">
                {meta?.fullName}
              </span>
            </div>
            {speaking && (
              <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 text-white backdrop-blur-md border border-white/10 text-xs">
                <Volume2 className="h-3.5 w-3.5 animate-pulse" />
                AI speaking…
              </div>
            )}
            {listening && (
              <div className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive/80 text-white backdrop-blur-md text-xs animate-pulse-ring">
                <Mic className="h-3.5 w-3.5" />
                Listening
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              size="lg"
              variant={listening ? "destructive" : "default"}
              onClick={toggleMic}
              className="rounded-full h-14 w-14 p-0 shadow-glow"
            >
              {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
            <Button size="lg" onClick={submitAnswer} variant="outline" className="rounded-full">
              {idx + 1 >= questions.length ? "Submit & Finish" : "Submit answer"}
            </Button>
          </div>
        </div>

        {/* Right: transcript */}
        <div className="bg-background p-4 md:p-6 flex flex-col min-h-[400px]">
          <div className="rounded-3xl glass flex-1 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Live transcript</p>
                <p className="text-sm font-medium mt-0.5">{meta?.role} · {meta?.experienceLevel}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => currentQuestion && speakQuestion(currentQuestion.question)}>
                <Volume2 className="h-4 w-4 mr-1.5" />
                Replay
              </Button>
            </div>

            <div ref={transcriptRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {turns.map((t, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">AI · Q{i + 1}</div>
                  <div className="text-sm">{t.question}</div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground pt-2">You</div>
                  <div className="text-sm text-muted-foreground italic">{t.answer || "(no answer)"}</div>
                </motion.div>
              ))}

              <AnimatePresence mode="wait">
                {currentQuestion && (
                  <motion.div key={`live-${idx}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                    <div className="text-xs uppercase tracking-widest text-primary">AI · Q{idx + 1}</div>
                    <div className="text-base font-medium">{currentQuestion.question}</div>
                    {(currentAnswer || interimAnswer) && (
                      <>
                        <div className="text-xs uppercase tracking-widest text-muted-foreground pt-2">You (live)</div>
                        <div className="text-sm">
                          {currentAnswer}{" "}
                          <span className="text-muted-foreground">{interimAnswer}</span>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Interview;
