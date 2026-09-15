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
  return new Promise((resolve, reject) => {
    const args = ['log', ref ?? '--all', `--format=${RECORD_SEPARATOR}%ai${FIELD_SEPARATOR}%an`];
    const child = spawn('git', args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`git log failed (exit ${code}): ${stderr.trim()}`));
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
