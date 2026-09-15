import { useMemo, useState } from 'react';
import type { DistributionBucket } from '../commitActivity';

const CHART_HEIGHT = 160;
const BAR_GAP = 2;

/**
 * Single-series magnitude bar chart (commit count per bucket). One hue, no
 * legend needed for a single series, recessive baseline, rounded bar tops,
 * per-bar hover tooltip — per the dataviz skill's mark-spec guidance.
 */
export function CommitDistributionChart({ buckets }: { buckets: DistributionBucket[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const maxCount = useMemo(() => buckets.reduce((max, b) => Math.max(max, b.count), 0), [buckets]);

  if (buckets.length === 0) {
    return <div className="git-insights-distribution-empty">No commits in this range.</div>;
  }

  const barWidth = Math.max(4, Math.min(24, 600 / buckets.length - BAR_GAP));

  return (
    <div className="git-insights-distribution-chart">
      <svg
        width="100%"
        height={CHART_HEIGHT}
        viewBox={`0 0 ${buckets.length * (barWidth + BAR_GAP)} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Commits per period"
      >
        <line
          x1={0} y1={CHART_HEIGHT - 1}
          x2={buckets.length * (barWidth + BAR_GAP)} y2={CHART_HEIGHT - 1}
          stroke="var(--nim-border)"
          strokeWidth={1}
        />
        {buckets.map((bucket, index) => {
          const barHeight = maxCount > 0 ? Math.max(1, (bucket.count / maxCount) * (CHART_HEIGHT - 4)) : 0;
          const isHovered = hovered === bucket.bucket;
          return (
            <rect
              key={bucket.bucket}
              x={index * (barWidth + BAR_GAP)}
              y={CHART_HEIGHT - 1 - barHeight}
              width={barWidth}
              height={barHeight}
              rx={2}
              fill="var(--nim-primary)"
              fillOpacity={isHovered ? 1 : 0.75}
              onMouseEnter={() => setHovered(bucket.bucket)}
              onMouseLeave={() => setHovered(null)}
            >
              <title>{`${bucket.bucket}: ${bucket.count} commit${bucket.count === 1 ? '' : 's'}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
