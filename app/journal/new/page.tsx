"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, addDoc } from "firebase/firestore";
import { auth, db } from "@/firebase";

const MOOD_PALETTES: Record<string, { accentText: string; accentBorder: string }> = {
  happy:    { accentText: "text-amber-500", accentBorder: "border-amber-500/30" },
  sad:      { accentText: "text-blue-500", accentBorder: "border-blue-500/30" },
  anxious:  { accentText: "text-rose-500", accentBorder: "border-rose-500/30" },
  grateful: { accentText: "text-green-500", accentBorder: "border-green-500/30" },
  angry:    { accentText: "text-orange-500", accentBorder: "border-orange-500/30" },
  peaceful: { accentText: "text-teal-500", accentBorder: "border-teal-500/30" },
  proud:    { accentText: "text-purple-500", accentBorder: "border-purple-500/30" },
  relieved: { accentText: "text-emerald-500", accentBorder: "border-emerald-500/30" },
  default:  { accentText: "text-muted-foreground", accentBorder: "border-border" },
};

function getMoodPalette(mood: string) {
  const lower = mood?.toLowerCase() ?? "";
  return (
    Object.entries(MOOD_PALETTES).find(([key]) => lower.includes(key))?.[1] ??
    MOOD_PALETTES.default
  );
}

function WordCount({ text }: { text: string }) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const minutes = Math.ceil(words / 200);
  return (
    <span className="text-xs text-muted-foreground font-sans">
      {words} words · {minutes} min read
    </span>
  );
}

function NewJournalContent() {
  const searchParams = useSearchParams();
  const initialContent = searchParams.get("first") || "";

  const [title, setTitle] = useState("");
  const [mood, setMood] = useState("");
  const [content, setContent] = useState(initialContent);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [content]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      setError("You must be logged in to create an entry");
      return;
    }
    if (!title.trim() || !content.trim()) {
      setError("Title and content are required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await addDoc(collection(db, "users", auth.currentUser.uid, "journals"), {
        title,
        mood,
        content,
        userId: auth.currentUser.uid,
        createdAt: Date.now(),
      });
      router.push("/journal");
    } catch (err: any) {
      setError(err.message || "Failed to create entry");
      setLoading(false);
    }
  };

  const palette = getMoodPalette(mood);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex-1 transition-colors duration-500 bg-background text-foreground font-serif"
    >
      <div className="sticky top-14 z-10 backdrop-blur-sm border-b border-border/40 px-6 py-3 flex items-center justify-between bg-background/95">
        <Link
          href="/journal"
          className="text-sm flex items-center gap-1.5 opacity-50 hover:opacity-80 transition-opacity font-sans"
        >
          ← Cancel
        </Link>
        <WordCount text={content} />
        <button
          type="submit"
          disabled={loading}
          className="text-sm px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium transition-opacity hover:opacity-90 disabled:opacity-50 font-sans"
        >
          {loading ? "Writing…" : "Finish"}
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12 flex flex-col min-h-[85vh]">
        {error && (
          <p className="text-sm text-destructive mb-6 font-sans">{error}</p>
        )}

        <div className="mb-8">
          <input
            type="text"
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            placeholder="How are you feeling?"
            className={`text-sm px-3 py-1.5 rounded-full border bg-muted/20 outline-none focus:ring-2 transition-all w-2/3 md:w-auto font-sans focus:ring-primary/20 ${palette.accentText} ${palette.accentBorder}`}
          />
        </div>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give this entry a title…"
          className="w-full bg-transparent outline-none text-4xl mb-8 font-light tracking-tight placeholder-muted-foreground/30 font-serif"
        />

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's on your mind today?"
          className="w-full bg-transparent outline-none resize-none text-lg leading-[1.9] overflow-hidden flex-grow placeholder-muted-foreground/30 font-serif"
          style={{ minHeight: "400px" }}
        />
      </div>
    </form>
  );
}

export default function NewJournalEntryPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary/60 animate-spin" />
        </div>
      </div>
    }>
      <NewJournalContent />
    </Suspense>
  )
}
