import { useMemo } from 'react';
import { heatmapGrid, type HeatmapDay } from '../commitActivity';
import { useTooltip } from './Tooltip';

const CELL_SIZE = 11;
const CELL_GAP = 3;
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

const DATE_LABEL = new Intl.DateTimeFormat(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
const MONTH_LABEL = new Intl.DateTimeFormat(undefined, { month: 'short' });
const LEFT = 28;
const TOP = 14;
/** Rows 1/3/5 of a Sunday-first week. */
const WEEKDAY_LABELS: [number, string][] = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']];

/** GitHub-style contribution grid, `weeks` columns ending today, one column per week. */
export function HeatmapCalendar({ days, weeks: weekCount }: { days: HeatmapDay[]; weeks: number }) {
  const tooltip = useTooltip();
  const dayByDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const maxCount = useMemo(() => days.reduce((max, d) => Math.max(max, d.count), 0), [days]);

  // `days` changes on every reload, which also rolls the grid over past midnight.
  const weeks = useMemo(() => heatmapGrid(new Date(), weekCount), [days, weekCount]);

  // A month label sits over the first week that starts in that month; skip one
  // that would collide with the next (the partial first column).
  const months = weeks.flatMap((column, i) =>
    i === 0 || column[0].date.getMonth() !== weeks[i - 1][0].date.getMonth()
      ? [{ week: i, label: MONTH_LABEL.format(column[0].date) }]
      : [],
  ).filter((m, i, all) => !all[i + 1] || all[i + 1].week - m.week >= 3);

  const width = LEFT + weekCount * (CELL_SIZE + CELL_GAP);
  const height = TOP + DAYS_PER_WEEK * (CELL_SIZE + CELL_GAP);

  return (
    <div className="git-insights-heatmap">
      <svg width={width} height={height} role="img" aria-label="Commit activity heatmap">
        {months.map((m) => (
          <text key={m.week} className="git-insights-heatmap-label" x={LEFT + m.week * (CELL_SIZE + CELL_GAP)} y={TOP - 4}>
            {m.label}
          </text>
        ))}
        {WEEKDAY_LABELS.map(([row, label]) => (
          <text key={label} className="git-insights-heatmap-label" x={0} y={TOP + row * (CELL_SIZE + CELL_GAP) + CELL_SIZE - 2}>
            {label}
          </text>
        ))}
        {weeks.map((column, weekIndex) => (
          <g key={weekIndex} transform={`translate(${LEFT + weekIndex * (CELL_SIZE + CELL_GAP)}, ${TOP})`}>
            {column.map((cell, dayIndex) => {
              const day = dayByDate.get(cell.key);
              const count = day?.count ?? 0;
              const step = intensityStep(count, maxCount);
              return (
                <rect
                  key={cell.key}
                  y={dayIndex * (CELL_SIZE + CELL_GAP)}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  rx={2}
                  fill="var(--nim-primary)"
                  fillOpacity={INTENSITY_STEPS[step]}
                  stroke={step === 0 ? 'var(--nim-border)' : 'none'}
                  strokeWidth={1}
                  onMouseMove={(e) =>
                    tooltip.show(
                      e,
                      <>
                        <strong>{DATE_LABEL.format(cell.date)}</strong>
                        <div>{count} commit{count === 1 ? '' : 's'}</div>
                        {day?.authors.slice(0, 5).map((a) => (
                          <div key={a.author} className="git-insights-tooltip-row">
                            <span>{a.author}</span>
                            <span>{a.count}</span>
                          </div>
                        ))}
                      </>,
                    )
                  }
                  onMouseLeave={tooltip.hide}
                />
              );
            })}
          </g>
        ))}
      </svg>
      <div className="git-insights-heatmap-legend" style={{ width }}>
        Less
        {INTENSITY_STEPS.map((opacity, i) => (
          <svg key={i} width={CELL_SIZE} height={CELL_SIZE} aria-hidden="true">
            <rect
              width={CELL_SIZE}
              height={CELL_SIZE}
              rx={2}
              fill="var(--nim-primary)"
              fillOpacity={opacity}
              stroke={i === 0 ? 'var(--nim-border)' : 'none'}
            />
          </svg>
        ))}
        More
      </div>
      {tooltip.node}
    </div>
  );
}
