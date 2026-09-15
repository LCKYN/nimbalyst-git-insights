import { useSessionsForFile } from '../hooks/useSessionsForFile';
import { useWorkingChanges, type WorkingChangeFile } from '../hooks/useWorkingChanges';

function joinPath(workspacePath: string, relativePath: string): string {
  return `${workspacePath.replace(/\/+$/, '')}/${relativePath.replace(/^\/+/, '')}`;
}

function FileSessionsRow({ workspacePath, file }: { workspacePath: string; file: WorkingChangeFile }) {
  const absolutePath = joinPath(workspacePath, file.path);
  const { data, loading } = useSessionsForFile(workspacePath, absolutePath);

  return (
    <li className="git-insights-uncommitted-row">
      <div className="git-insights-uncommitted-file">
        <span className={`git-insights-uncommitted-status git-insights-uncommitted-status--${file.status}`}>
          {file.status === 'untracked' ? 'U' : 'M'}
        </span>
        <span className="select-text">{file.path}</span>
      </div>
      <div className="git-insights-uncommitted-sessions">
        {loading && data.length === 0 && <span className="git-insights-muted">Loading…</span>}
        {!loading && data.length === 0 && <span className="git-insights-muted">No AI session recorded</span>}
        {data.map((session) => (
          <span key={session.sessionId} className="git-insights-session-chip select-text" title={session.title}>
            {session.title}
          </span>
        ))}
      </div>
    </li>
  );
}

/** Modified/untracked files with AI-session attribution, before anything is committed. */
export function UncommittedFilesTab({ workspacePath }: { workspacePath: string }) {
  const { files, loading, error, refresh } = useWorkingChanges(workspacePath);

  if (error) {
    return <div className="git-insights-uncommitted-error select-text">{error}</div>;
  }

  if (!loading && files.length === 0) {
    return <div className="git-insights-uncommitted-empty">No modified or untracked files.</div>;
  }

  return (
    <div className="git-insights-uncommitted">
      <div className="git-insights-uncommitted-toolbar">
        <button type="button" onClick={refresh} className="git-insights-refresh-button">Refresh</button>
      </div>
      <ul className="git-insights-uncommitted-list">
        {files.map((file) => (
          <FileSessionsRow key={file.path} workspacePath={workspacePath} file={file} />
        ))}
      </ul>
    </div>
  );
}
