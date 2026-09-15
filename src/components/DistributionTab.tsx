import { useEffect, useState } from 'react';
import { callBackendTool } from '../backendClient';
import type { CommitDistribution, DistributionGranularity } from '../commitActivity';
import { CommitDistributionChart } from './CommitDistributionChart';

function defaultSince(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DistributionTab({ workspacePath }: { workspacePath: string }) {
  const [since, setSince] = useState(defaultSince);
  const [until, setUntil] = useState(today);
  const [granularity, setGranularity] = useState<DistributionGranularity>('day');
  const [distribution, setDistribution] = useState<CommitDistribution | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    callBackendTool<CommitDistribution>('get_distribution', { repoPath: workspacePath, since, until, granularity })
      .then((result) => { if (!cancelled) setDistribution(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [workspacePath, since, until, granularity]);

  return (
    <div className="git-insights-distribution">
      <div className="git-insights-distribution-controls">
        <label className="git-insights-date-field">
          Since
          <input type="date" value={since} max={until} onChange={(e) => setSince(e.target.value)} />
        </label>
        <label className="git-insights-date-field">
          Until
          <input type="date" value={until} min={since} max={today()} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <div className="git-insights-granularity-toggle" role="group" aria-label="Granularity">
          {(['day', 'week', 'month'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={option === granularity ? 'git-insights-granularity-button git-insights-granularity-button--active' : 'git-insights-granularity-button'}
              onClick={() => setGranularity(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="git-insights-error select-text">{error}</div>}
      {!error && !distribution && <div className="git-insights-loading">Loading commit history…</div>}
      {distribution && (
        <>
          <CommitDistributionChart buckets={distribution.buckets} />
          <ol className="git-insights-author-list">
            {distribution.authors.slice(0, 10).map((author) => (
              <li key={author.author} className="git-insights-author-row select-text">
                <span className="git-insights-author-name">{author.author}</span>
                <span className="git-insights-author-count">{author.count}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
