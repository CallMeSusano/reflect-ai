"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { auth, db } from "@/firebase";

/* ─── Types ─────────────────────────────────────────────────── */

interface SavedMediaFile {
  type: "photos" | "videos";
  filename: string;
}

interface JournalEntry {
  id: string;
  title: string;
  mood: string;
  content: string;
  media: SavedMediaFile[];
  userId: string;
  createdAt: number;
}

/* ─── Mood palettes ──────────────────────────────────────────── */

const MOOD_PALETTES: Record<string, { accentText: string; accentBorder: string; pill: string }> = {
  happy:    { accentText: "text-amber-500",   accentBorder: "border-amber-400/40",   pill: "bg-amber-50 dark:bg-amber-950/30" },
  sad:      { accentText: "text-blue-500",    accentBorder: "border-blue-400/40",    pill: "bg-blue-50 dark:bg-blue-950/30" },
  anxious:  { accentText: "text-rose-500",    accentBorder: "border-rose-400/40",    pill: "bg-rose-50 dark:bg-rose-950/30" },
  grateful: { accentText: "text-green-500",   accentBorder: "border-green-400/40",   pill: "bg-green-50 dark:bg-green-950/30" },
  angry:    { accentText: "text-orange-500",  accentBorder: "border-orange-400/40",  pill: "bg-orange-50 dark:bg-orange-950/30" },
  peaceful: { accentText: "text-teal-500",    accentBorder: "border-teal-400/40",    pill: "bg-teal-50 dark:bg-teal-950/30" },
  proud:    { accentText: "text-purple-500",  accentBorder: "border-purple-400/40",  pill: "bg-purple-50 dark:bg-purple-950/30" },
  relieved: { accentText: "text-emerald-500", accentBorder: "border-emerald-400/40", pill: "bg-emerald-50 dark:bg-emerald-950/30" },
  default:  { accentText: "text-muted-foreground", accentBorder: "border-border",    pill: "bg-muted/30" },
};

function getMoodPalette(mood: string) {
  const lower = mood?.toLowerCase() ?? "";
  return (
    Object.entries(MOOD_PALETTES).find(([key]) => lower.includes(key))?.[1] ??
    MOOD_PALETTES.default
  );
}

/* ─── Word count ─────────────────────────────────────────────── */

function WordCount({ text }: { text: string }) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const minutes = Math.ceil(words / 200);
  return (
    <span className="text-xs text-muted-foreground font-sans tabular-nums">
      {words} words · {minutes} min read
    </span>
  );
}

/* ─── Delete confirmation modal ──────────────────────────────── */

function DeleteModal({
  onConfirm,
  onCancel,
  deleting,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={!deleting ? onCancel : undefined}
      />
      {/* Dialog */}
      <div className="relative z-10 bg-background border border-border rounded-2xl shadow-xl px-8 py-7 max-w-sm w-full mx-4 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold font-sans text-foreground">Delete entry?</h2>
          <p className="text-sm text-muted-foreground font-sans leading-relaxed">
            This entry will be permanently deleted. You can't undo this action.
          </p>
        </div>
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="text-sm px-4 py-2 rounded-lg font-medium font-sans bg-muted/50 text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="text-sm px-4 py-2 rounded-lg font-medium font-sans bg-destructive text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {deleting ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── View media (read mode) ─────────────────────────────────── */

function ViewMediaGrid({ media, apiUrl }: { media: SavedMediaFile[]; apiUrl: string }) {
  if (media.length === 0) return null;

  return (
    <div className="flex flex-col gap-6 mt-12 pt-8 border-t border-border/40">
      {media.map((file, idx) => (
        <div key={idx} className="rounded-xl overflow-hidden border border-border w-full bg-muted/10">
          {file.type === "photos" ? (
            <img
              src={`${apiUrl}/download/photos/${file.filename}`}
              alt="attachment"
              className="w-full h-auto max-h-[70vh] object-contain"
            />
          ) : (
            <video
              src={`${apiUrl}/download/videos/${file.filename}`}
              controls
              className="w-full h-auto max-h-[70vh] object-contain bg-black"
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */

export default function JournalEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const entryId = resolvedParams.id;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /* Load entry */
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const docRef = doc(db, "users", user.uid, "journals", entryId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            const loaded: JournalEntry = {
              id: docSnap.id,
              title: data.title || "",
              mood: data.mood || "",
              content: data.content || "",
              media: data.media || [],
              userId: data.userId || "",
              createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
            };
            setEntry(loaded);
          }
        } catch (err) {
          console.error(err);
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

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const docRef = doc(db, "users", auth.currentUser!.uid, "journals", entryId);
      await deleteDoc(docRef);
      router.push("/journal");
    } catch (err) {
      console.error(err);
      setError("Failed to delete journal entry.");
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  /* ─── Render guards ─────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary/60 animate-spin" />
          <p className="text-sm text-muted-foreground font-sans">Loading your entry…</p>
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

  /* ─── Derived state ─────────────────────────────────────────── */

  const palette = getMoodPalette(entry.mood);

  const formattedDate = new Date(entry.createdAt).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  /* ─── JSX ───────────────────────────────────────────────────── */

  return (
    <div className="flex-1 transition-colors duration-500 bg-background text-foreground font-serif">
      {showDeleteModal && (
        <DeleteModal
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          deleting={deleting}
        />
      )}

      <div className="sticky top-14 z-10 backdrop-blur-sm border-b border-border/40 px-6 py-3 flex items-center justify-between bg-background/95">
        <Link
          href="/journal"
          className="text-sm flex items-center gap-1.5 opacity-50 hover:opacity-80 transition-opacity font-sans"
        >
          ← Back
        </Link>

        <WordCount text={entry.content} />

        <div className="flex items-center gap-2">
          <Link
            href={`/journal/${entryId}/edit`}
            className="text-sm px-4 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-80 bg-muted/50 text-foreground font-sans"
          >
            Edit
          </Link>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="text-sm px-4 py-1.5 rounded-lg font-medium transition-opacity hover:bg-destructive/10 text-destructive/70 hover:text-destructive font-sans"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12 flex flex-col min-h-[85vh]">
        {error && (
          <p className="text-sm text-destructive mb-6 font-sans bg-destructive/5 border border-destructive/20 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="mb-8">
          <p className="text-sm opacity-50 mb-4 font-sans">
            {formattedDate}
            {entry.mood && (
              <>
                {" · "}
                <span className={palette.accentText}>{entry.mood}</span>
              </>
            )}
          </p>
          <h1 className="text-4xl font-light tracking-tight font-serif">{entry.title}</h1>
        </div>

        <div className="text-lg leading-[1.9] whitespace-pre-wrap flex-grow text-foreground/90 font-serif">
          {entry.content}
        </div>

        <ViewMediaGrid media={entry.media} apiUrl={apiUrl} />
      </div>
    </div>
  );
}
