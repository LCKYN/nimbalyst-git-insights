import { useState } from 'react';
import { MaterialSymbol, type PanelHost } from '@nimbalyst/extension-sdk';
import { useBackendTool } from '../backendClient';
import { useSessionsForFile } from '../hooks/useSessionsForFile';
import { parseUnifiedDiff, type ChangeStatus, type WorkingChange } from '../workingChanges';

const BADGE: Record<ChangeStatus, { letter: string; label: string }> = {
  added: { letter: 'A', label: 'Added' },
  modified: { letter: 'M', label: 'Modified' },
  deleted: { letter: 'D', label: 'Deleted' },
  renamed: { letter: 'R', label: 'Renamed' },
  untracked: { letter: 'U', label: 'Untracked' },
  conflicted: { letter: '!', label: 'Conflicted' },
};

const SECTIONS: { title: string; match: (f: WorkingChange) => boolean }[] = [
  { title: 'Conflicts', match: (f) => f.status === 'conflicted' },
  { title: 'Changes', match: (f) => f.status !== 'conflicted' && f.status !== 'untracked' },
  { title: 'Untracked', match: (f) => f.status === 'untracked' },
];

function joinPath(workspacePath: string, relativePath: string): string {
  return `${workspacePath.replace(/\/+$/, '')}/${relativePath.replace(/^\/+/, '')}`;
}

function LineCounts({ added, deleted }: { added: number | null; deleted: number | null }) {
  if (added === null && deleted === null) return <span className="git-insights-muted">binary</span>;
  return (
    <span className="git-insights-line-counts">
      {!!added && <span className="git-insights-added">+{added}</span>}
      {!!deleted && <span className="git-insights-deleted">−{deleted}</span>}
    </span>
  );
}

