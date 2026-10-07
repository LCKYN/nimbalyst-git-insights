import { describe, expect, it } from 'vitest';
import { parseNumstatZ, parseStatusPorcelain, parseUnifiedDiff } from '../workingChanges';

describe('parseStatusPorcelain', () => {
  it('maps XY codes to status and staged/unstaged flags, reading rename old paths', () => {
    const raw = ['M  staged.ts', ' M unstaged.ts', 'MM both.ts', 'A  new.ts', ' D gone.ts', 'R  to.ts', 'from.ts', 'UU clash.ts', '?? fresh.ts', ''].join('\0');
    expect(parseStatusPorcelain(raw).map(({ path, oldPath, status, staged, unstaged }) => [path, oldPath, status, staged, unstaged])).toEqual([
      ['staged.ts', undefined, 'modified', true, false],
      ['unstaged.ts', undefined, 'modified', false, true],
      ['both.ts', undefined, 'modified', true, true],
      ['new.ts', undefined, 'added', true, false],
      ['gone.ts', undefined, 'deleted', false, true],
      ['to.ts', 'from.ts', 'renamed', true, false],
      ['clash.ts', undefined, 'conflicted', false, true],
      ['fresh.ts', undefined, 'untracked', false, true],
    ]);
  });
});

describe('parseNumstatZ', () => {
  it('reads counts and marks binary as null', () => {
    const counts = parseNumstatZ('3\t1\ta.ts\0-\t-\timg.png\0');
    expect(counts.get('a.ts')).toEqual({ added: 3, deleted: 1 });
    expect(counts.get('img.png')).toEqual({ added: null, deleted: null });
  });
});

describe('parseUnifiedDiff', () => {
  it('drops headers and numbers old/new lines from the hunk header', () => {
    const diff = ['diff --git a/x b/x', 'index 1..2 100644', '--- a/x', '+++ b/x', '@@ -10,3 +10,3 @@ fn', ' keep', '-old', '+new', ' keep2', ''].join('\n');
    expect(parseUnifiedDiff(diff)).toEqual([
      { kind: 'hunk', text: '@@ -10,3 +10,3 @@ fn' },
      { kind: 'context', text: 'keep', oldLine: 10, newLine: 10 },
      { kind: 'del', text: 'old', oldLine: 11 },
      { kind: 'add', text: 'new', newLine: 11 },
      { kind: 'context', text: 'keep2', oldLine: 12, newLine: 12 },
    ]);
  });
});
