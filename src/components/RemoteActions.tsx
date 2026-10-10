import { useEffect, useRef, useState } from 'react';
import { MaterialSymbol } from '@nimbalyst/extension-sdk';
import { callBackendTool } from '../backendClient';
import type { PullStrategy, RemoteAction } from '../gitLog';

const STRATEGIES: { id: PullStrategy; label: string }[] = [
  { id: 'rebase', label: 'Rebase' },
  { id: 'merge', label: 'Merge' },
  { id: 'ff-only', label: 'Fast-forward only' },
];

const RUNNING: Record<RemoteAction, string> = { push: 'Pushing…', pull: 'Pulling…', fetch: 'Fetching…' };
const DONE: Record<RemoteAction, string> = { push: 'Pushed', pull: 'Pulled', fetch: 'Fetched' };

interface Props {
  workspacePath: string;
  /** Current branch; '' means detached HEAD. */
  branch?: string;
  strategy: PullStrategy;
  onStrategy: (strategy: PullStrategy) => void;
  onDone: (result: { error: boolean; text: string }) => void;
}

/** Push / Pull (with a strategy menu) / Fetch, mirroring the built-in Git panel's toolbar. */
export function RemoteActions({ workspacePath, branch, strategy, onStrategy, onDone }: Props) {
  const [busy, setBusy] = useState<RemoteAction | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const detachedReason = branch === '' ? 'Check out a branch first (HEAD is detached).' : null;

  useEffect(() => {
    if (!menuOpen) return;
    splitRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const onDown = (e: MouseEvent) => { if (!splitRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenuOpen(false);
      chevronRef.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const run = async (action: RemoteAction) => {
    setBusy(action);
    try {
      await callBackendTool('remote_action', { repoPath: workspacePath, action, strategy });
      onDone({ error: false, text: action === 'pull' ? `Pulled (${strategy})` : DONE[action] });
    } catch (err) {
      onDone({ error: true, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  // aria-disabled (not disabled) for detached HEAD, so the reason stays reachable by keyboard.
  const branchAction = (action: 'push' | 'pull', icon: string, label: string, title: string, className = '') => (
    <button
      type="button"
      className={`git-insights-button ${className}`}
      aria-disabled={detachedReason ? true : undefined}
      disabled={busy !== null}
      title={detachedReason ?? title}
      onClick={detachedReason ? undefined : () => run(action)}
    >
      <MaterialSymbol icon={icon} size={14} />
      {busy === action ? RUNNING[action] : label}
    </button>
  );

  return (
    <div className="git-insights-remote" role="group" aria-label="Remote">
      {branchAction('push', 'arrow_upward', 'Push', `Push ${branch || 'this branch'}`)}
      <div className="git-insights-split" ref={splitRef}>
        {branchAction('pull', 'arrow_downward', 'Pull', `Pull (${strategy})`)}
        <button
          ref={chevronRef}
          type="button"
          className="git-insights-button"
          aria-label="Pull strategy"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={busy !== null}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MaterialSymbol icon="expand_more" size={14} />
        </button>
        {menuOpen && (
          <div className="git-insights-menu git-insights-split-menu" role="menu" aria-label="Pull strategy">
            {STRATEGIES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitemradio"
                aria-checked={s.id === strategy}
                className="git-insights-menu-item"
                onClick={() => {
                  onStrategy(s.id);
                  setMenuOpen(false);
                  chevronRef.current?.focus();
                }}
              >
                <MaterialSymbol icon="check" size={14} style={{ visibility: s.id === strategy ? 'visible' : 'hidden' }} />
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" className="git-insights-button" disabled={busy !== null} title="Fetch from remotes" onClick={() => run('fetch')}>
        {busy === 'fetch' ? RUNNING.fetch : 'Fetch'}
      </button>
    </div>
  );
}