function DiffView({ workspacePath, file }: { workspacePath: string; file: WorkingChange }) {
  // Refetch when the file's change stats move, not on every panel reload: with "Expand all"
  // that would be a git diff per open file per refresh.
  // ponytail: an edit that keeps the same +/− counts shows the old diff until re-expanded.
  const { data, error } = useBackendTool<{ diff: string; truncated: boolean }>(
    'get_file_diff',
    { repoPath: workspacePath, path: file.path, oldPath: file.oldPath, untracked: file.status === 'untracked' },
    `${file.status} ${file.added} ${file.deleted}`,
  );

  if (error && !data) return <div className="git-insights-error select-text">{error}</div>;
  if (!data) return <div className="git-insights-loading">Loading diff…</div>;

  const lines = parseUnifiedDiff(data.diff);
  if (lines.length === 0) return <div className="git-insights-muted">No content changes (mode or rename only).</div>;

  return (
    <div className="git-insights-diff select-text">
      {error && <div className="git-insights-error git-insights-error--stale select-text" title={error}>Couldn't refresh: {error}</div>}
      <table>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className={`git-insights-diff-line git-insights-diff-line--${line.kind}`}>
              <td className="git-insights-diff-num">{line.oldLine ?? ''}</td>
              <td className="git-insights-diff-num">{line.newLine ?? ''}</td>
              <td className="git-insights-diff-sign">{line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ''}</td>
              <td className="git-insights-diff-text">{line.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.truncated && <div className="git-insights-muted">Diff truncated. Open the file to see the rest.</div>}
    </div>
  );
}

interface RowProps {
  host: PanelHost;
  workspacePath: string;
  file: WorkingChange;
  expanded: boolean;
  onToggle: () => void;
}

function FileRow({ host, workspacePath, file, expanded, onToggle }: RowProps) {
  const absolutePath = joinPath(workspacePath, file.path);
  const { data: sessions, loading: sessionsLoading } = useSessionsForFile(workspacePath, absolutePath);
  const slash = file.path.lastIndexOf('/');
  const badge = BADGE[file.status];

  return (
    <li className="git-insights-change">
      <div className="git-insights-change-row">
        <button
          type="button"
          className="git-insights-icon-button"
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide diff' : 'Show diff'}
          onClick={onToggle}
        >
          <MaterialSymbol icon={expanded ? 'expand_more' : 'chevron_right'} size={16} />
        </button>
        <span className={`git-insights-badge git-insights-badge--${file.status}`} title={badge.label}>{badge.letter}</span>
        {file.staged && <span className="git-insights-staged-dot" title={file.unstaged ? 'Partially staged' : 'Staged'} />}
        <button
          type="button"
          className="git-insights-change-path"
          title={file.status === 'deleted' ? file.path : `Open ${file.path}`}
          disabled={file.status === 'deleted'}
          onClick={() => host.openFile(absolutePath)}
        >
          {slash >= 0 && <span className="git-insights-change-dir">{file.path.slice(0, slash + 1)}</span>}
          <span className="git-insights-change-name">{file.path.slice(slash + 1)}</span>
          {file.oldPath && <span className="git-insights-change-dir"> ← {file.oldPath}</span>}
        </button>
        <LineCounts added={file.added} deleted={file.deleted} />
        <span className="git-insights-change-sessions">
          {sessions.length === 0 ? (
            !sessionsLoading && <span className="git-insights-muted">No AI session</span>
          ) : (
            sessions.map((s) => (
              <span
                key={s.sessionId}
                className="git-insights-session-chip"
                title={`${s.title}\n${s.provider} · ${s.editCount} edit${s.editCount === 1 ? '' : 's'} · +${s.linesAdded} −${s.linesRemoved}`}
              >
                {s.title}
              </span>
            ))
          )}
        </span>
      </div>
      {expanded && <DiffView workspacePath={workspacePath} file={file} />}
    </li>
  );
}

/** Modified/untracked files with line counts, inline diffs, and AI-session attribution. */
export function UncommittedFilesTab({ host, workspacePath, reloadKey }: { host: PanelHost; workspacePath: string; reloadKey: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { data, error } = useBackendTool<{ files: WorkingChange[] }>('get_working_changes', { repoPath: workspacePath }, reloadKey);

  if (error && !data) return <div className="git-insights-error select-text">{error}</div>;
  if (!data) return <div className="git-insights-loading">Loading changes…</div>;
  if (data.files.length === 0) {
    return (
      <>
        {error && <div className="git-insights-error git-insights-error--stale select-text" title={error}>Couldn't refresh: {error}</div>}
        <div className="git-insights-muted">Working tree clean. No uncommitted changes.</div>
      </>
    );
  }

  const files = data.files;
  const added = files.reduce((sum, f) => sum + (f.added ?? 0), 0);
  const deleted = files.reduce((sum, f) => sum + (f.deleted ?? 0), 0);
  const allExpanded = expanded.size === files.length;
  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  return (
    <div className="git-insights-uncommitted">
      {error && <div className="git-insights-error git-insights-error--stale select-text" title={error}>Couldn't refresh: {error}</div>}
      <div className="git-insights-uncommitted-toolbar">
        <span className="git-insights-summary-stats">
          <span><strong>{files.length}</strong> file{files.length === 1 ? '' : 's'}</span>
          <span><strong>{files.filter((f) => f.staged).length}</strong> staged</span>
          <LineCounts added={added} deleted={deleted} />
        </span>
        <span className="git-insights-uncommitted-actions">
          <button
            type="button"
            className="git-insights-button"
            onClick={() => setExpanded(allExpanded ? new Set() : new Set(files.map((f) => f.path)))}
          >
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        </span>
      </div>

      {SECTIONS.map((section) => {
        const sectionFiles = files.filter(section.match);
        if (sectionFiles.length === 0) return null;
        return (
          <section key={section.title}>
            <h4 className="git-insights-section-title">{section.title} · {sectionFiles.length}</h4>
            <ul className="git-insights-change-list">
              {sectionFiles.map((file) => (
                <FileRow
                  key={file.path}
                  host={host}
                  workspacePath={workspacePath}
                  file={file}
                  expanded={expanded.has(file.path)}
                  onToggle={() => toggle(file.path)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
