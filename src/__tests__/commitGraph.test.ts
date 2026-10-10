import { describe, expect, it } from 'vitest';
import { commitMatches, layoutGraph, parseCommitDetail, parseGraphLogOutput, type GraphCommit } from '../commitGraph';

const c = (hash: string, ...parents: string[]): GraphCommit => ({
  hash, parents, refs: [], subject: hash, author: 'a', authorDate: '2024-01-01',
});

describe('parseGraphLogOutput', () => {
  it('parses hash, parents, refs and subject', () => {
    const raw = '\x1eabc\x1fdef 123\x1fHEAD -> main, tag: v1\x1fFix it\x1fAda\x1f2024-01-01 09:00:00 +0000\n';
    expect(parseGraphLogOutput(raw)).toEqual([{
      hash: 'abc', parents: ['def', '123'], refs: ['HEAD -> main', 'tag: v1'],
      subject: 'Fix it', author: 'Ada', authorDate: '2024-01-01 09:00:00 +0000',
    }]);
    expect(parseGraphLogOutput('')).toEqual([]);
  });
});

describe('layoutGraph', () => {
  it('keeps a linear history in one lane', () => {
    const { rows, laneCount } = layoutGraph([c('C', 'B'), c('B', 'A'), c('A')]);
    expect(laneCount).toBe(1);
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0]);
  });

  it('puts a merged feature branch in its own lane and joins it back', () => {
    // M merges F into main; F branched from A; B is on main.
    const { rows, laneCount } = layoutGraph([c('M', 'B', 'F'), c('F', 'A'), c('B', 'A'), c('A')]);
    expect(laneCount).toBe(2);
    expect(rows.map((r) => r.lane)).toEqual([0, 1, 0, 0]);
    // Merge edge from M (lane 0) out to F's lane.
    expect(rows[1].segments).toContainEqual({ fromLane: 0, toLane: 1, color: 1 });
    // F's lane converges into A's lane at the fork point.
    expect(rows[3].segments).toContainEqual({ fromLane: 1, toLane: 0, color: 1 });
  });

  it('gives unmerged sibling branch tips separate lanes', () => {
    const { rows, laneCount } = layoutGraph([c('X', 'A'), c('Y', 'A'), c('Z', 'A'), c('A')]);
    expect(laneCount).toBe(3);
    expect(rows.map((r) => r.lane)).toEqual([0, 1, 2, 0]);
    expect(rows[3].segments.map((s) => s.toLane)).toEqual([0, 0, 0]);
  });
});

describe('parseCommitDetail', () => {
  it('splits subject/body and parses numstat including binary files', () => {
    const meta = ['abc', 'p1 p2', 'HEAD -> main', 'Ada', 'ada@x', '2024-01-01 10:00:00 +0000', 'Bea', 'bea@x', '2024-01-02 10:00:00 +0000', 'Subject line\n\nBody text\n'].join('\x1f');
    const detail = parseCommitDetail(meta, '3\t1\tsrc/a.ts\n-\t-\timg.png\n');
    expect(detail.subject).toBe('Subject line');
    expect(detail.body).toBe('Body text');
    expect(detail.parents).toEqual(['p1', 'p2']);
    expect(detail.files).toEqual([
      { path: 'src/a.ts', added: 3, deleted: 1 },
      { path: 'img.png', added: null, deleted: null },
    ]);
  });
});

describe('commitMatches', () => {
  const commit = { hash: 'a1b2c3d4', parents: [], refs: [], subject: 'Fix Heatmap labels', author: 'Ada Lovelace', authorDate: '' };

  it('matches subject and author case-insensitively, hash by prefix only', () => {
    expect(commitMatches(commit, 'heatmap')).toBe(true);
    expect(commitMatches(commit, 'LOVELACE')).toBe(true);
    expect(commitMatches(commit, 'a1b2')).toBe(true);
    expect(commitMatches(commit, 'c3d4')).toBe(false);
  });

  it('matches everything for a blank query', () => {
    expect(commitMatches(commit, '   ')).toBe(true);
  });
});
