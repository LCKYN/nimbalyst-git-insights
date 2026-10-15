/**
 * Git Insights — backend module.
 *
 * Runs in an Electron utility-process. Shells out to `git`, `gh`, and `glab`
 * directly (this extension has no built-in IPC channels to call into, unlike
 * the in-app Git panel) and registers its capabilities as MCP tools so the
 * panel can reach them via `services.ai.callBackendTool` from the renderer.
 */
import { aggregateDistribution, aggregateSummary, type DistributionGranularity } from './commitActivity';
import { DETAIL_LOG_FORMAT, GRAPH_LOG_FORMAT, layoutGraph, parseCommitDetail, parseGraphLogOutput } from './commitGraph';
import {
  assertHash,
  commitActionArgs,
  parseGitLogOutput,
  remoteActionArgs,
  revisionArgs,
  runGit,
  runGitLog,
  type CommitAction,
  type PullStrategy,
  type RemoteAction,
} from './gitLog';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseNumstatZ, parseStatusPorcelain, type WorkingChange } from './workingChanges';
import { checkCli, createPullRequest, detectHost, getOriginUrl } from './prHost';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface ActivateCtx {
  services: {
    workspacePath: string;
    log: (level: LogLevel, message: string, data?: unknown) => void;
    registerMcpTools: (
      tools: Array<{ name: string; description?: string; inputSchema?: unknown }>
    ) => Promise<{ registered: string[] }>;
  };
}

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const MAX_DIFF_LINES = 3000;

const TOOL_DESCRIPTORS = [
  {
    name: 'get_summary',
    description: 'Get per-day commit counts (with authors) plus commit totals by weekday and hour of day, optionally scoped to a ref and start date.',
    inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, ref: { type: 'string' }, since: { type: 'string' } } },
  },
  {
    name: 'get_branches',
    description: 'List local and remote branches and the current branch.',
    inputSchema: { type: 'object', properties: { repoPath: { type: 'string' } } },
  },
  {
    name: 'get_distribution',
    description: 'Get commit counts bucketed by day/week/month and by author, optionally scoped to a date range.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        ref: { type: 'string' },
        since: { type: 'string' },
        until: { type: 'string' },
        granularity: { type: 'string', enum: ['day', 'week', 'month'] },
      },
    },
  },
  {
    name: 'get_graph',
    description: 'Get the most recent commits across all branches with parents, refs, and a lane layout for drawing a branch graph.',
    inputSchema: {
      type: 'object',
      properties: { repoPath: { type: 'string' }, ref: { type: 'string' }, since: { type: 'string' }, limit: { type: 'number' } },
    },
  },
  {
    name: 'get_commit_detail',
    description: 'Get full message, author/committer, refs, and changed files with line counts for one commit.',
    inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, hash: { type: 'string' } }, required: ['hash'] },
  },
  {
    name: 'commit_action',
    description: 'Run a git operation on a commit: checkout, create_branch, create_tag, cherry_pick, or revert.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        hash: { type: 'string' },
        action: { type: 'string', enum: ['checkout', 'create_branch', 'create_tag', 'cherry_pick', 'revert'] },
        name: { type: 'string' },
      },
      required: ['hash', 'action'],
    },
  },
  {
    name: 'remote_action',
    description: 'Push the current branch, pull it (rebase/merge/ff-only), or fetch.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        action: { type: 'string', enum: ['push', 'pull', 'fetch'] },
        strategy: { type: 'string', enum: ['rebase', 'merge', 'ff-only'] },
      },
      required: ['action'],
    },
  },
  {
    name: 'get_working_changes',
    description: 'List uncommitted files with status (added/modified/deleted/renamed/untracked/conflicted), staged/unstaged flags, and line counts vs HEAD.',
    inputSchema: { type: 'object', properties: { repoPath: { type: 'string' } } },
  },
  {
    name: 'get_file_diff',
    description: 'Get the unified diff of one uncommitted file against HEAD (untracked files diff against empty).',
    inputSchema: {
      type: 'object',
      properties: { repoPath: { type: 'string' }, path: { type: 'string' }, oldPath: { type: 'string' }, untracked: { type: 'boolean' } },
      required: ['path'],
    },
  },
  {
    name: 'check_pr_cli',
    description: 'Detect the git host (GitHub/GitLab) from the "origin" remote and check whether gh/glab is installed and authenticated.',
    inputSchema: { type: 'object', properties: { repoPath: { type: 'string' } } },
  },
  {
    name: 'create_pr',
    description: 'Create a pull request (GitHub) or merge request (GitLab) via gh/glab for the current branch and return its URL.',
    inputSchema: { type: 'object', properties: { repoPath: { type: 'string' } } },
  },
];

