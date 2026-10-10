/** One commit as emitted by `git log --format=%ai%x1f%an`. */
export interface RawCommit {
  /** Author date exactly as printed by `%ai`, e.g. "2024-01-15 14:23:01 +0700". */
  authorDate: string;
  author: string;
}

export interface HeatmapDay {
  /** YYYY-MM-DD, in the commit's own recorded offset (see `parseAuthorDateDay`). */
  date: string;
  count: number;
  /** Authors who committed that day, most commits first. */
  authors: AuthorCount[];
}

export interface CommitSummary {
  total: number;
  days: HeatmapDay[];
  /** Commit counts by weekday, index 0 = Sunday. */
  weekdays: number[];
  /** Commit counts by hour of day (0-23), in each commit's own recorded offset. */
  hours: number[];
}

export type DistributionGranularity = 'day' | 'week' | 'month';

export interface DistributionBucket {
  /** day: YYYY-MM-DD, week: YYYY-Www (ISO week), month: YYYY-MM. */
  bucket: string;
  count: number;
}

export interface AuthorCount {
  author: string;
  count: number;
}

export interface CommitDistribution {
  buckets: DistributionBucket[];
  authors: AuthorCount[];
}

export interface DistributionOptions {
  /** Inclusive lower bound, YYYY-MM-DD. */
  since?: string;
  /** Inclusive upper bound, YYYY-MM-DD. */
  until?: string;
  granularity?: DistributionGranularity;
}

/**
 * `%ai` always starts with a `YYYY-MM-DD` date before the time and UTC offset.
 * Deliberately does NOT parse into a `Date`/convert to UTC: a commit's author
 * date already carries the author's own offset, and converting it would move
 * commits made near midnight into the wrong calendar day relative to what
 * `git log` itself displays.
 */
export function parseAuthorDateDay(authorDate: string): string {
  return authorDate.slice(0, 10);
}

/** YYYY-MM-DD of a `Date` in the local timezone (`toISOString` would give the UTC day). */
export function localDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Sunday-first week columns covering `weeks` weeks, the last one being `today`'s
 * week. Days after `today` are omitted, so the last column may be partial.
 */
export function heatmapGrid(today: Date, weeks: number): { date: Date; key: string }[][] {
  const cursor = new Date(today);
  cursor.setHours(0, 0, 0, 0);
  const todayKey = localDateKey(cursor);
  cursor.setDate(cursor.getDate() - (weeks - 1) * 7 - cursor.getDay());

  const grid: { date: Date; key: string }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: { date: Date; key: string }[] = [];
    for (let d = 0; d < 7; d++) {
      const key = localDateKey(cursor);
      if (key <= todayKey) column.push({ date: new Date(cursor), key });
      cursor.setDate(cursor.getDate() + 1);
    }
    grid.push(column);
  }
  return grid;
}

/**
 * Heatmap width in weeks for a toolbar range id. 0 hides it: at 7d/30d a sliver
 * of cells says less than the day-of-week and hour charts beside it.
 */
export function heatmapWeeks(range: string): number {
  if (range === '90d') return 13;
  if (range === '1y' || range === 'all') return 53;
  return 0;
}

function sortedCounts(counts: Map<string, number>): AuthorCount[] {
  return [...counts.entries()]
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count);
}

export function aggregateSummary(commits: readonly RawCommit[], options: { since?: string } = {}): CommitSummary {
  const days = new Map<string, Map<string, number>>();
  const weekdays = new Array<number>(7).fill(0);
  const hours = new Array<number>(24).fill(0);
  let total = 0;

  for (const commit of commits) {
    const day = parseAuthorDateDay(commit.authorDate);
    if (!day) continue;
    if (options.since && day < options.since) continue;
    total++;

    const authors = days.get(day) ?? new Map<string, number>();
    const author = commit.author.trim() || 'Unknown';
    authors.set(author, (authors.get(author) ?? 0) + 1);
    days.set(day, authors);

    const [year, month, date] = day.split('-').map(Number);
    weekdays[new Date(Date.UTC(year, month - 1, date)).getUTCDay()]++;
    const hour = Number(commit.authorDate.slice(11, 13));
    if (hour >= 0 && hour < 24) hours[hour]++;
  }

  return {
    total,
    days: [...days.entries()]
      .map(([date, authors]) => {
        const sorted = sortedCounts(authors);
        return { date, count: sorted.reduce((sum, a) => sum + a.count, 0), authors: sorted };
      })
      .sort((a, b) => a.date.localeCompare(b.date)),
    weekdays,
    hours,
  };
}

function isoWeekBucket(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1, date));
  // Shift to the Thursday of this ISO week, then read the ISO week-numbering year off it.
  const dayNum = (target.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function bucketKey(day: string, granularity: DistributionGranularity): string {
  if (granularity === 'day') return day;
  if (granularity === 'month') return day.slice(0, 7);
  return isoWeekBucket(day);
}

export function aggregateDistribution(
  commits: readonly RawCommit[],
  options: DistributionOptions = {},
): CommitDistribution {
  const granularity = options.granularity ?? 'day';
  const bucketCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();
  let first = '';
  let last = '';

  for (const commit of commits) {
    const day = parseAuthorDateDay(commit.authorDate);
    if (!day) continue;
    if (options.since && day < options.since) continue;
    if (options.until && day > options.until) continue;
    if (!first || day < first) first = day;
    if (day > last) last = day;

    const key = bucketKey(day, granularity);
    bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1);

    const author = commit.author.trim() || 'Unknown';
    authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1);
  }

  if (!first) return { buckets: [], authors: [] };

  // Zero-fill from `since` (or the first commit) to `until` (or the last commit),
  // so a quiet stretch shows up as a gap instead of adjacent bars.
  const buckets = new Map<string, number>();
  const end = options.until ?? last;
  const cursor = new Date(`${options.since ?? first}T00:00:00Z`);
  for (let day = cursor.toISOString().slice(0, 10); day <= end; day = cursor.toISOString().slice(0, 10)) {
    const key = bucketKey(day, granularity);
    buckets.set(key, bucketCounts.get(key) ?? 0);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    buckets: [...buckets.entries()].map(([bucket, count]) => ({ bucket, count })),
    authors: sortedCounts(authorCounts),
  };
}
