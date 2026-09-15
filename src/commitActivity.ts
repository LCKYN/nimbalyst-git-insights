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

export function aggregateHeatmap(commits: readonly RawCommit[]): HeatmapDay[] {
  const counts = new Map<string, number>();
  for (const commit of commits) {
    const day = parseAuthorDateDay(commit.authorDate);
    if (!day) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
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

  for (const commit of commits) {
    const day = parseAuthorDateDay(commit.authorDate);
    if (!day) continue;
    if (options.since && day < options.since) continue;
    if (options.until && day > options.until) continue;

    const key = bucketKey(day, granularity);
    bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1);

    const author = commit.author.trim() || 'Unknown';
    authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1);
  }

  return {
    buckets: [...bucketCounts.entries()]
      .map(([bucket, count]) => ({ bucket, count }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket)),
    authors: [...authorCounts.entries()]
      .map(([author, count]) => ({ author, count }))
      .sort((a, b) => b.count - a.count),
  };
}
