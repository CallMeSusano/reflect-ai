"use client";

import { useEffect, useState, use, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
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

interface JournalEntry {
  id: string;
  title: string;
  mood: string;
  content: string;
  userId: string;
  createdAt: number;
}

export default function JournalEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const entryId = resolvedParams.id;

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editMood, setEditMood] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const docRef = doc(db, "users", user.uid, "journals", entryId);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            const createdAtNum = typeof data.createdAt === "number" ? data.createdAt : Date.now();
            const loadedEntry = {
              id: docSnap.id,
              title: data.title || "",
              mood: data.mood || "",
              content: data.content || "",
              userId: data.userId || "",
              createdAt: createdAtNum
            };
            setEntry(loadedEntry);
            setEditTitle(loadedEntry.title);
            setEditMood(loadedEntry.mood);
            setEditContent(loadedEntry.content);
          }
        } catch (err) {
          console.error("Error fetching document:", err);
          setError("Failed to load journal entry");
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [entryId]);

  // Adjust textarea height in edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [isEditing, editContent]);

  const handleUpdate = async () => {
    if (!editTitle.trim() || !editContent.trim()) {
      setError("Title and content cannot be empty.");
      return;
    }

    setSaving(true);
    try {
      const docRef = doc(db, "users", auth.currentUser!.uid, "journals", entryId);
      await updateDoc(docRef, {
        title: editTitle,
        mood: editMood,
        content: editContent,
        updatedAt: Date.now()
      });
      setEntry((prev) => prev ? { ...prev, title: editTitle, mood: editMood, content: editContent } : null);
      setIsEditing(false);
      setError("");
    } catch (err) {
      console.error("Error updating document:", err);
      setError("Failed to update journal entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this entry?")) return;
    
    try {
      const docRef = doc(db, "users", auth.currentUser!.uid, "journals", entryId);
      await deleteDoc(docRef);
      router.push("/journal");
    } catch (err) {
      console.error("Error deleting document:", err);
      setError("Failed to delete journal entry.");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary/60 animate-spin" />
        </div>
      </div>
    );
  }

  if (!entry || (auth.currentUser && entry.userId !== auth.currentUser.uid)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background font-sans">
        <div className="text-center">
          <p className="text-foreground mb-4">Entry not found or unauthorized.</p>
          <Link href="/journal" className="text-sm underline text-muted-foreground">
            Return to journal
          </Link>
        </div>
      </div>
    );
  }

  const palette = getMoodPalette(isEditing ? editMood : entry.mood);
  const formattedDate = new Date(entry.createdAt).toLocaleDateString("en-US", {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="flex-1 transition-colors duration-500 bg-background text-foreground font-serif">
      
      {/* Top Navigation */}
      <div className="sticky top-14 z-10 backdrop-blur-sm border-b border-border/40 px-6 py-3 flex items-center justify-between bg-background/95">
        <Link
          href="/journal"
          className="text-sm flex items-center gap-1.5 opacity-50 hover:opacity-80 transition-opacity font-sans"
        >
          ← Back
        </Link>
        
        <WordCount text={isEditing ? editContent : entry.content} />
        
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="text-sm px-4 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-80 bg-muted/50 text-foreground font-sans"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="text-sm px-4 py-1.5 rounded-lg font-medium transition-opacity hover:bg-destructive/10 text-destructive/70 hover:text-destructive font-sans"
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditTitle(entry.title);
                  setEditMood(entry.mood);
                  setEditContent(entry.content);
                }}
                disabled={saving}
                className="text-sm px-4 py-1.5 rounded-lg opacity-50 hover:opacity-80 transition-opacity font-sans"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={saving}
                className="text-sm px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium transition-opacity hover:opacity-90 disabled:opacity-50 font-sans"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12 flex flex-col min-h-[85vh]">
        {error && (
          <p className="text-sm text-destructive mb-6 font-sans">{error}</p>
        )}

        {isEditing ? (
          <>
            <div className="mb-8">
              <input
                type="text"
                value={editMood}
                onChange={(e) => setEditMood(e.target.value)}
                placeholder="How are you feeling?"
                className={`text-sm px-3 py-1.5 rounded-full border bg-muted/20 outline-none focus:ring-2 transition-all w-2/3 md:w-auto font-sans focus:ring-primary/20 ${palette.accentText} ${palette.accentBorder}`}
              />
            </div>

            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Give this entry a title…"
              className="w-full bg-transparent outline-none text-4xl mb-8 font-light tracking-tight placeholder-muted-foreground/30 font-serif"
            />

            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="What's on your mind today?"
              className="w-full bg-transparent outline-none resize-none text-lg leading-[1.9] overflow-hidden flex-grow placeholder-muted-foreground/30 font-serif"
              style={{ minHeight: "400px" }}
            />
          </>
        ) : (
          <>
            <div className="mb-8">
              <p className="text-sm opacity-50 mb-4 font-sans">
                {formattedDate} {entry.mood && `· ${entry.mood}`}
              </p>
              <h1 
                className="text-4xl font-light tracking-tight font-serif"
              >
                {entry.title}
              </h1>
            </div>

            <div 
              className="text-lg leading-[1.9] whitespace-pre-wrap flex-grow text-foreground/90 font-serif"
            >
              {entry.content}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
