import React, { useState } from "react";
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Upload, 
  FileAudio, 
  CheckCircle2, 
  Loader2, 
  Mail, 
  ListTodo, 
  FileText,
  Sparkles,
  Plus,
  BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";

interface ProcessResult {
  summary: string;
  actionItems: string[];
  followUpEmail: string;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [template, setTemplate] = useState("standard");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<any[]>([]);

  const fetchHistory = React.useCallback(async () => {
    try {
      const res = await fetch("/api/meetings");
      const result = await res.json();
      if (result.error) {
        setHistory([]);
      } else {
        setHistory(result.data || []);
      }
    } catch (e) {
      console.error("Failed to fetch history:", e);
    }
  }, []);

  React.useEffect(() => {
    fetchHistory();
  }, []);

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setProgress(0);
    setIsProcessing(false);
  };

  const extractJson = (text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        try {
          return JSON.parse(match[1]);
        } catch {
          return null;
        }
      }
      return null;
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(",")[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleProcess = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgress(5);
    setResult(null);

    try {
      // 1. Validate API Key
      const apiKey = process.env.GEMINI_API_KEY;
      
      // On Vercel, if the build-time env var is missing, process.env.GEMINI_API_KEY 
      // might be literal undefined or the string "undefined" after Vite's define replacement.
      if (!apiKey || apiKey === "undefined") {
        throw new Error(
          "Gemini API key is not configured in this deployment. " + 
          "On Vercel, please add GEMINI_API_KEY to your Project Settings and redeploy."
        );
      }

      // 2. Check file size
      if (file.size > 100 * 1024 * 1024) {
        throw new Error("Audio file is too large (>100MB). Current capacity is 100MB.");
      }

      setProgress(10);
      const base64Data = await fileToBase64(file);
      setProgress(30);

      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: [
          {
            parts: [
              {
                text: "Analyze this meeting audio carefully. Provide a concise executive summary, a clear list of action items, and a professional follow-up email draft. Return everything in structured JSON format.",
              },
              {
                inlineData: {
                  mimeType: file.type || "audio/mpeg",
                  data: base64Data,
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              actionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
              followUpEmail: { type: Type.STRING },
            },
            required: ["summary", "actionItems", "followUpEmail"],
          },
        },
      });

      const responseText = response.text;
      if (!responseText) throw new Error("Empty response from Gemini");

      const resultData = extractJson(responseText);
      if (!resultData) {
        console.error("Failed to parse JSON from AI response:", responseText);
        throw new Error("Invalid output format from AI");
      }

      setResult(resultData);
      setProgress(80);

      // Save to server
      const saveRes = await fetch("/api/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...resultData,
          template,
          originalName: file.name,
        }),
      });

      const saveData = await saveRes.json();
      setProgress(100);
      
      if (saveData.dbError) {
        toast.success("Meeting analyzed successfully!");
      } else {
        toast.success("Meeting processed and saved!");
      }
      
      fetchHistory();
    } catch (error: any) {
      console.error("Processing failed:", error);
      toast.error(error.message || "Failed to process meeting. Please check your Gemini API key.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#09090b] text-[#fafafa] font-sans overflow-hidden">
      <Toaster position="top-center" />
      
      {/* Navigation */}
      <nav className="h-14 flex items-center justify-between px-6 border-b border-zinc-800 bg-zinc-950/80 shrink-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white tracking-tighter">E</div>
          <span className="text-lg font-semibold tracking-tight">EchoScribe</span>
          <div className="h-4 w-[1px] bg-zinc-800 mx-2"></div>
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">v1.1.0-alpha</span>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            Google AI Studio Connected
          </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-zinc-800 bg-zinc-950/40 p-4 flex flex-col gap-6 shrink-0 h-full overflow-y-auto no-scrollbar">
          <div className="space-y-1">
            <Button 
              onClick={handleReset}
              className="w-full flex items-center justify-start gap-3 px-3 py-2 rounded-md bg-indigo-600/10 text-indigo-400 font-medium text-sm hover:bg-indigo-600/20 border-none shadow-none"
            >
              <Plus className="w-4 h-4" />
              Create New
            </Button>
            <Button variant="ghost" className="w-full flex items-center justify-start gap-3 px-3 py-2 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors text-sm font-normal">
              <BookOpen className="w-4 h-4" />
              Template Library
            </Button>
          </div>

          <div>
            <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-600 mb-3 px-3">Meeting History</h3>
            <div className="space-y-2">
              {history.length > 0 ? (
                history.map((meeting) => (
                  <div 
                    key={meeting.id}
                    onClick={() => {
                      const actionItemsRaw = typeof meeting.action_items === 'string' ? JSON.parse(meeting.action_items) : meeting.action_items;
                      setResult({
                        summary: meeting.summary || "",
                        actionItems: Array.isArray(actionItemsRaw) ? actionItemsRaw : [],
                        followUpEmail: meeting.follow_up_email || ""
                      });
                      setFile(null); // Clear active upload view
                    }}
                    className="p-3 rounded-lg border border-zinc-800/50 bg-zinc-900/20 cursor-pointer hover:border-zinc-700 transition-all group"
                  >
                    <p className="text-sm font-medium truncate group-hover:text-indigo-400 transition-colors">
                      {meeting.metadata?.originalName || "Untitled Meeting"}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider font-mono">
                      {new Date(meeting.created_at).toLocaleDateString()} • {meeting.metadata?.template || "Std"}
                    </p>
                  </div>
                ))
              ) : (
                <div className="px-3 py-6 text-center border border-dashed border-zinc-900 rounded-lg">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest leading-loose">No history<br/>available</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-auto pt-4 border-t border-zinc-900">
            <div className="p-3 rounded-xl bg-indigo-600/5 border border-indigo-500/10 mb-4">
              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Quota Usage</p>
              <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                <div className="h-full w-1/3 bg-indigo-500"></div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col p-8 gap-8 overflow-hidden bg-[#09090b]">
            <div className="flex items-start justify-between shrink-0">
              <div className="space-y-1">
                <h1 className="text-3xl font-bold tracking-tight text-white">Turn Audio into Insights</h1>
                <p className="text-zinc-500 text-sm">Upload your meeting recording to get a summary, action items, and an email draft instantly.</p>
              </div>
              <div className="flex items-center gap-1 bg-zinc-900/50 border border-zinc-800 p-1 rounded-lg shrink-0">
                {['Standard', 'Technical', 'Executive'].map((t) => (
                   <button 
                    key={t}
                    onClick={() => setTemplate(t.toLowerCase())}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${template === t.toLowerCase() ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                   >
                     {t}
                   </button>
                ))}
              </div>
            </div>

            <div className="flex gap-8 flex-1 overflow-hidden min-h-0">
              {/* Left Column: Actions */}
              <div className="flex-1 flex flex-col gap-6 min-w-0">
                <div 
                  className={`flex-1 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-12 text-center group transition-all cursor-pointer accent-glow
                    ${file ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-zinc-800 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/40'}`}
                  onClick={() => document.getElementById('audio-upload')?.click()}
                >
                  <input 
                    id="audio-upload"
                    type="file" 
                    accept="audio/*" 
                    className="hidden" 
                    onChange={handleFileChange}
                  />
                  
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110 shadow-xl
                    ${file ? 'bg-indigo-600 ring-4 ring-indigo-500/20 shadow-indigo-500/20' : 'bg-zinc-900 border border-zinc-800'}`}>
                    <FileAudio className={`w-8 h-8 ${file ? 'text-white' : 'text-indigo-400'}`} />
                  </div>
                  
                  {file ? (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                      <p className="text-white font-medium truncate max-w-xs mx-auto">{file.name}</p>
                      <p className={`text-xs mt-1 uppercase tracking-widest font-mono ${file.size > 100 * 1024 * 1024 ? 'text-red-400 animate-pulse' : 'text-zinc-500'}`}>
                        {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.size > 100 * 1024 * 1024 ? 'TOO LARGE' : 'READY TO ANALYZE'}
                      </p>
                    </motion.div>
                  ) : (
                    <>
                      <p className="text-zinc-200 font-medium">Drop your recording here</p>
                      <p className="text-zinc-500 text-sm mt-1">WAV, MP3, or AAC up to 100MB</p>
                    </>
                  )}
                  
                  <div className="mt-6 px-6 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-full hover:bg-indigo-500 transition-colors">
                    {file ? 'Change File' : 'Browse Files'}
                  </div>
                </div>

                <div className="p-5 rounded-xl glass border-zinc-800 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center text-[10px] text-zinc-500 font-mono ring-1 ring-zinc-800">AI</div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">AI Analysis Ready</p>
                      <p className="text-xs text-zinc-500">Powered by Google Gemini 3 for high-accuracy results.</p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost"
                    size="sm"
                    className="bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 text-[10px] font-bold uppercase tracking-widest px-4 h-8"
                    onClick={handleProcess}
                    disabled={!file || isProcessing}
                  >
                    {isProcessing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      'Start Analysis'
                    )}
                  </Button>
                </div>
              </div>

              {/* Right Column: Preview/Results */}
              <div className="w-[420px] flex flex-col gap-4 overflow-hidden shrink-0">
                <div className="flex-1 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-6 flex flex-col overflow-hidden glass">
                  <div className="flex items-center justify-between mb-6 shrink-0">
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Meeting Insights</h2>
                    <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-indigo-500 animate-pulse' : 'bg-zinc-800'}`}></div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 min-h-0">
                    <AnimatePresence mode="wait">
                      {isProcessing ? (
                        <motion.div 
                          initial={{ opacity: 0 }} 
                          animate={{ opacity: 1 }} 
                          exit={{ opacity: 0 }}
                          className="space-y-8 opacity-40 py-4"
                        >
                          <div className="space-y-3">
                            <label className="text-[10px] text-indigo-400 font-bold uppercase tracking-[0.2em]">Summary</label>
                            <div className="h-4 w-full bg-zinc-900 rounded-sm animate-pulse-slow"></div>
                            <div className="h-4 w-4/5 bg-zinc-900 rounded-sm animate-pulse-slow"></div>
                          </div>
                          <div className="space-y-4">
                            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em]">Action Items</label>
                            {[1, 2].map((i) => (
                              <div key={i} className="flex items-center gap-3">
                                <div className="w-3 h-3 border border-zinc-800 rounded-sm bg-zinc-900/50"></div>
                                <div className="h-2 w-3/4 bg-zinc-900 rounded-sm"></div>
                              </div>
                            ))}
                          </div>
                          <Progress value={progress} className="h-1 bg-zinc-900 rounded-full overflow-hidden" />
                        </motion.div>
                      ) : result ? (
                        <motion.div 
                          initial={{ opacity: 0, x: 20 }} 
                          animate={{ opacity: 1, x: 0 }}
                          className="space-y-8 pb-4"
                        >
                          <div className="space-y-3">
                            <label className="text-[10px] text-indigo-400 font-bold uppercase tracking-[0.2em]">Executive Summary</label>
                            <p className="text-zinc-300 text-sm leading-relaxed">{result.summary}</p>
                          </div>
                          <div className="space-y-3">
                            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em]">Action Items</label>
                            <ul className="space-y-3">
                              {result.actionItems.map((item, idx) => (
                                <li key={idx} className="flex gap-3 text-sm text-zinc-400 items-start">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em]">Follow-up Draft</label>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 px-2 text-[9px] uppercase tracking-widest text-zinc-600 hover:text-white"
                                onClick={() => {
                                  navigator.clipboard.writeText(result.followUpEmail);
                                  toast.success("Copied to clipboard");
                                }}
                              >
                                Copy Draft
                              </Button>
                            </div>
                            <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 font-mono text-[11px] text-zinc-400 whitespace-pre-wrap leading-relaxed">
                              {result.followUpEmail}
                            </div>
                          </div>
                        </motion.div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-30 grayscale pointer-events-none">
                           <FileAudio className="w-12 h-12 mb-4 text-zinc-600" />
                           <p className="text-xs italic text-zinc-600 uppercase tracking-widest font-mono font-bold leading-relaxed"> Your meeting insights will <br /> appear here once you <br /> start the analysis </p>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>
        </main>
      </div>
    </div>
  );
}

