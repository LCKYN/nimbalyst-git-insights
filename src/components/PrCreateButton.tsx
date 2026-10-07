import { useEffect, useState } from 'react';
import { callBackendTool } from '../backendClient';

interface CliStatusResult {
  host: 'github' | 'gitlab' | 'unknown';
  installed: boolean;
  authed: boolean;
  error?: string;
}

type CreateState = 'idle' | 'creating' | 'error';

/** One-click PR/MR creation: detects the host, checks gh/glab, creates, opens the URL. */
export function PrCreateButton({ workspacePath, branch }: { workspacePath: string; branch?: string }) {
  const [status, setStatus] = useState<CliStatusResult | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [createState, setCreateState] = useState<CreateState>('idle');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    callBackendTool<CliStatusResult>('check_pr_cli', { repoPath: workspacePath })
      .then((result) => { if (!cancelled) setStatus(result); })
      .catch((err) => { if (!cancelled) setStatusError(err instanceof Error ? err.message : String(err)); });
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

  if (statusError) {
    return <div className="git-insights-pr-create git-insights-pr-create--error select-text">{statusError}</div>;
  }

  if (!status) {
    return <div className="git-insights-pr-create">Checking gh/glab…</div>;
  }

  if (status.host === 'unknown') {
    return <div className="git-insights-pr-create git-insights-pr-create--error select-text">{status.error}</div>;
  }

  const cli = status.host === 'github' ? 'gh' : 'glab';
  const label = status.host === 'github' ? 'Pull Request' : 'Merge Request';

  if (!status.installed) {
    return <div className="git-insights-pr-create git-insights-pr-create--error select-text">{cli} is not installed.</div>;
  }
  if (!status.authed) {
    return <div className="git-insights-pr-create git-insights-pr-create--error select-text">{cli} is not authenticated. Run "{cli} auth login".</div>;
  }

  return (
    <div className="git-insights-pr-create">
      <button
        type="button"
        className="git-insights-pr-create-button"
        disabled={createState === 'creating' || branch === ''}
        title={branch === '' ? 'Check out a branch first (HEAD is detached).' : `Push ${branch ?? 'this branch'} and open a ${label.toLowerCase()}`}
        onClick={handleCreate}
      >
        {createState === 'creating' ? `Creating ${label}…` : `Create ${label}`}
      </button>
      {createError && <div className="git-insights-pr-create-error select-text">{createError}</div>}
    </div>
  );
}
