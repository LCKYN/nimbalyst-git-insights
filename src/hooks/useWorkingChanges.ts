import { useCallback, useEffect, useState } from 'react';

const ipc = (window as unknown as {
  electronAPI: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> };
}).electronAPI;

export interface WorkingChangeFile {
  /** Repo-relative path, as reported by `git:working-changes`. */
  path: string;
  status: 'modified' | 'untracked';
}

interface GitWorkingChanges {
  staged: Array<{ path: string; status: string }>;
  unstaged: Array<{ path: string; status: string }>;
  untracked: Array<{ path: string }>;
  conflicted: Array<{ path: string }>;
}

interface State {
  files: WorkingChangeFile[];
  loading: boolean;
  error: string | null;
}

const EMPTY: State = { files: [], loading: false, error: null };

/**
 * Modified/untracked files in the working tree, via the same `git:working-changes`
 * channel the Git panel's Changes tab uses (`git:status` only returns a branch
 * summary, not a file list — see GitHandlers.ts).
 */
export function useWorkingChanges(workspacePath: string | null): State & { refresh: () => void } {
  const [state, setState] = useState<State>(EMPTY);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken(t => t + 1), []);

  useEffect(() => {
    if (!workspacePath) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    setState(prev => ({ ...prev, loading: true, error: null }));

    ipc.invoke('git:working-changes', workspacePath)
      .then((result) => {
        if (cancelled) return;
        const changes = result as GitWorkingChanges;
        const files: WorkingChangeFile[] = [
          ...(changes?.unstaged ?? []).map(f => ({ path: f.path, status: 'modified' as const })),
          ...(changes?.staged ?? []).map(f => ({ path: f.path, status: 'modified' as const })),
          ...(changes?.untracked ?? []).map(f => ({ path: f.path, status: 'untracked' as const })),
        ];
        // A file can appear in both staged and unstaged; keep one row per path.
        const byPath = new Map(files.map(f => [f.path, f]));
        setState({ files: [...byPath.values()], loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ files: [], loading: false, error: err instanceof Error ? err.message : String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [workspacePath, refreshToken]);

  return { ...state, refresh };
}
