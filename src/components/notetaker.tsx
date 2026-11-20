"use client";
import { useState } from "react";
import { Mic, Loader2, Upload } from "lucide-react";
import { AIPanel } from "@/components/ai-panel";

/*
  NOTETAKER — upload a meeting recording; Cortex transcribes it (Gemini audio),
  then the Meeting Assistant below writes minutes, decisions and actions from
  the transcript. Or paste a transcript as before.
*/
export function MeetingNotetaker() {
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");

  async function go() {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("consent", consent ? "1" : "0");
      const j = await (await fetch("/api/meetings/transcribe", { method: "POST", body: fd })).json();
      if (!j.ok) { setMsg(j.error || "Could not transcribe."); return; }
      setTranscript(j.transcript); setMsg("Transcript ready below — press “Generate minutes & actions”.");
    } catch { setMsg("Could not reach Cortex. Try again."); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 font-medium text-sm"><Mic className="h-4 w-4 text-primary" /> Notetaker — upload a recording</div>
        <p className="text-xs text-muted-foreground">MP3, M4A, WAV, WEBM, OGG or FLAC, up to 18 MB (about 30–40 minutes). Speakers are labelled, Hindi and Hinglish are kept as spoken. The recording is not stored. Costs one meeting analysis; refunded if no transcript comes back.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-md border px-3 h-9 text-sm cursor-pointer hover:bg-accent">
            <Upload className="h-4 w-4" /> {file ? file.name : "Choose audio"}
            <input type="file" accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg,.flac" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <button onClick={go} disabled={!file || !consent || busy} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 h-9 text-sm font-medium disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />} Transcribe
          </button>
        </div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
          I understand the audio is sent to the AI provider (Google Gemini) as it is. Unlike text, names in a recording cannot be masked first.
        </label>
        {msg && <p className="text-xs" role="status">{msg}</p>}
      </div>
      <AIPanel mode="meeting" saveMode="meeting" multiline seed={transcript}
        placeholder="Paste a meeting transcript or rough notes — or transcribe a recording above. The AI writes minutes, decisions and assigned action items."
        cta="Generate minutes & actions" />
    </div>
  );
}
