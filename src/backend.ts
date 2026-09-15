/**
 * Git Insights — backend module.
 *
 * Runs in an Electron utility-process. Shells out to `git`, `gh`, and `glab`
 * directly (this extension has no built-in IPC channels to call into, unlike
 * the in-app Git panel) and registers its capabilities as MCP tools so the
 * panel can reach them via `services.ai.callBackendTool` from the renderer.
 */
import { aggregateDistribution, aggregateHeatmap, type DistributionGranularity } from './commitActivity';
import { parseGitLogOutput, runGitLog } from './gitLog';
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

const TOOL_DESCRIPTORS = [
  {
    name: 'get_heatmap',
    description: 'Get a per-day commit count for the whole repository history (all branches), for a GitHub-style contribution heatmap.',
    inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, ref: { type: 'string' } } },
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

  await registerMcpTools(TOOL_DESCRIPTORS);

  async function loadCommits(repoPath: string | undefined, ref: string | undefined) {
    const cwd = repoPath || workspacePath;
    const raw = await runGitLog({ cwd, ref });
    return parseGitLogOutput(raw);
  }

  return {
    methods: {
      get_heatmap: async (params: { repoPath?: string; ref?: string }) => {
        const commits = await loadCommits(params?.repoPath, params?.ref);
        return { days: aggregateHeatmap(commits) };
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
        return createPullRequest(host, cwd);
      },
    },
  };
}
