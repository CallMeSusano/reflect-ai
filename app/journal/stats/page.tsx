"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Sparkles } from "lucide-react";
import { auth, db } from "@/firebase";
import { AnalysisLoader } from "@/components/analysis-loader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buildSentimentSeries, buildWeeklyThemes, computeStreak, normalizeCreatedAt, type JournalEntryRecord, type SentimentPoint } from "@/lib/journal-stats";
// shortDate will be created inside the chart using the active locale
function describeSentimentKey(score: number) {
  if (score >= 0.55) return "journalStats.sentimentVeryPositive";
  if (score >= 0.15) return "journalStats.sentimentPositive";
  if (score > -0.15) return "journalStats.sentimentBalanced";
  if (score > -0.55) return "journalStats.sentimentNegative";
  return "journalStats.sentimentVeryNegative";
}
function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="rounded-2xl border bg-card">
      <CardContent className="p-5 md:p-6 flex flex-col gap-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-sans">{label}</p>
        <p className="text-3xl md:text-4xl font-serif leading-none">{value}</p>
        <p className="text-sm text-muted-foreground font-sans">{detail}</p>
      </CardContent>
    </Card>
  );
}

function ReflectionCard({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="reflect-card-bg rounded-2xl" style={{ animation: "luna-in 0.45s ease-out forwards" }}>
      <div className="px-5 py-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 shrink-0" style={{ color: "#cc5a33" }} />
          <span
            className="text-sm font-medium font-sans"
            style={{
              background: "linear-gradient(to bottom right, #cc5a33, #b84dcb, #3380cc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {label}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

function SentimentChart({ points }: { points: SentimentPoint[] }) {
  const { t, i18n } = useTranslation();
  const shortDate = useMemo(() => new Intl.DateTimeFormat(i18n.language || "en-US", { month: "short", day: "numeric" }), [i18n.language]);

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed bg-muted/20 text-sm text-muted-foreground font-sans">
        {t("journalStats.emptyChart")}
      </div>
    );
  }
  const width = Math.max(680, points.length * 68);
  const height = 280;
  const padding = { top: 24, right: 20, bottom: 48, left: 52 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? padding.left + innerWidth / 2 : padding.left + (index / (points.length - 1)) * innerWidth;
    const y = padding.top + (1 - (point.score + 1) / 2) * innerHeight;
    return { ...point, x, y };
  });
  const linePath = coords.map((p) => `${p.x},${p.y}`).join(" ");
  const gridScores = [1, 0.5, 0, -0.5, -1];
  return (
    <div className="overflow-x-auto pb-2">
      <svg width={width} height={height} role="img" aria-label={t("journalStats.moodChartAria")} className="block">
        <defs>
          <linearGradient id="sentiment-line" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.65" />
          </linearGradient>
        </defs>
        {gridScores.map((score) => {
          const y = padding.top + (1 - (score + 1) / 2) * innerHeight;
          return (
            <g key={score}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="currentColor" className="text-border/70" strokeDasharray="4 6" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-muted-foreground font-sans" fontSize="11">
                {score.toFixed(1)}
              </text>
            </g>
          );
        })}
        <line x1={padding.left} x2={width - padding.right} y1={padding.top + innerHeight / 2} y2={padding.top + innerHeight / 2} stroke="currentColor" className="text-border/90" />
        <polyline points={linePath} fill="none" stroke="url(#sentiment-line)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((point) => (
          <g key={point.id}>
            <circle cx={point.x} cy={point.y} r="5.5" fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth="2" />
            <circle cx={point.x} cy={point.y} r="2.5" fill="hsl(var(--primary))" />
            <text x={point.x} y={height - 16} textAnchor="middle" className="fill-muted-foreground font-sans" fontSize="11">
              {shortDate.format(point.date)}
            </text>
            <title>{`${point.title} • ${t(describeSentimentKey(point.score))} • ${point.score.toFixed(2)}`}</title>
          </g>
        ))}
      </svg>
    </div>
  );
}

interface WeeklyNarrativeCache {
  narrative: string;
  language: string;
  entrySignature: string;
  entryCount: number;
  generatedAt: number;
}

