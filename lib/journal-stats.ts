export interface JournalEntryRecord {
  id: string;
  title?: string;
  mood?: string;
  content?: string;
  createdAt?: unknown;
}
export interface SentimentPoint {
  id: string;
  title: string;
  mood: string;
  date: Date;
  score: number;
}
export interface ThemeInsight {
  theme: string;
  count: number;
  keywords: string[];
}
const MOOD_SENTIMENT: Record<string, number> = {
  happy: 0.75,
  grateful: 0.7,
  peaceful: 0.55,
  proud: 0.45,
  relieved: 0.3,
  neutral: 0,
  sad: -0.7,
  anxious: -0.6,
  angry: -0.75,
};
const POSITIVE_WORDS = new Set([
  "good","great","calm","happy","hopeful","loving","love","grateful","proud","peaceful","relieved","energized","excited","progress","win","wins","success","successful","joy","joyful","kind","supported",
]);
const NEGATIVE_WORDS = new Set([
  "bad","sad","stressed","stress","anxious","angry","frustrated","overwhelmed","tired","exhausted","worried","worry","hurt","lonely","upset","fear","fearful","rough","hard","difficult",
]);
const THEME_RULES: Array<{ theme: string; keywords: string[] }> = [
  { theme: "Relationships", keywords: ["friend","friends","family","partner","spouse","wife","husband","dating","date","social","conversation","coworker","team","mom","dad","sister","brother"] },
  { theme: "Work & study", keywords: ["work","job","office","project","meeting","deadline","task","tasks","school","study","studying","class","exam","homework","client"] },
  { theme: "Health & energy", keywords: ["health","sleep","tired","exercise","gym","run","walk","sick","food","meal","doctor","therapy","rest","energy","burnout"] },
  { theme: "Stress & emotions", keywords: ["stress","stressed","anxiety","anxious","sad","angry","frustrated","overwhelmed","calm","peaceful","grateful","happy","fear","worry"] },
  { theme: "Growth & goals", keywords: ["goal","goals","habit","learn","learning","improve","improvement","progress","plan","planning","focus","routine","discipline","reflection","journal"] },
  { theme: "Home & money", keywords: ["home","house","apartment","clean","cleaning","chores","move","rent","bill","bills","budget","money","spend","saving"] },
  { theme: "Creativity & hobbies", keywords: ["art","music","write","writing","draw","creative","hobby","reading","game","games","photography","video","design"] },
];
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s']+/gu, " ").replace(/\s+/g, " ").trim();
}
function tokenize(value: string) {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(" ") : [];
}
export function normalizeCreatedAt(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") return new Date(value);
  if (value && typeof value === "object" && "toDate" in value) {
    const maybeToDate = (value as { toDate?: () => Date }).toDate;
    if (typeof maybeToDate === "function") return maybeToDate();
  }
  return new Date();
}
export function computeStreak(entries: JournalEntryRecord[], referenceDate = new Date()) {
  const daySet = new Set(entries.map((entry) => {
    const date = normalizeCreatedAt(entry.createdAt);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }));
  const cursor = new Date(referenceDate);
  cursor.setHours(0, 0, 0, 0);
  let streak = 0;
  while (true) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (!daySet.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
export function scoreEntrySentiment(entry: Pick<JournalEntryRecord, "title" | "mood" | "content">) {
  const moodScore = MOOD_SENTIMENT[(entry.mood || "").toLowerCase()] ?? 0;
  const tokens = tokenize(`${entry.title ?? ""} ${entry.content ?? ""}`);
  let positive = 0;
  let negative = 0;
  for (const token of tokens) {
    if (POSITIVE_WORDS.has(token)) positive += 1;
    if (NEGATIVE_WORDS.has(token)) negative += 1;
  }
  return clamp(moodScore * 0.7 + (positive - negative) * 0.12, -1, 1);
}
export function buildSentimentSeries(entries: JournalEntryRecord[]): SentimentPoint[] {
  return [...entries]
    .sort((a, b) => normalizeCreatedAt(a.createdAt).getTime() - normalizeCreatedAt(b.createdAt).getTime())
    .map((entry) => ({
      id: entry.id,
      title: (entry.title || entry.mood || "Untitled").trim() || "Untitled",
      mood: entry.mood || "",
      date: normalizeCreatedAt(entry.createdAt),
      score: scoreEntrySentiment(entry),
    }));
}
export function buildWeeklyThemes(entries: JournalEntryRecord[], referenceDate = new Date()) {
  const weekStart = new Date(referenceDate);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const weeklyEntries = entries.filter((entry) => normalizeCreatedAt(entry.createdAt) >= weekStart);
  const themeStats = THEME_RULES.map((rule) => ({ theme: rule.theme, count: 0, keywords: new Set<string>() }));
  for (const entry of weeklyEntries) {
    const haystack = normalizeText(`${entry.title ?? ""} ${entry.mood ?? ""} ${entry.content ?? ""}`);
    for (const [index, rule] of THEME_RULES.entries()) {
      const matches = rule.keywords.filter((keyword) => haystack.includes(keyword));
      if (matches.length > 0) {
        themeStats[index].count += 1;
        matches.forEach((keyword) => themeStats[index].keywords.add(keyword));
      }
    }
  }
  return {
    weekStart,
    weekEnd: referenceDate,
    totalEntries: weeklyEntries.length,
    themes: themeStats
      .filter((theme) => theme.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((theme) => ({ theme: theme.theme, count: theme.count, keywords: [...theme.keywords].slice(0, 4) })) as ThemeInsight[],
  };
}

