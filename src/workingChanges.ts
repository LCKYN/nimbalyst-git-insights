export type ChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';

export interface WorkingChange {
  /** Repo-relative path (the new path for renames). */
  path: string;
  oldPath?: string;
  status: ChangeStatus;
  /** Has changes in the index. */
  staged: boolean;
  /** Has changes in the working tree not yet staged. */
  unstaged: boolean;
  /** Lines vs HEAD; null for binary or unknown. */
  added: number | null;
  deleted: number | null;
}

const CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

/** Parses `git status --porcelain=v1 -z`. Renames carry the old path as the next NUL field. */
export function parseStatusPorcelain(raw: string): WorkingChange[] {
  const fields = raw.split('\0');
  const changes: WorkingChange[] = [];
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i];
    if (entry.length < 4) continue;
    const x = entry[0];
    const y = entry[1];
    const path = entry.slice(3);
    const oldPath = x === 'R' || x === 'C' ? fields[++i] : undefined;

    let status: ChangeStatus;
    if (x === '?') status = 'untracked';
    else if (CONFLICT_CODES.has(x + y)) status = 'conflicted';
    else if (x === 'R') status = 'renamed';
    else if (x === 'A' || x === 'C') status = 'added';
    else if (x === 'D' || y === 'D') status = 'deleted';
    else status = 'modified';

    changes.push({
      path,
      ...(oldPath ? { oldPath } : {}),
      status,
      staged: status !== 'untracked' && status !== 'conflicted' && x !== ' ',
      unstaged: status === 'untracked' || status === 'conflicted' || y !== ' ',
      added: null,
      deleted: null,
    });
  }
  return changes;
}

/** Parses `git diff --numstat -z --no-renames` into path -> line counts (null for binary). */
export function parseNumstatZ(raw: string): Map<string, { added: number | null; deleted: number | null }> {
  const counts = new Map<string, { added: number | null; deleted: number | null }>();
  for (const record of raw.split('\0')) {
    const [added, deleted, ...path] = record.split('\t');
    if (path.length === 0) continue;
    counts.set(path.join('\t'), {
      added: added === '-' ? null : Number(added),
      deleted: deleted === '-' ? null : Number(deleted),
    });
  }
  return counts;
}

export interface DiffLine {
  kind: 'hunk' | 'add' | 'del' | 'context' | 'note';
  text: string;
  oldLine?: number;
  newLine?: number;
}

/** Turns unified diff output into display lines with old/new line numbers, dropping file headers. */
export function parseUnifiedDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const line of diff.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      lines.push({ kind: 'hunk', text: line });
    } else if (!inHunk) {
      // "Binary files ... differ" is the only header line worth showing.
      if (line.startsWith('Binary files')) lines.push({ kind: 'note', text: line });
    } else if (line.startsWith('+')) {
      lines.push({ kind: 'add', text: line.slice(1), newLine: newLine++ });
    } else if (line.startsWith('-')) {
      lines.push({ kind: 'del', text: line.slice(1), oldLine: oldLine++ });
    } else if (line.startsWith(' ')) {
      lines.push({ kind: 'context', text: line.slice(1), oldLine: oldLine++, newLine: newLine++ });
    } else if (line.startsWith('\\')) {
      lines.push({ kind: 'note', text: line });
    } else if (line.startsWith('diff ')) {
      inHunk = false;
    }
  }
  return lines;
}
