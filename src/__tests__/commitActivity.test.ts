import { describe, expect, it } from 'vitest';
import { aggregateDistribution, aggregateSummary, heatmapGrid, heatmapWeeks, parseAuthorDateDay, type RawCommit } from '../commitActivity';

describe('heatmapGrid', () => {
  it('starts on a Sunday and ends on today, in a partial last column', () => {
    const grid = heatmapGrid(new Date(2026, 9, 9, 15, 30), 53); // Fri 2026-10-09
    expect(grid).toHaveLength(53);
    expect(grid[0][0].date.getDay()).toBe(0);
    expect(grid[0][0].key).toBe('2025-10-05');
    expect(grid.at(-1)!.map((c) => c.key)).toEqual(['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
  });
});

describe('heatmapWeeks', () => {
  it('shrinks to the range and hides below 90 days', () => {
    expect(['7d', '30d', '90d', '1y', 'all'].map(heatmapWeeks)).toEqual([0, 0, 13, 53, 53]);
  });

  it('gives a 13-week grid that still spans parts of 3+ months', () => {
    const grid = heatmapGrid(new Date(2026, 9, 9), heatmapWeeks('90d'));
    expect(grid).toHaveLength(13);
    expect(new Set(grid.map((column) => column[0].date.getMonth())).size).toBeGreaterThanOrEqual(3);
  });
});

describe('parseAuthorDateDay', () => {
  it('takes the literal date prefix, not a UTC-converted date', () => {
    // Same wall-clock date and time, different recorded offsets: a naive
    // `new Date(...)` conversion to UTC would put these on different days.
    expect(parseAuthorDateDay('2024-01-01 23:30:00 +0000')).toBe('2024-01-01');
    expect(parseAuthorDateDay('2024-01-01 23:30:00 +0900')).toBe('2024-01-01');
    expect(parseAuthorDateDay('2024-01-01 23:30:00 -0800')).toBe('2024-01-01');
  });
});

describe('aggregateSummary', () => {
  const days = (commits: RawCommit[]) => aggregateSummary(commits).days.map(({ date, count }) => ({ date, count }));

  it('returns zeroed totals for an empty repo', () => {
    expect(aggregateSummary([])).toEqual({ total: 0, days: [], weekdays: [0, 0, 0, 0, 0, 0, 0], hours: new Array(24).fill(0) });
  });

  it('groups commits per day with authors, sorted by date', () => {
    const commits: RawCommit[] = [
      { authorDate: '2024-03-11 09:00:00 +0000', author: 'Ada' },
      { authorDate: '2024-03-10 08:00:00 +0000', author: 'Ada' },
      { authorDate: '2024-03-10 18:00:00 +0000', author: 'Bea' },
      { authorDate: '2024-03-10 19:00:00 +0000', author: 'Bea' },
    ];
    expect(aggregateSummary(commits).days).toEqual([
      { date: '2024-03-10', count: 3, authors: [{ author: 'Bea', count: 2 }, { author: 'Ada', count: 1 }] },
      { date: '2024-03-11', count: 1, authors: [{ author: 'Ada', count: 1 }] },
    ]);
  });

  it('counts weekday and hour in the commit\'s own offset', () => {
    // 2024-03-10 is a Sunday; 23:30 in +0900 is still Sunday 23h for the author.
    const summary = aggregateSummary([
      { authorDate: '2024-03-10 23:30:00 +0900', author: 'Ada' },
      { authorDate: '2024-03-11 09:00:00 -0800', author: 'Ada' },
    ]);
    expect(summary.total).toBe(2);
    expect(summary.weekdays).toEqual([1, 1, 0, 0, 0, 0, 0]);
    expect(summary.hours[23]).toBe(1);
    expect(summary.hours[9]).toBe(1);
  });

  it('drops commits before since', () => {
    const summary = aggregateSummary(
      [
        { authorDate: '2024-03-09 09:00:00 +0000', author: 'Ada' },
        { authorDate: '2024-03-10 09:00:00 +0000', author: 'Ada' },
      ],
      { since: '2024-03-10' },
    );
    expect(summary.total).toBe(1);
    expect(summary.days.map((d) => d.date)).toEqual(['2024-03-10']);
  });

  it('respects each commit\'s own recorded offset at a day boundary instead of normalizing to UTC', () => {
    // 23:50 in -0800 and 00:10 in +0900 are ~40 minutes apart in wall time and
    // land on different UTC calendar days too, but the heatmap must bucket by
    // each commit's own printed date, not a UTC conversion.
    const commits: RawCommit[] = [
      { authorDate: '2024-06-30 23:50:00 -0800', author: 'Ada' },
      { authorDate: '2024-07-01 00:10:00 +0900', author: 'Bea' },
    ];
    expect(days(commits)).toEqual([
      { date: '2024-06-30', count: 1 },
      { date: '2024-07-01', count: 1 },
    ]);
  });
});

describe('aggregateDistribution', () => {
  it('returns empty buckets and authors for an empty repo', () => {
    expect(aggregateDistribution([])).toEqual({ buckets: [], authors: [] });
  });

  it('defaults to day granularity and counts per author', () => {
    const commits: RawCommit[] = [
      { authorDate: '2024-01-01 09:00:00 +0000', author: 'Ada' },
      { authorDate: '2024-01-01 10:00:00 +0000', author: 'Ada' },
      { authorDate: '2024-01-02 09:00:00 +0000', author: 'Bea' },
    ];
    expect(aggregateDistribution(commits)).toEqual({
      buckets: [
        { bucket: '2024-01-01', count: 2 },
        { bucket: '2024-01-02', count: 1 },
      ],
      authors: [
        { author: 'Ada', count: 2 },
        { author: 'Bea', count: 1 },
      ],
    });
  });

  it('buckets by month', () => {
    const commits: RawCommit[] = [
      { authorDate: '2024-01-05 09:00:00 +0000', author: 'Ada' },
      { authorDate: '2024-01-20 09:00:00 +0000', author: 'Ada' },
      { authorDate: '2024-02-01 09:00:00 +0000', author: 'Ada' },
    ];
    expect(aggregateDistribution(commits, { granularity: 'month' }).buckets).toEqual([
      { bucket: '2024-01', count: 2 },
      { bucket: '2024-02', count: 1 },
    ]);
  });

  it('buckets by ISO week, keeping a year-end week with its correct ISO week-numbering year', () => {
    // 2024-12-30 (Monday) through 2025-01-05 (Sunday) is ISO week 2025-W01.
    const commits: RawCommit[] = [
      { authorDate: '2024-12-30 09:00:00 +0000', author: 'Ada' },
      { authorDate: '2025-01-02 09:00:00 +0000', author: 'Ada' },
    ];
    expect(aggregateDistribution(commits, { granularity: 'week' }).buckets).toEqual([
      { bucket: '2025-W01', count: 2 },
    ]);
  });

  it('excludes commits outside an inclusive since/until range', () => {
    const commits: RawCommit[] = [
      { authorDate: '2024-01-01 09:00:00 +0000', author: 'Ada' },
      { authorDate: '2024-01-15 09:00:00 +0000', author: 'Ada' },
      { authorDate: '2024-01-31 09:00:00 +0000', author: 'Ada' },
      { authorDate: '2024-02-01 09:00:00 +0000', author: 'Ada' },
    ];
    const result = aggregateDistribution(commits, { since: '2024-01-01', until: '2024-01-31' });
    expect(result.buckets).toHaveLength(31);
    expect(result.buckets.filter((b) => b.count > 0)).toEqual([
      { bucket: '2024-01-01', count: 1 },
      { bucket: '2024-01-15', count: 1 },
      { bucket: '2024-01-31', count: 1 },
    ]);
  });

  it('zero-fills empty buckets across a month and year boundary', () => {
    const commits: RawCommit[] = [
      { authorDate: '2024-11-20 09:00:00 +0000', author: 'Ada' },
      { authorDate: '2025-02-03 09:00:00 +0000', author: 'Ada' },
    ];
    expect(aggregateDistribution(commits, { granularity: 'month' }).buckets).toEqual([
      { bucket: '2024-11', count: 1 },
      { bucket: '2024-12', count: 0 },
      { bucket: '2025-01', count: 0 },
      { bucket: '2025-02', count: 1 },
    ]);
    const days = aggregateDistribution(commits, { since: '2025-01-30', until: '2025-02-03' }).buckets;
    expect(days.map((b) => b.count)).toEqual([0, 0, 0, 0, 1]);
    expect(days[2].bucket).toBe('2025-02-01');
    expect(aggregateDistribution(commits, { granularity: 'week' }).buckets).toHaveLength(12);
  });

  it('sorts authors by descending commit count and falls back to "Unknown" for a blank author', () => {
    const commits: RawCommit[] = [
      { authorDate: '2024-01-01 09:00:00 +0000', author: 'Bea' },
      { authorDate: '2024-01-01 09:05:00 +0000', author: 'Ada' },
      { authorDate: '2024-01-01 09:10:00 +0000', author: 'Ada' },
      { authorDate: '2024-01-01 09:15:00 +0000', author: '  ' },
    ];
    expect(aggregateDistribution(commits).authors).toEqual([
      { author: 'Ada', count: 2 },
      { author: 'Bea', count: 1 },
      { author: 'Unknown', count: 1 },
    ]);
  });
});