export async function activate(ctx: ActivateCtx) {
  const { workspacePath, log, registerMcpTools } = ctx.services;

  // panelOnly: reachable only from this extension's panel, never listed to agents.
  await registerMcpTools(TOOL_DESCRIPTORS.map((t) => ({ ...t, panelOnly: true })));

  async function loadCommits(repoPath: string | undefined, ref: string | undefined) {
    const cwd = repoPath || workspacePath;
    const raw = await runGitLog({ cwd, ref });
    return parseGitLogOutput(raw);
  }

  /** HEAD, or the empty tree in a repo with no commits yet, so diffs still work. */
  async function diffBase(cwd: string): Promise<string> {
    try {
      return (await runGit(cwd, ['rev-parse', '--verify', '-q', 'HEAD'])).trim();
    } catch {
      return EMPTY_TREE;
    }
  }

  /**
   * Repo-writing actions run one at a time: a checkout during a pull, or a second
   * push from Create PR, fails with a clear message instead of a git lock error.
   */
  let writing: string | null = null;
  async function exclusive<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (writing) throw new Error(`Wait for the ${writing} to finish first.`);
    writing = label;
    try {
      return await fn();
    } finally {
      writing = null;
    }
  }

  /** Resolves a repo-relative path from the renderer, refusing anything outside the repo. */
  function insideRepo(cwd: string, file: string): string {
    const abs = path.resolve(cwd, file);
    if (!abs.startsWith(path.resolve(cwd) + path.sep)) throw new Error(`Path is outside the repository: ${file}`);
    return abs;
  }

  return {
    methods: {
      get_summary: async (params: { repoPath?: string; ref?: string; since?: string }) => {
        const commits = await loadCommits(params?.repoPath, params?.ref);
        return aggregateSummary(commits, { since: params?.since });
      },

      get_branches: async (params: { repoPath?: string }) => {
        const cwd = params?.repoPath || workspacePath;
        const [refs, current, counts] = await Promise.all([
          runGit(cwd, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes']),
          runGit(cwd, ['branch', '--show-current']),
          // Fails with no upstream (or detached HEAD): no counts to show then.
          runGit(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{u}']).catch(() => null),
        ]);
        const names = refs.split('\n').filter((ref) => ref && !ref.endsWith('/HEAD'));
        const [ahead, behind] = counts?.trim().split(/\s+/).map(Number) ?? [];
        return {
          current: current.trim(),
          upstream: counts ? { ahead, behind } : null,
          local: names.filter((ref) => ref.startsWith('refs/heads/')).map((ref) => ref.slice('refs/heads/'.length)),
          remote: names.filter((ref) => ref.startsWith('refs/remotes/')).map((ref) => ref.slice('refs/remotes/'.length)),
        };
      },

      get_distribution: async (params: {
        repoPath?: string;
        ref?: string;
        since?: string;
        until?: string;
        granularity?: DistributionGranularity;
      }) => {
        const commits = await loadCommits(params?.repoPath, params?.ref);
        return aggregateDistribution(commits, {
          since: params?.since,
          until: params?.until,
          granularity: params?.granularity,
        });
      },

      get_graph: async (params: { repoPath?: string; ref?: string; since?: string; limit?: number }) => {
        const cwd = params?.repoPath || workspacePath;
        const limit = Math.max(1, Math.min(2000, Math.floor(params?.limit ?? 300)));
        const args = ['log', ...revisionArgs(params?.ref), '--topo-order', `-n${limit}`, `--format=${GRAPH_LOG_FORMAT}`];
        if (params?.since) args.push(`--since=${params.since} 00:00`);
        return layoutGraph(parseGraphLogOutput(await runGit(cwd, args)));
      },

      get_commit_detail: async (params: { repoPath?: string; hash: string }) => {
        const cwd = params?.repoPath || workspacePath;
        const hash = assertHash(params?.hash);
        const [meta, numstat] = await Promise.all([
          runGit(cwd, ['show', '-s', `--format=${DETAIL_LOG_FORMAT}`, hash]),
          runGit(cwd, ['diff-tree', '-r', '--root', '--no-commit-id', '--numstat', '--diff-merges=first-parent', hash]),
        ]);
        return parseCommitDetail(meta, numstat);
      },

      commit_action: async (params: { repoPath?: string; hash: string; action: CommitAction; name?: string }) => {
        const cwd = params?.repoPath || workspacePath;
        const args = commitActionArgs(params?.action, params?.hash, params?.name);
        log('info', `[git-insights] git ${args.join(' ')}`);
        const output = await exclusive(params.action.replace('_', ' '), () => runGit(cwd, args));
        return { output: output.trim() };
      },

      remote_action: (params: { repoPath?: string; action: RemoteAction; strategy?: PullStrategy }) =>
        exclusive(params?.action ?? 'remote action', async () => {
          const cwd = params?.repoPath || workspacePath;
          let hasUpstream = false;
          if (params?.action === 'push') {
            hasUpstream = await runGit(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).then(() => true, () => false);
          }
          const args = remoteActionArgs(params?.action, { strategy: params?.strategy, hasUpstream });
          log('info', `[git-insights] git ${args.join(' ')}`);
          await runGit(cwd, args);
          return { ok: true };
        }),

      get_working_changes: async (params: { repoPath?: string }) => {
        const cwd = params?.repoPath || workspacePath;
        const base = await diffBase(cwd);
        const [status, numstat] = await Promise.all([
          runGit(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
          runGit(cwd, ['diff', base, '--numstat', '-z', '--no-renames']),
        ]);
        const counts = parseNumstatZ(numstat);
        const files: WorkingChange[] = await Promise.all(
          parseStatusPorcelain(status).map(async (file) => {
            if (file.status !== 'untracked') return { ...file, ...counts.get(file.path) };
            // ponytail: reads the whole file to count lines; skipped above 1 MB.
            try {
              const content = await readFile(insideRepo(cwd, file.path));
              if (content.length > 1_000_000 || content.includes(0)) return file;
              const text = content.toString('utf8');
              return { ...file, added: text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0, deleted: 0 };
            } catch {
              return file;
            }
          }),
        );
        return { files: files.sort((a, b) => a.path.localeCompare(b.path)) };
      },

      get_file_diff: async (params: { repoPath?: string; path: string; oldPath?: string; untracked?: boolean }) => {
        const cwd = params?.repoPath || workspacePath;
        const paths = [params?.oldPath, params?.path].filter((p): p is string => !!p);
        paths.forEach((p) => insideRepo(cwd, p));
        const raw = params?.untracked
          ? await runGit(cwd, ['diff', '--no-index', '--', '/dev/null', params.path], [0, 1])
          : await runGit(cwd, ['diff', '-M', await diffBase(cwd), '--', ...paths]);
        const lines = raw.split('\n');
        return { diff: lines.slice(0, MAX_DIFF_LINES).join('\n'), truncated: lines.length > MAX_DIFF_LINES };
      },

      check_pr_cli: async (params: { repoPath?: string }) => {
        const cwd = params?.repoPath || workspacePath;
        let origin: string;
        try {
          origin = await getOriginUrl(cwd);
        } catch (err) {
          return { host: 'unknown' as const, installed: false, authed: false, error: (err as Error).message };
        }
        const host = detectHost(origin);
        if (host === 'unknown') {
          return { host, installed: false, authed: false, error: 'Could not detect GitHub or GitLab from the "origin" remote.' };
        }
        const status = await checkCli(host, cwd);
        return { host, ...status };
      },

      create_pr: async (params: { repoPath?: string }) => {
        const cwd = params?.repoPath || workspacePath;
        const origin = await getOriginUrl(cwd);
        const host = detectHost(origin);
        if (host === 'unknown') {
          throw new Error('Could not detect GitHub or GitLab from the "origin" remote.');
        }
        log('info', `[git-insights] creating ${host === 'github' ? 'PR' : 'MR'} via ${host === 'github' ? 'gh' : 'glab'}`);
        return exclusive(host === 'github' ? 'pull request' : 'merge request', () => createPullRequest(host, cwd));
      },
    },
  };
}
