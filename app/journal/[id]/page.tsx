"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { auth, db } from "@/firebase";
import { AnalysisLoader } from "@/components/analysis-loader";
import { AnalysisCard } from "@/components/analysis-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface SavedMediaFile {
  type: "photos" | "videos";
  filename: string;
}

interface EntryAnalysis {
  summary: string;
  mood: string;
  generatedAt: number;
}

interface JournalEntry {
  id: string;
  title: string;
  mood: string;
  content: string;
  media: SavedMediaFile[];
  userId: string;
  createdAt: number;
  analysis?: EntryAnalysis;
}

const MOOD_PALETTES: Record<string, { accentText: string }> = {
  happy:    { accentText: "text-amber-500" },
  sad:      { accentText: "text-blue-500" },
  anxious:  { accentText: "text-rose-500" },
  grateful: { accentText: "text-green-500" },
  angry:    { accentText: "text-orange-500" },
  peaceful: { accentText: "text-teal-500" },
  proud:    { accentText: "text-purple-500" },
  relieved: { accentText: "text-emerald-500" },
  default:  { accentText: "text-muted-foreground" },
};

const MOOD_EMOJI: Record<string, string> = {
  happy: "😊", sad: "😢", anxious: "😰", grateful: "🙏",
  angry: "😤", peaceful: "😌", proud: "💪", relieved: "😮‍💨", default: "✦",
};

function getMoodPalette(mood: string) {
  const lower = mood?.toLowerCase() ?? "";
  return (
    Object.entries(MOOD_PALETTES).find(([key]) => lower.includes(key))?.[1] ??
    MOOD_PALETTES.default
  );
}

function getMoodEmoji(mood: string) {
  const lower = mood?.toLowerCase() ?? "";
  return (
    Object.entries(MOOD_EMOJI).find(([key]) => lower.includes(key))?.[1] ??
    MOOD_EMOJI.default
  );
}

function WordCount({ text }: { text: string }) {
  const { t } = useTranslation();
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const minutes = Math.ceil(words / 200);
  return (
    <span className="text-xs text-muted-foreground font-sans tabular-nums">
      {t("journalNew.wordCount", { count: words })} · {t("journalNew.minRead", { count: minutes })}
    </span>
  );
}

function DeleteModal({
  onConfirm,
  onCancel,
  deleting,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={!deleting ? onCancel : undefined}
      />
      <div className="relative z-10 bg-background border border-border rounded-2xl shadow-xl px-8 py-7 max-w-sm w-full mx-4 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold font-sans text-foreground">{t("entryPage.deleteEntry")}</h2>
          <p className="text-sm text-muted-foreground font-sans leading-relaxed">
            {t("entryPage.deleteConfirm")}
          </p>
        </div>
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="text-sm px-4 py-2 rounded-lg font-medium font-sans bg-muted/50 text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="text-sm px-4 py-2 rounded-lg font-medium font-sans bg-destructive text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {deleting ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                {t("entryPage.deleting")}
              </>
            ) : (
              t("common.delete")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

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

function EntrySkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 flex flex-col gap-6">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-10 w-3/4" />
      <div className="space-y-3 mt-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

export default function JournalEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const resolvedParams = use(params);
  const entryId = resolvedParams.id;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisResult, setAnalysisResult] = useState<EntryAnalysis | null>(null);

  const analyzeContent = async (content: string, language: string, userId: string) => {
    setAnalysisLoading(true);
    setAnalysisError("");
    try {
      const response = await fetch("/api/analyze-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content, language }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setAnalysisError(typeof payload?.detail === "string" ? payload.detail : "Analysis failed.");
        return;
      }
      const result: EntryAnalysis = {
        summary: payload.summary,
        mood: payload.mood,
        generatedAt: Date.now(),
      };
      setAnalysisResult(result);
      setShowAnalysis(true);
      await updateDoc(doc(db, "users", userId, "journals", entryId), { analysis: result });
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setAnalysisLoading(false);
    }
  };

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
              analysis: data.analysis || undefined,
            };
            setEntry(loaded);
            if (data.analysis) {
              setAnalysisResult(data.analysis);
            } else if (data.content?.trim()) {
              analyzeContent(data.content, i18n.language, user.uid);
            }
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

  const handleRegenerate = () => {
    if (!entry || !auth.currentUser) return;
    analyzeContent(entry.content, i18n.language, auth.currentUser.uid);
  };

  if (loading) {
    return (
      <div className="flex-1 bg-background text-foreground font-serif">
        <div className="sticky top-14 z-10 backdrop-blur-sm border-b border-border/40 px-6 py-3 flex items-center justify-between bg-background/95">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
        <EntrySkeleton />
      </div>
    );
  }

  if (!entry || (auth.currentUser && entry.userId !== auth.currentUser.uid)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background font-sans">
        <div className="text-center">
          <p className="text-foreground mb-4">{t("entryPage.notFound")}</p>
          <Link href="/journal" className="text-sm underline text-muted-foreground">
            {t("entryPage.returnToJournal")}
          </Link>
        </div>
      </div>
    );
  }

  const palette = getMoodPalette(entry.mood);
  const formattedDate = new Date(entry.createdAt).toLocaleDateString(i18n.language, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

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
          {t("entryPage.back")}
        </Link>

        <WordCount text={entry.content} />

        <div className="flex items-center gap-2">
          <Link href={`/journal/${entryId}/edit`}>
            <Button variant="ghost" size="sm" className="font-sans text-sm">
              {t("common.edit")}
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteModal(true)}
            className="font-sans text-sm text-destructive/70 hover:text-destructive hover:bg-destructive/10"
          >
            {t("common.delete")}
          </Button>
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

        {analysisLoading && (
          <div className="mt-12 pt-8 border-t border-border/40">
            <AnalysisLoader label={t("entryPage.analyzing")} />
          </div>
        )}

        {!analysisLoading && showAnalysis && analysisResult && (
          <div className="mt-12 pt-8 border-t border-border/40">
            <AnalysisCard
              onHide={() => setShowAnalysis(false)}
              hideLabel={t("entryPage.hide")}
              onRegenerate={handleRegenerate}
              regenerateLabel={t("entryPage.regenerate")}
              regenerating={analysisLoading}
            >
              {analysisResult.summary && (
                <p className="text-base leading-[1.85] font-serif text-neutral-700 dark:text-neutral-100 mb-5">
                  {analysisResult.summary}
                </p>
              )}
              {analysisResult.mood && (
                <div className="flex items-center gap-2.5 pt-4 border-t border-rose-200/40 dark:border-blue-900/40">
                  <span className="text-xl leading-none">{getMoodEmoji(analysisResult.mood)}</span>
                  <span className="text-sm font-sans font-medium capitalize text-neutral-500 dark:text-neutral-400">
                    {analysisResult.mood}
                  </span>
                </div>
              )}
            </AnalysisCard>
          </div>
        )}

        {!analysisLoading && !showAnalysis && analysisResult && (
          <div className="mt-12 pt-8 border-t border-border/40">
            <button
              onClick={() => setShowAnalysis(true)}
              className="text-sm font-sans text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("entryPage.showReflection")}
            </button>
          </div>
        )}

        {analysisError && !analysisLoading && (
          <div className="mt-8 p-4 rounded-2xl bg-destructive/8 text-destructive text-sm font-sans border border-destructive/15">
            {t("entryPage.analysisFailed")} {analysisError}
          </div>
        )}
      </div>
    </div>
  );
}
