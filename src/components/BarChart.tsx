import { useTooltip } from './Tooltip';

export interface Bar {
  label: string;
  /** Axis label; omit to leave the slot blank (e.g. every third hour). */
  tick?: string;
  count: number;
}

/** Single-series labeled bar chart with a hover tooltip. */
export function BarChart({ bars, ariaLabel }: { bars: Bar[]; ariaLabel: string }) {
  const tooltip = useTooltip();
  const max = Math.max(1, ...bars.map((b) => b.count));

  return (
    <div className="git-insights-bars" role="img" aria-label={ariaLabel} style={{ gap: bars.length > 60 ? 1 : 3 }}>
      {bars.map((bar) => (
        <div
          key={bar.label}
          className="git-insights-bar-col"
          onMouseMove={(e) =>
            tooltip.show(
              e,
              <>
                <strong>{bar.label}</strong>
                <div>{bar.count} commit{bar.count === 1 ? '' : 's'}</div>
              </>,
            )
          }
          onMouseLeave={tooltip.hide}
        >
          <div className="git-insights-bar-track">
            <div className="git-insights-bar" style={{ height: `${(bar.count / max) * 100}%` }} />
          </div>
          <span className="git-insights-bar-tick">{bar.tick ?? ''}</span>
        </div>
      ))}
      {tooltip.node}
    </div>
  );
}
