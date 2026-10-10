import { spawn } from 'node:child_process';
import type { RawCommit } from './commitActivity';

const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';

export interface RunGitLogOptions {
  cwd: string;
  /** Defaults to `--all` so the heatmap/distribution cover every branch, not just HEAD. */
  ref?: string;
}

/**
 * Shells out to `git log` directly, bypassing the Git panel's `git:log` IPC
 * handler (capped at 200 commits) — a full-year heatmap or a wide date-range
 * distribution needs the whole history.
 */
export function runGitLog({ cwd, ref }: RunGitLogOptions): Promise<string> {
  return runGit(cwd, ['log', ...revisionArgs(ref), `--format=${RECORD_SEPARATOR}%ai${FIELD_SEPARATOR}%an`]);
}

/** One ref, or every branch and tag. Bare `--all` would also pull in stash entries as fake merge commits. */
export function revisionArgs(ref: string | undefined): string[] {
  return ref ? [assertRef(ref)] : ['--exclude=refs/stash', '--all'];
}

/** Rejects values git would parse as an option (e.g. `--output=...`) when passed where a ref or name belongs. */
export function assertRef(value: string): string {
  if (!value || value.startsWith('-') || /[\s\0]/.test(value)) {
    throw new Error(`Invalid git ref or name: ${JSON.stringify(value)}`);
  }
  return value;
}

export function assertHash(value: string): string {
  if (!/^[0-9a-f]{7,40}$/i.test(value ?? '')) {
    throw new Error(`Invalid commit hash: ${JSON.stringify(value)}`);
  }
  return value;
}

export type CommitAction = 'checkout' | 'create_branch' | 'create_tag' | 'cherry_pick' | 'revert';

/** git argv for a graph context-menu action. `name` is the branch to check out / branch or tag to create. */
export function commitActionArgs(action: CommitAction, hash: string, name?: string): string[] {
  assertHash(hash);
  switch (action) {
    case 'checkout':
      return name ? ['checkout', assertRef(name)] : ['checkout', '--detach', hash];
    case 'create_branch':
      return ['branch', assertRef(name ?? ''), hash];
    case 'create_tag':
      return ['tag', assertRef(name ?? ''), hash];
    case 'cherry_pick':
      return ['cherry-pick', hash];
    case 'revert':
      return ['revert', '--no-edit', hash];
    default:
      throw new Error(`Unknown commit action: ${String(action)}`);
  }
}

export type RemoteAction = 'push' | 'pull' | 'fetch';
export type PullStrategy = 'rebase' | 'merge' | 'ff-only';

const PULL_FLAG: Record<PullStrategy, string> = { rebase: '--rebase', merge: '--no-rebase', 'ff-only': '--ff-only' };

/**
 * git argv for a toolbar remote action. Push without an upstream publishes the
 * current branch to origin under the same name (as `create_pr` does).
 */
export function remoteActionArgs(action: RemoteAction, opts: { strategy?: PullStrategy; hasUpstream?: boolean } = {}): string[] {
  switch (action) {
    case 'push':
      return opts.hasUpstream ? ['push'] : ['push', '-u', 'origin', 'HEAD'];
    case 'pull':
      return ['pull', PULL_FLAG[opts.strategy ?? 'rebase'] ?? '--rebase'];
    case 'fetch':
      return ['fetch', '--prune'];
    default:
      throw new Error(`Unknown remote action: ${String(action)}`);
  }
}

/** `okCodes`: exit codes that still count as success (`git diff --no-index` exits 1 when files differ). */
export function runGit(cwd: string, args: string[], okCodes: number[] = [0]): Promise<string> {
  return new Promise((resolve, reject) => {
    // GIT_TERMINAL_PROMPT=0: a push/pull needing credentials fails fast instead of hanging on a prompt nobody sees.
    const child = spawn('git', args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === null || !okCodes.includes(code)) {
        reject(new Error(`git ${args[0]} failed (exit ${code}): ${stderr.trim()}`));
        return;
      }
      resolve(stdout);
    });
  });
}

export function parseGitLogOutput(raw: string): RawCommit[] {
  return raw
    .split(RECORD_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [authorDate, author] = entry.split(FIELD_SEPARATOR);
      return { authorDate: authorDate ?? '', author: author ?? '' };
    })
    .filter((commit) => commit.authorDate.length > 0);
}