export default function JournalStatsPage() {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<JournalEntryRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<{ uid: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [narrative, setNarrative] = useState("");
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState("");
  const mountedRef = useRef(true);
  const fetchGenRef = useRef(0);
  const narrativeFetchRef = useRef(0);
  const userId = currentUser?.uid ?? "";
  const shortDate = useMemo(
    () => new Intl.DateTimeFormat(i18n.language || "en-US", { month: "short", day: "numeric" }),
    [i18n.language]
  );
  const weeklyRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { from, to };
  }, []);
  const weeklyEntries = useMemo(
    () =>
      [...entries]
        .filter((entry) => normalizeCreatedAt(entry.createdAt) >= weeklyRange.from)
        .sort((a, b) => normalizeCreatedAt(a.createdAt).getTime() - normalizeCreatedAt(b.createdAt).getTime()),
    [entries, weeklyRange.from]
  );
  const weeklyEntrySignature = useMemo(
    () =>
      weeklyEntries
        .map((entry) => `${entry.id}:${normalizeCreatedAt(entry.createdAt).toISOString()}`)
        .join("|"),
    [weeklyEntries]
  );
  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const currentGen = ++fetchGenRef.current;
      setCurrentUser(user ? { uid: user.uid } : null);
      if (!user) {
        setEntries([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      (async () => {
        try {
          const snap = await getDocs(collection(db, "users", user.uid, "journals"));
          if (!mountedRef.current || fetchGenRef.current !== currentGen) return;
          const data: JournalEntryRecord[] = snap.docs.map((doc) => {
            const docData = doc.data() as Partial<JournalEntryRecord>;
            return {
              id: doc.id,
              title: docData.title || "",
              mood: docData.mood || "",
              content: docData.content || "",
              createdAt: docData.createdAt,
            };
          });
          setEntries(data);
        } catch (err) {
          if (mountedRef.current && fetchGenRef.current === currentGen) {
            setError(err instanceof Error ? err.message : t("journalStats.errorLoad"));
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
   }, [t]);
  useEffect(() => {
    const requestId = ++narrativeFetchRef.current;

    if (!userId || !i18n.language || weeklyEntries.length === 0) {
      return;
    }

    const metaRef = doc(db, "users", userId, "meta", "weeklyNarrative");

    (async () => {
      try {
        setNarrativeLoading(true);
        setNarrativeError("");

        const cachedSnap = await getDoc(metaRef);
        if (!mountedRef.current || narrativeFetchRef.current !== requestId) return;

        if (cachedSnap.exists()) {
          const cached = cachedSnap.data() as Partial<WeeklyNarrativeCache>;
          if (cached.narrative && cached.language === i18n.language && cached.entrySignature === weeklyEntrySignature) {
            setNarrative(cached.narrative);
            return;
          }
        }

        const response = await fetch("/api/analyze-weekly", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries: weeklyEntries.map((e) => ({ title: e.title, content: e.content })),
            language: i18n.language,
          }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.detail || "Failed to generate narrative");
        }

        const resultNarrative = typeof payload?.narrative === "string" ? payload.narrative.trim() : "";
        if (!resultNarrative) {
          throw new Error("Failed to generate narrative");
        }

        if (!mountedRef.current || narrativeFetchRef.current !== requestId) return;

        setNarrative(resultNarrative);

        await setDoc(
          metaRef,
          {
            narrative: resultNarrative,
            language: i18n.language,
            entrySignature: weeklyEntrySignature,
            entryCount: weeklyEntries.length,
            generatedAt: Date.now(),
          } satisfies WeeklyNarrativeCache,
          { merge: true }
        );
      } catch (err) {
        if (!mountedRef.current || narrativeFetchRef.current !== requestId) return;
        setNarrative("");
        setNarrativeError(err instanceof Error ? err.message : t("journalStats.narrativeError"));
      } finally {
        if (mountedRef.current && narrativeFetchRef.current === requestId) {
          setNarrativeLoading(false);
        }
      }
    })();
  }, [userId, i18n.language, t, weeklyEntries, weeklyEntrySignature]);
   const sentimentSeries = useMemo(() => buildSentimentSeries(entries), [entries]);
   const weeklyThemes = useMemo(() => buildWeeklyThemes(entries), [entries]);
   const streak = useMemo(() => computeStreak(entries), [entries]);
   const averageSentiment = useMemo(
     () => (sentimentSeries.length ? sentimentSeries.reduce((sum, entry) => sum + entry.score, 0) / sentimentSeries.length : 0),
     [sentimentSeries]
   );
   const entriesThisWeek = weeklyEntries.length;
   const totalEntries = entries.length;
   const createdDates = entries.map((entry) => normalizeCreatedAt(entry.createdAt)).sort((a, b) => a.getTime() - b.getTime());
   const firstEntryDate = createdDates[0];
   const latestEntryDate = createdDates[createdDates.length - 1];
    if (loading) {
     return (
      <div className="container mx-auto max-w-6xl px-4 md:px-8 py-10">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-40 rounded bg-muted" />
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted/50" />)}
          </div>
          <div className="h-80 rounded-2xl bg-muted/30" />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="container mx-auto max-w-3xl px-4 md:px-8 py-12">
        <Card className="rounded-2xl border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 md:p-8">
         <p className="text-sm uppercase tracking-widest text-destructive/80 font-sans mb-3">{t("journalStats.errorTitle")}</p>
            <p className="text-base text-foreground/90 font-serif mb-5">{error}</p>
            <Link href="/journal" className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground font-sans">
              {t("journalStats.backToJournal")}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }
   if (totalEntries === 0) {
     return (
       <div className="container mx-auto max-w-3xl px-4 md:px-8 py-12">
           <Card className="rounded-2xl border border-dashed bg-muted/20">
           <CardContent className="p-8 md:p-12 text-center">
              <p className="text-2xl font-serif mb-3">{t("journalStats.emptyTitle")}</p>
              <p className="text-sm text-muted-foreground font-sans mb-6">{t("journalStats.emptyDesc")}</p>
             <div className="flex items-center justify-center gap-3">
                <Link href="/journal/new" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground font-sans">{t("journalStats.emptyWrite")}</Link>
                <Link href="/journal" className="rounded-lg border px-4 py-2 text-sm font-medium font-sans">{t("journalStats.emptyView")}</Link>
             </div>
           </CardContent>
         </Card>
       </div>
     );
   }
    const averageLabel = t(describeSentimentKey(averageSentiment));
    const streakSuffix = streak === 1 ? t("journalStats.day") : t("journalStats.days");
  return (
    <div className="container mx-auto max-w-6xl px-4 md:px-8 py-8 md:py-10 space-y-8">
       <section className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground font-sans">{t("journalStats.sectionHow")}</p>
         <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
           <div>
              <h1 className="text-3xl md:text-4xl font-serif tracking-tight">{t("journalStats.title")}</h1>
              <p className="text-sm text-muted-foreground font-sans">{t("journalStats.subtitle")}</p>
           </div>
            <Link href="/journal/new" className="inline-flex w-fit rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground font-sans">{t("journalStats.write")}</Link>
         </div>
       </section>
       <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label={t("journalStats.metricStreak")} value={`${streak} ${streakSuffix}`} detail={t("journalStats.metricDetailStreak")} />
          <MetricCard label={t("journalStats.metricAverageMood")} value={averageSentiment.toFixed(2)} detail={t("journalStats.metricDetailAverage", { label: averageLabel.toLowerCase() })} />
          <MetricCard label={t("journalStats.metricThisWeek")} value={`${entriesThisWeek}`} detail={t("journalStats.metricDetailThisWeek", { count: entriesThisWeek })} />
          <MetricCard label={t("journalStats.metricJourney")} value={firstEntryDate ? `${Math.max(1, Math.ceil((latestEntryDate.getTime() - firstEntryDate.getTime()) / 86400000) + 1)} ${t("journalStats.days", { count: 2 })}` : "—"} detail={t("journalStats.metricDetailJourney")} />
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="rounded-2xl border bg-card">
          <CardContent className="p-5 md:p-6 space-y-4">
             <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
               <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-sans">{t("journalStats.moodTrend")}</p>
                  <h2 className="text-xl md:text-2xl font-serif">{t("journalStats.moodHeading")}</h2>
              </div>
               <p className="text-sm text-muted-foreground font-sans">{t("journalStats.moodScaleLegend")}</p>
            </div>
            <SentimentChart points={sentimentSeries} />
          </CardContent>
        </Card>
        <Card className="rounded-2xl border bg-card">
          <CardContent className="p-5 md:p-6 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-sans">{t("journalStats.writingStreakTitle")}</p>
                <h2 className="text-xl md:text-2xl font-serif">{t("journalStats.writingStreakHeading")}</h2>
              </div>
             <div className="rounded-2xl bg-muted/30 p-5 flex flex-col gap-3">
               <p className="text-5xl font-serif leading-none">{streak}</p>
                <p className="text-sm text-muted-foreground font-sans">{t("journalStats.streakSuffix", { count: streak })} {t("journalStats.streakInARow")}</p>
              <div className="flex gap-1.5">
                {Array.from({ length: 7 }).map((_, index) => (
                  <span key={index} className={`h-2.5 flex-1 rounded-full ${index < Math.min(streak, 7) ? "bg-primary" : "bg-muted"}`} />
                ))}
              </div>
            </div>
            <div className="space-y-2">
                <p className="text-sm font-medium font-sans text-muted-foreground">{t("journalStats.recentEntryWindow")}</p>
              <div className="flex flex-wrap gap-2 text-xs font-sans">
                {sentimentSeries.slice(-5).map((entry) => (
                  <Badge key={entry.id} variant="outline" className="rounded-full px-3 py-1 border-0 bg-primary/10 text-primary">
                      {shortDate.format(entry.date)} • {entry.score.toFixed(2)}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
      <section>
        <Card className="rounded-2xl border bg-card">
          <CardContent className="p-5 md:p-6 space-y-5">
            <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                <div>
                   <p className="text-xs uppercase tracking-widest text-muted-foreground font-sans">{t("journalStats.themesTitle")}</p>
                     <h2 className="text-xl md:text-2xl font-serif">{t("journalStats.themesHeading")}</h2>
                </div>
                <p className="text-sm text-muted-foreground font-sans">{t("journalStats.themesNote")}</p>
            </div>
              {weeklyThemes.themes.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground font-sans">{t("journalStats.noThemes")}</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {weeklyThemes.themes.map((theme) => {
                  const maxCount = weeklyThemes.themes[0]?.count || 1;
                  return (
                    <div key={theme.theme} className="rounded-2xl border bg-background p-4">
                      <div className="flex items-center justify-between gap-4 mb-3">
                        <div>
                            <p className="font-medium font-sans">{theme.theme}</p>
                            <p className="text-xs text-muted-foreground font-sans">{t("journalStats.matchingEntries", { count: theme.count })}</p>
                        </div>
                        <Badge variant="outline" className="rounded-full border-0 bg-primary/10 text-primary">#{theme.count}</Badge>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(12, (theme.count / maxCount) * 100)}%` }} />
                      </div>
                        {theme.keywords.length > 0 && (
                          <p className="mt-3 text-xs text-muted-foreground font-sans">{t("journalStats.keywordsLabel", { keywords: theme.keywords.join(", ") })}</p>
                        )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
      <section>
        <Card className="rounded-2xl border bg-card">
          <CardContent className="p-5 md:p-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-sans">{t("journalStats.weeklyNarrativeLabel")}</p>
              <h2 className="text-xl md:text-2xl font-serif">{t("journalStats.weeklyNarrativeTitle")}</h2>
              <p className="text-sm text-muted-foreground font-sans mt-1">{t("journalStats.weeklyNarrativeSubtitle")}</p>
              <p className="text-xs text-muted-foreground font-sans mt-1">
                {t("journalStats.weeklyNarrativeRange", {
                  from: shortDate.format(weeklyRange.from),
                  to: shortDate.format(weeklyRange.to),
                })}
              </p>
            </div>
            {narrativeLoading ? (
              <div className="pt-1">
                <AnalysisLoader label={t("journalStats.narrativeGenerating")} />
              </div>
            ) : narrativeError ? (
              <div className="rounded-2xl bg-destructive/10 p-4">
                <p className="text-sm text-destructive font-sans mb-2">{t("journalStats.narrativeError")}</p>
                <p className="text-xs text-muted-foreground font-sans">{narrativeError}</p>
              </div>
            ) : weeklyEntries.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/20 p-5">
                <p className="text-sm text-muted-foreground font-sans">{t("journalStats.narrativeNoEntries")}</p>
              </div>
            ) : narrative ? (
              <ReflectionCard label={t("journalStats.reflectionLabel")}>
                <p className="text-base leading-[1.85] font-serif text-neutral-700 dark:text-neutral-100 mb-5">{narrative}</p>
              </ReflectionCard>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
