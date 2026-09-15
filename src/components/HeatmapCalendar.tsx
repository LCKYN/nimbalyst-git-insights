import { useMemo } from 'react';
import type { HeatmapDay } from '../commitActivity';

const CELL_SIZE = 11;
const CELL_GAP = 3;
const WEEKS = 53;
const DAYS_PER_WEEK = 7;

/** Sequential magnitude encoding: one hue, light -> dark, per dataviz guidance. */
const INTENSITY_STEPS = [0, 0.15, 0.35, 0.6, 1];

function intensityStep(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.05) return 1;
  if (ratio <= 0.25) return 2;
  if (ratio <= 0.6) return 3;
  return 4;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** GitHub-style 52x7 contribution grid, ending today, one column per week. */
export function HeatmapCalendar({ days }: { days: HeatmapDay[] }) {
  const countByDate = useMemo(() => new Map(days.map(d => [d.date, d.count])), [days]);
  const maxCount = useMemo(() => days.reduce((max, d) => Math.max(max, d.count), 0), [days]);

  const weeks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Start on the Sunday at or before (WEEKS * 7 - 1) days ago, so the grid's
    // rightmost column ends on today's week.
    const start = new Date(today);
    start.setDate(start.getDate() - (WEEKS * DAYS_PER_WEEK - 1) - start.getDay());

    const grid: { date: string; count: number }[][] = [];
    const cursor = new Date(start);
    for (let w = 0; w < WEEKS; w++) {
      const column: { date: string; count: number }[] = [];
      for (let d = 0; d < DAYS_PER_WEEK; d++) {
        const key = toDateKey(cursor);
        column.push({ date: key, count: countByDate.get(key) ?? 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
      grid.push(column);
    }
    return grid;
  }, [countByDate]);

  const width = WEEKS * (CELL_SIZE + CELL_GAP);
  const height = DAYS_PER_WEEK * (CELL_SIZE + CELL_GAP);

  return (
    <div className="git-insights-heatmap">
      <svg width={width} height={height} role="img" aria-label="Commit activity heatmap">
        {weeks.map((column, weekIndex) => (
          <g key={weekIndex} transform={`translate(${weekIndex * (CELL_SIZE + CELL_GAP)}, 0)`}>
            {column.map((cell) => {
              const step = intensityStep(cell.count, maxCount);
              return (
                <rect
                  key={cell.date}
                  y={(new Date(cell.date + 'T00:00:00').getDay()) * (CELL_SIZE + CELL_GAP)}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  rx={2}
                  fill="var(--nim-primary)"
                  fillOpacity={INTENSITY_STEPS[step]}
                  stroke={step === 0 ? 'var(--nim-border)' : 'none'}
                  strokeWidth={1}
                >
                  <title>{`${cell.count} commit${cell.count === 1 ? '' : 's'} on ${cell.date}`}</title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}
