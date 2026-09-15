import { describe, expect, it } from 'vitest';
import { aggregateDistribution, aggregateHeatmap, parseAuthorDateDay, type RawCommit } from '../commitActivity';

describe('parseAuthorDateDay', () => {
  it('takes the literal date prefix, not a UTC-converted date', () => {
    // Same wall-clock date and time, different recorded offsets: a naive
    // `new Date(...)` conversion to UTC would put these on different days.
    expect(parseAuthorDateDay('2024-01-01 23:30:00 +0000')).toBe('2024-01-01');
    expect(parseAuthorDateDay('2024-01-01 23:30:00 +0900')).toBe('2024-01-01');
    expect(parseAuthorDateDay('2024-01-01 23:30:00 -0800')).toBe('2024-01-01');
  });
});

describe('aggregateHeatmap', () => {
  it('returns an empty array for an empty repo', () => {
    expect(aggregateHeatmap([])).toEqual([]);
  });

  it('buckets a single commit into its own day with count 1', () => {
    const commits: RawCommit[] = [{ authorDate: '2024-03-10 09:00:00 +0000', author: 'Ada' }];
    expect(aggregateHeatmap(commits)).toEqual([{ date: '2024-03-10', count: 1 }]);
  });

  it('groups multiple commits on the same day and sorts by date', () => {
    const commits: RawCommit[] = [
      { authorDate: '2024-03-11 09:00:00 +0000', author: 'Ada' },
      { authorDate: '2024-03-10 08:00:00 +0000', author: 'Ada' },
      { authorDate: '2024-03-10 18:00:00 +0000', author: 'Bea' },
    ];
    expect(aggregateHeatmap(commits)).toEqual([
      { date: '2024-03-10', count: 2 },
      { date: '2024-03-11', count: 1 },
    ]);
  });

  it('respects each commit\'s own recorded offset at a day boundary instead of normalizing to UTC', () => {
    // 23:50 in -0800 and 00:10 in +0900 are ~40 minutes apart in wall time and
    // land on different UTC calendar days too, but the heatmap must bucket by
    // each commit's own printed date, not a UTC conversion.
    const commits: RawCommit[] = [
      { authorDate: '2024-06-30 23:50:00 -0800', author: 'Ada' },
      { authorDate: '2024-07-01 00:10:00 +0900', author: 'Bea' },
    ];
    expect(aggregateHeatmap(commits)).toEqual([
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
    expect(result.buckets).toEqual([
      { bucket: '2024-01-01', count: 1 },
      { bucket: '2024-01-15', count: 1 },
      { bucket: '2024-01-31', count: 1 },
    ]);
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
