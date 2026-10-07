import { useState } from 'react';
import { useBackendTool } from '../backendClient';
import { localDateKey, type CommitDistribution, type DistributionGranularity } from '../commitActivity';
import { BarChart } from './BarChart';
import type { InsightsFilter } from './GitInsightsPanel';

const MAX_TICKS = 8;

/** Bucket size that keeps the bar count readable for the selected range. */
function autoGranularity(since: string | undefined): DistributionGranularity {
  if (!since) return 'month';
  const days = (Date.now() - new Date(`${since}T00:00:00`).getTime()) / 86_400_000;
  return days <= 31 ? 'day' : days <= 366 ? 'week' : 'month';
}

function tickLabel(bucket: string, granularity: DistributionGranularity): string {
  return granularity === 'month' ? bucket : bucket.slice(5);
}

export function DistributionTab({ workspacePath, filter, reloadKey }: { workspacePath: string; filter: InsightsFilter; reloadKey: number }) {
  const [picked, setPicked] = useState<DistributionGranularity | null>(null);
  const granularity = picked ?? autoGranularity(filter.since);
  const { data: distribution, error } = useBackendTool<CommitDistribution>(
    'get_distribution',
    // `until` = today so the chart runs right up to now, quiet days included.
    { repoPath: workspacePath, ...filter, until: filter.since ? localDateKey(new Date()) : undefined, granularity },
    reloadKey,
  );

  const buckets = distribution?.buckets ?? [];
  const every = Math.ceil(buckets.length / MAX_TICKS);
  const total = distribution?.authors.reduce((sum, a) => sum + a.count, 0) ?? 0;

  return (
    <div className="git-insights-distribution">
      <div className="git-insights-distribution-controls">
        <div className="git-insights-granularity-toggle" role="group" aria-label="Granularity">
          {(['day', 'week', 'month'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={option === granularity ? 'git-insights-granularity-button git-insights-granularity-button--active' : 'git-insights-granularity-button'}
              onClick={() => setPicked(option)}
            >
              {option}
            </button>
          ))}
        </div>
        {distribution && <span className="git-insights-muted">{total.toLocaleString()} commits</span>}
      </div>

      {error && <div className="git-insights-error select-text">{error}</div>}
      {!error && !distribution && <div className="git-insights-loading">Loading commit history…</div>}
      {distribution && buckets.length === 0 && <div className="git-insights-muted">No commits in this range.</div>}
      {buckets.length > 0 && (
        <>
          <BarChart
            ariaLabel={`Commits per ${granularity}`}
            bars={buckets.map((b, i) => ({
              label: b.bucket,
              tick: i % every === 0 ? tickLabel(b.bucket, granularity) : undefined,
              count: b.count,
            }))}
          />
          <h4 className="git-insights-section-title git-insights-author-title">Top authors</h4>
          <ol className="git-insights-author-list">
            {distribution!.authors.slice(0, 10).map((author) => (
              <li key={author.author} className="git-insights-author-row select-text">
                <span className="git-insights-author-name">{author.author}</span>
                <span className="git-insights-author-share">
                  <span style={{ width: `${(author.count / total) * 100}%` }} />
                </span>
                <span className="git-insights-author-count">
                  {author.count.toLocaleString()} · {Math.round((author.count / total) * 100)}%
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
