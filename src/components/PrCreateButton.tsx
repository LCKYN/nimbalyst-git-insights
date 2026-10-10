import { useEffect, useState } from 'react';
import { callBackendTool } from '../backendClient';

interface CliStatusResult {
  host: 'github' | 'gitlab' | 'unknown';
  installed: boolean;
  authed: boolean;
  error?: string;
}

type CreateState = 'idle' | 'creating' | 'error';

/**
 * One-click PR/MR creation: detects the host, checks gh/glab, creates, opens the URL.
 * Renders nothing while checking, for non-GitHub/GitLab remotes, or if the check itself fails.
 */
export function PrCreateButton({ workspacePath, branch }: { workspacePath: string; branch?: string }) {
  const [status, setStatus] = useState<CliStatusResult | null>(null);
  const [createState, setCreateState] = useState<CreateState>('idle');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    callBackendTool<CliStatusResult>('check_pr_cli', { repoPath: workspacePath })
      .then((result) => { if (!cancelled) setStatus(result); })
      .catch((err) => console.error('Git Insights: PR CLI check failed', err));
    return () => { cancelled = true; };
  }, [workspacePath]);

  const handleCreate = async () => {
    setCreateState('creating');
    setCreateError(null);
    try {
      const result = await callBackendTool<{ url: string }>('create_pr', { repoPath: workspacePath });
      window.open(result.url, '_blank', 'noopener,noreferrer');
      setCreateState('idle');
    } catch (err) {
      setCreateState('error');
      setCreateError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!status || status.host === 'unknown') return null;

  const cli = status.host === 'github' ? 'gh' : 'glab';
  const label = status.host === 'github' ? 'pull request' : 'merge request';
  const blockedReason = !status.installed
    ? `Install ${cli} to create ${label}s.`
    : !status.authed
      ? `Run "${cli} auth login" to create ${label}s.`
      : branch === ''
        ? 'Check out a branch first (HEAD is detached).'
        : null;

  return (
    <div className="git-insights-pr-create">
      {/* aria-disabled, not disabled, so keyboard users can still focus it and hear the reason. */}
      <button
        type="button"
        className="git-insights-button git-insights-button--primary"
        aria-disabled={blockedReason ? true : undefined}
        disabled={createState === 'creating'}
        title={blockedReason ?? `Push ${branch ?? 'this branch'} and open a ${label}`}
        onClick={blockedReason ? undefined : handleCreate}
      >
        {createState === 'creating' ? `Creating ${label}…` : `Create ${label}`}
      </button>
      {createError && <div className="git-insights-pr-create-error select-text">{createError}</div>}
    </div>
  );
}
