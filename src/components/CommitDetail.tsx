import { copyToClipboard, type PanelHost } from '@nimbalyst/extension-sdk';
import { useBackendTool } from '../backendClient';
import type { CommitDetail as CommitDetailData } from '../commitGraph';

interface Props {
  host: PanelHost;
  workspacePath: string;
  hash: string;
  onSelect: (hash: string) => void;
  onClose: () => void;
}

/** Right-hand pane for the selected graph commit: full message, people, parents, refs, changed files. */
export function CommitDetail({ host, workspacePath, hash, onSelect, onClose }: Props) {
  const { data, error } = useBackendTool<CommitDetailData>('get_commit_detail', { repoPath: workspacePath, hash });
  const detail = data?.hash === hash ? data : null;

  const added = detail?.files.reduce((sum, f) => sum + (f.added ?? 0), 0) ?? 0;
  const deleted = detail?.files.reduce((sum, f) => sum + (f.deleted ?? 0), 0) ?? 0;

  return (
    <aside className="git-insights-detail">
      <div className="git-insights-detail-header">
        <strong className="select-text">{detail?.subject ?? hash.slice(0, 7)}</strong>
        <button type="button" className="git-insights-icon-button" aria-label="Close details" onClick={onClose}>×</button>
      </div>

      {error && <div className="git-insights-error select-text">{error}</div>}
      {!error && !detail && <div className="git-insights-loading">Loading commit…</div>}
      {detail && (
        <>
          {detail.body && <pre className="git-insights-detail-body select-text">{detail.body}</pre>}
          <dl className="git-insights-detail-meta select-text">
            <dt>Commit</dt>
            <dd>
              <code>{detail.hash}</code>{' '}
              <button type="button" className="git-insights-link-button" onClick={() => copyToClipboard(detail.hash)}>copy</button>
            </dd>
            <dt>Author</dt>
            <dd>{detail.author} &lt;{detail.authorEmail}&gt;</dd>
            <dt>Date</dt>
            <dd>{detail.authorDate}</dd>
            {(detail.committer !== detail.author || detail.committerDate !== detail.authorDate) && (
              <>
                <dt>Committer</dt>
                <dd>{detail.committer} &lt;{detail.committerEmail}&gt; · {detail.committerDate}</dd>
              </>
            )}
            {detail.parents.length > 0 && (
              <>
                <dt>Parent{detail.parents.length > 1 ? 's' : ''}</dt>
                <dd>
                  {detail.parents.map((parent) => (
                    <button key={parent} type="button" className="git-insights-link-button" onClick={() => onSelect(parent)}>
                      {parent.slice(0, 7)}
                    </button>
                  ))}
                </dd>
              </>
            )}
            {detail.refs.length > 0 && (
              <>
                <dt>Refs</dt>
                <dd>{detail.refs.join(', ')}</dd>
              </>
            )}
          </dl>

          <div className="git-insights-section-title">
            {detail.files.length} file{detail.files.length === 1 ? '' : 's'} changed
            <span className="git-insights-added"> +{added}</span>
            <span className="git-insights-deleted"> −{deleted}</span>
          </div>
          <ul className="git-insights-detail-files">
            {detail.files.map((file) => (
              <li key={file.path}>
                {/* Renames print as "old => new"; there is no single path to open. */}
                {file.path.includes(' => ') ? (
                  <span className="git-insights-detail-file select-text">{file.path}</span>
                ) : (
                  <button
                    type="button"
                    className="git-insights-detail-file git-insights-link-button"
                    title="Open file"
                    onClick={() => host.openFile(`${workspacePath.replace(/\/+$/, '')}/${file.path}`)}
                  >
                    {file.path}
                  </button>
                )}
                {file.added === null ? (
                  <span className="git-insights-muted">binary</span>
                ) : (
                  <span>
                    <span className="git-insights-added">+{file.added}</span>{' '}
                    <span className="git-insights-deleted">−{file.deleted}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
