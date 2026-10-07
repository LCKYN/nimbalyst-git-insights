import { spawn } from 'node:child_process';
import os from 'node:os';

export type GitHost = 'github' | 'gitlab' | 'unknown';

export interface CliStatus {
  installed: boolean;
  authed: boolean;
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Electron's child-process PATH on a GUI launch (especially macOS) frequently
 * omits `/usr/local/bin`, `/opt/homebrew/bin`, and user-local bin dirs where
 * `gh`/`glab` commonly live — widen it rather than fail with "not found" when
 * the CLI is actually installed. Matches GhCliDetector's convention.
 */
function enhancedPath(): string {
  const home = os.homedir();
  const extra = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    `${home}/.local/bin`,
    `${home}/.npm-global/bin`,
  ];
  return [process.env.PATH, ...extra].filter(Boolean).join(':');
}

function run(cmd: string, args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      shell: false,
      // No TTY here: fail fast instead of hanging on a credential prompt.
      env: { ...process.env, PATH: enhancedPath(), GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (err) => resolve({ code: null, stdout: '', stderr: String(err) }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

export function detectHost(remoteUrl: string): GitHost {
  if (/github\.com/i.test(remoteUrl)) return 'github';
  if (/gitlab/i.test(remoteUrl)) return 'gitlab';
  return 'unknown';
}

export async function getOriginUrl(cwd: string): Promise<string> {
  const res = await run('git', ['remote', 'get-url', 'origin'], cwd);
  if (res.code !== 0) {
    throw new Error(res.stderr.trim() || 'No "origin" remote is configured for this repository.');
  }
  return res.stdout.trim();
}

function cliFor(host: 'github' | 'gitlab'): string {
  return host === 'github' ? 'gh' : 'glab';
}

export async function checkCli(host: 'github' | 'gitlab', cwd: string): Promise<CliStatus> {
  const cmd = cliFor(host);
  const versionCheck = await run(cmd, ['--version'], cwd);
  if (versionCheck.code !== 0) return { installed: false, authed: false };
  const authCheck = await run(cmd, ['auth', 'status'], cwd);
  return { installed: true, authed: authCheck.code === 0 };
}

function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/\S+/);
  return match ? match[0] : null;
}

/**
 * Shells out to `gh pr create --fill` / `glab mr create --fill`, matching
 * GhApiService's convention of shelling to the already-authenticated CLI
 * rather than embedding an API client. Throws with the CLI's own stderr when
 * it isn't installed, isn't authenticated, or the create itself fails (e.g.
 * no commits ahead of the base branch).
 */
export async function createPullRequest(host: 'github' | 'gitlab', cwd: string): Promise<{ url: string }> {
  const cmd = cliFor(host);
  const status = await checkCli(host, cwd);
  if (!status.installed) {
    throw new Error(`${cmd} is not installed. Install it from ${host === 'github' ? 'https://cli.github.com' : 'https://gitlab.com/gitlab-org/cli'} and try again.`);
  }
  if (!status.authed) {
    throw new Error(`${cmd} is not authenticated. Run "${cmd} auth login" and try again.`);
  }

  // Never push the base branch itself; the PR would be rejected anyway, after the push.
  const branch = (await run('git', ['branch', '--show-current'], cwd)).stdout.trim();
  if (!branch) throw new Error('HEAD is detached. Check out a branch first.');
  const originHead = (await run('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd)).stdout.trim();
  const base = originHead.replace(/^origin\//, '');
  if (base ? branch === base : branch === 'main' || branch === 'master') {
    throw new Error(`You're on ${branch}, the default branch. Switch to a feature branch to open a ${host === 'github' ? 'PR' : 'MR'}.`);
  }

  // gh/glab can't ask "where should we push?" without a TTY, so push first.
  const upstream = await run('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], cwd);
  const push = await run('git', upstream.code === 0 ? ['push'] : ['push', '-u', 'origin', 'HEAD'], cwd);
  if (push.code !== 0) {
    throw new Error(`git push failed: ${push.stderr.trim() || push.stdout.trim()}`);
  }

  const args = host === 'github' ? ['pr', 'create', '--fill'] : ['mr', 'create', '--fill', '--yes'];
  const res = await run(cmd, args, cwd);
  if (res.code !== 0) {
    // Both CLIs print the existing PR/MR's URL in the "already exists" error.
    const output = `${res.stdout}\n${res.stderr}`;
    const existing = /already exists/i.test(output) ? extractUrl(output) : null;
    if (existing) return { url: existing };
    throw new Error(res.stderr.trim() || res.stdout.trim() || `${cmd} ${args.join(' ')} failed.`);
  }
  const url = extractUrl(res.stdout) ?? extractUrl(res.stderr);
  if (!url) {
    throw new Error(`${cmd} did not report a URL:\n${(res.stdout + res.stderr).trim()}`);
  }
  return { url };
}
