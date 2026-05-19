"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { collection, query, getDocs, orderBy, doc, getDoc, setDoc } from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { useTranslation } from "react-i18next";
import { auth, db } from "@/firebase";
import { AnalysisLoader } from "@/components/analysis-loader";
import { AnalysisCard } from "@/components/analysis-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface JournalEntry {
  id: string;
  title: string;
  mood: string;
  content: string;
  createdAt: string;
}

type SortOption = "newest" | "oldest" | "mood" | "title";

interface BulkAnalysis {
  summary: string;
  mood: string;
  entryCount: number;
  generatedAt: number;
  topMoods: Array<{ mood: string; count: number }>;
}

const MOOD_PALETTES: Record<string, { badge: string }> = {
  happy:    { badge: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  sad:      { badge: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300" },
  anxious:  { badge: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300" },
  grateful: { badge: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300" },
  angry:    { badge: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300" },
  peaceful: { badge: "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300" },
  proud:    { badge: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300" },
  relieved: { badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" },
  default:  { badge: "bg-stone-100 text-stone-700 dark:bg-stone-900/40 dark:text-stone-400" },
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

function computeStats(entries: JournalEntry[]) {
  const total = entries.length;
  const moodCount: Record<string, number> = {};
  for (const e of entries) {
    if (e.mood) {
      const key = e.mood.toLowerCase();
      moodCount[key] = (moodCount[key] ?? 0) + 1;
    }
  }
  const topMood = Object.entries(moodCount).sort((a, b) => b[1] - a[1])[0];

  const now = new Date();
  const thisMonth = entries.filter((e) => {
    const d = new Date(e.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const daySet = new Set(
    entries.map((e) => {
      const d = new Date(e.createdAt);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );
  let streak = 0;
  const cursor = new Date();
  while (true) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (daySet.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return { total, topMood, thisMonth, streak };
}

function sortEntries(entries: JournalEntry[], sort: SortOption): JournalEntry[] {
  return [...entries].sort((a, b) => {
    switch (sort) {
      case "newest": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "oldest": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "mood": return (a.mood ?? "").localeCompare(b.mood ?? "");
      case "title": return (a.title ?? "").localeCompare(b.title ?? "");
    }
  });
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 mb-8">
      <Skeleton className="h-48 rounded-2xl" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-[88px] rounded-2xl" />
        <Skeleton className="h-[88px] rounded-2xl" />
      </div>
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="mb-8">
      <AnalysisLoader label="" />
    </div>
  );
}

export default function JournalPage() {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortOption>("newest");
  const [bulkAnalysisLoading, setBulkAnalysisLoading] = useState(false);
  const [bulkAnalysisError, setBulkAnalysisError] = useState("");
  const [bulkAnalysisResult, setBulkAnalysisResult] = useState<BulkAnalysis | null>(null);
  const [showBulkAnalysis, setShowBulkAnalysis] = useState(true);
  const analysisChecked = useRef(false);

  const mountedRef = useRef(true);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const currentGen = ++fetchGenRef.current;
      setCurrentUser(user);

      if (!user) {
        if (mountedRef.current) {
          setEntries([]);
          setLoading(false);
        }
        return;
      }

      (async () => {
        try {
          const q = query(
            collection(db, "users", user.uid, "journals"),
            orderBy("createdAt", "desc")
          );
          const querySnapshot = await getDocs(q);
          if (!mountedRef.current || fetchGenRef.current !== currentGen) return;

          const data: JournalEntry[] = [];
          querySnapshot.forEach((doc) => {
            const d = doc.data();
            data.push({
              id: doc.id,
              title: d.title,
              mood: d.mood,
              content: d.content,
              createdAt:
                typeof d.createdAt === "number"
                  ? new Date(d.createdAt).toISOString()
                  : d.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
            });
          });
          setEntries(data);
        } catch (error) {
          if (mountedRef.current && fetchGenRef.current === currentGen) {
            console.error("Error fetching journals:", error);
          }
        } finally {
          if (mountedRef.current && fetchGenRef.current === currentGen) {
            setLoading(false);
          }
        }
      })();
    });
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (loading || !currentUser || entries.length === 0 || analysisChecked.current) return;
    analysisChecked.current = true;
    loadOrGenerateBulkAnalysis(currentUser.uid, entries);
  }, [loading, currentUser, entries]);

  const loadOrGenerateBulkAnalysis = async (userId: string, entriesList: JournalEntry[]) => {
    try {
      const metaRef = doc(db, "users", userId, "meta", "journalAnalysis");
      const metaSnap = await getDoc(metaRef);
      if (metaSnap.exists()) {
        const cached = metaSnap.data() as BulkAnalysis;
        if (cached.entryCount === entriesList.length) {
          setBulkAnalysisResult(cached);
          return;
        }
      }
    } catch {
      // if meta read fails, fall through to generate
    }
    await generateBulkAnalysis(userId, entriesList);
  };

  const generateBulkAnalysis = async (userId: string, entriesList: JournalEntry[]) => {
    setBulkAnalysisLoading(true);
    setBulkAnalysisError("");
    try {
      const combinedText = entriesList
        .map((e) => `Title: ${e.title}\n\n${e.content}`)
        .join("\n\n---\n\n");

      const response = await fetch("/api/analyze-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: combinedText, language: i18n.language }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setBulkAnalysisError(
          typeof payload?.detail === "string" ? payload.detail : "Analysis failed."
        );
        return;
      }

      const moodCounts: Record<string, number> = {};
      entriesList.forEach((e) => {
        if (e.mood) moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1;
      });
      const topMoods = Object.entries(moodCounts)
        .map(([mood, count]) => ({ mood, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const result: BulkAnalysis = {
        summary: payload.summary,
        mood: payload.mood || "neutral",
        entryCount: entriesList.length,
        generatedAt: Date.now(),
        topMoods,
      };
      setBulkAnalysisResult(result);
      setShowBulkAnalysis(true);

      const metaRef = doc(db, "users", userId, "meta", "journalAnalysis");
      await setDoc(metaRef, result);
    } catch (err) {
      setBulkAnalysisError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setBulkAnalysisLoading(false);
    }
  };

  const handleRegenerate = () => {
    if (!currentUser) return;
    analysisChecked.current = false;
    generateBulkAnalysis(currentUser.uid, entries);
  };

  const stats = useMemo(() => computeStats(entries), [entries]);
  const sorted = useMemo(() => sortEntries(entries, sort), [entries, sort]);

  if (loading) {
    return (
      <div className="container max-w-4xl mx-auto px-4 py-8 md:px-8 md:py-12">
        <StatsSkeleton />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 md:px-8 md:py-12">
      {entries.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card className="row-span-2 bg-card border flex flex-col justify-between p-6 md:p-8 rounded-2xl overflow-hidden relative">
            <div
              aria-hidden
              className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-primary/5 pointer-events-none"
            />
            <CardContent className="p-0 flex flex-col justify-between h-full gap-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-sans mb-3">
                  {t("journalPage.totalEntries")}
                </p>
                <p className="text-7xl font-serif font-medium leading-none text-foreground">
                  {stats.total}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-sans">
                  {t("journalPage.currentStreak")}
                </p>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-serif font-medium leading-none">{stats.streak}</span>
                  <span className="text-sm text-muted-foreground font-sans pb-0.5">
                    {stats.streak === 1 ? t("journalPage.day") : t("journalPage.days")}
                  </span>
                </div>
                <div className="flex gap-1 mt-2">
                  {Array.from({ length: Math.min(stats.streak, 7) }).map((_, i) => (
                    <div key={i} className="h-1.5 flex-1 rounded-full bg-primary/60" />
                  ))}
                  {Array.from({ length: Math.max(0, 7 - stats.streak) }).map((_, i) => (
                    <div key={i} className="h-1.5 flex-1 rounded-full bg-muted" />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border rounded-2xl overflow-hidden">
            <CardContent className="p-5 md:p-6 flex flex-col justify-between h-full gap-2">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-sans">
                {t("journalPage.topMood")}
              </p>
              {stats.topMood ? (
                <div className="flex items-center gap-3">
                  <span className="text-3xl leading-none">{getMoodEmoji(stats.topMood[0])}</span>
                  <div>
                    <p className="text-lg font-serif capitalize leading-tight">{stats.topMood[0]}</p>
                    <p className="text-xs text-muted-foreground font-sans">
                      {stats.topMood[1]} {stats.topMood[1] === 1 ? t("journal.entry") : t("journal.entries")}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground font-sans">—</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border rounded-2xl overflow-hidden">
            <CardContent className="p-5 md:p-6 flex flex-col justify-between h-full gap-2">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-sans">
                {t("journalPage.thisMonth")}
              </p>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-serif font-medium leading-none">{stats.thisMonth}</span>
                <span className="text-sm text-muted-foreground font-sans pb-0.5">
                  {stats.thisMonth === 1 ? t("journal.entry") : t("journal.entries")}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {entries.length > 0 && bulkAnalysisLoading && <AnalysisSkeleton />}

      {entries.length > 0 && !bulkAnalysisLoading && showBulkAnalysis && bulkAnalysisResult && (
        <div className="mb-8">
          <AnalysisCard
            onHide={() => setShowBulkAnalysis(false)}
            hideLabel={t("journalPage.hide")}
            onRegenerate={handleRegenerate}
            regenerateLabel={t("journalPage.regenerate")}
            regenerating={bulkAnalysisLoading}
          >
            <p className="text-base leading-[1.85] font-serif text-neutral-700 dark:text-neutral-100 mb-5">
              {bulkAnalysisResult.summary}
            </p>
            <div className="flex items-center justify-between pt-4 border-t border-rose-200/40 dark:border-blue-900/40">
              {bulkAnalysisResult.mood && (
                <div className="flex items-center gap-2.5">
                  <span className="text-xl leading-none">{getMoodEmoji(bulkAnalysisResult.mood)}</span>
                  <span className="text-sm font-sans font-medium capitalize text-neutral-500 dark:text-neutral-400">
                    {bulkAnalysisResult.mood}
                  </span>
                </div>
              )}
              {bulkAnalysisResult.topMoods?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {bulkAnalysisResult.topMoods.map((item) => (
                    <span
                      key={item.mood}
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium font-sans bg-rose-100/60 dark:bg-blue-900/40 text-neutral-600 dark:text-neutral-300"
                    >
                      {getMoodEmoji(item.mood)} {item.mood}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </AnalysisCard>
        </div>
      )}

      {entries.length > 0 && !bulkAnalysisLoading && !showBulkAnalysis && bulkAnalysisResult && (
        <div className="mb-6">
          <button
            onClick={() => setShowBulkAnalysis(true)}
            className="text-sm font-sans text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("journalPage.showReflection")}
          </button>
        </div>
      )}

      {bulkAnalysisError && (
        <div className="mb-6 p-4 rounded-2xl bg-destructive/8 text-destructive text-sm font-sans border border-destructive/15">
          {t("journalPage.analysisFailed")} {bulkAnalysisError}
        </div>
      )}

      {entries.length > 0 && (
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-muted-foreground font-sans">
            {entries.length} {entries.length === 1 ? t("journal.entry") : t("journal.entries")}
          </p>
          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger className="w-40 h-8 text-xs font-sans rounded-lg border bg-background">
              <SelectValue placeholder={t("journalPage.newestFirst")} />
            </SelectTrigger>
            <SelectContent align="end" className="text-xs font-sans">
              <SelectItem value="newest">{t("journalPage.newestFirst")}</SelectItem>
              <SelectItem value="oldest">{t("journalPage.oldestFirst")}</SelectItem>
              <SelectItem value="mood">{t("journalPage.byMood")}</SelectItem>
              <SelectItem value="title">{t("journalPage.byTitle")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="text-center py-32 border border-dashed rounded-2xl bg-muted/30">
          <p className="text-2xl mb-4 text-muted-foreground font-serif">{t("journalPage.noEntries")}</p>
          <Link href="/journal/new">
            <button className="px-5 py-2.5 text-sm border rounded-lg hover:bg-muted transition-colors font-sans">
              {t("journalPage.startWriting")}
            </button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {sorted.map((entry) => {
            const p = getMoodPalette(entry.mood);
            return (
              <Link key={entry.id} href={`/journal/${entry.id}`} className="group block">
                <Card className="bg-card text-card-foreground border rounded-xl transition-all duration-300 hover:border-primary/50 hover:shadow-sm hover:-translate-y-0.5">
                  <CardContent className="p-6 md:p-8">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs text-muted-foreground uppercase tracking-widest font-sans">
                        {new Date(entry.createdAt).toLocaleDateString(i18n.language, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                      {entry.mood && (
                        <Badge
                          variant="outline"
                          className={`text-xs px-3 py-0.5 rounded-full font-medium border-0 ${p.badge} font-sans`}
                        >
                          {getMoodEmoji(entry.mood)}&nbsp;{entry.mood}
                        </Badge>
                      )}
                    </div>
                    <h2 className="text-2xl font-serif mb-3 leading-tight group-hover:text-primary/70 transition-colors">
                      {entry.title}
                    </h2>
                    <p className="text-muted-foreground text-base font-serif leading-relaxed line-clamp-3">
                      {entry.content}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
