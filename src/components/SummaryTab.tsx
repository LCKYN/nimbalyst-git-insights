import { useBackendTool } from '../backendClient';
import type { CommitSummary } from '../commitActivity';
import { BarChart } from './BarChart';
import type { InsightsFilter } from './GitInsightsPanel';
import { HeatmapCalendar } from './HeatmapCalendar';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function SummaryTab({ workspacePath, filter, reloadKey }: { workspacePath: string; filter: InsightsFilter; reloadKey: number }) {
  const { data, error } = useBackendTool<CommitSummary>('get_summary', { repoPath: workspacePath, ...filter }, reloadKey);

  if (error) {
    return <div className="git-insights-error select-text">{error}</div>;
  }
  if (!data) {
    return <div className="git-insights-loading">Loading commit history…</div>;
  }

  const busiestDay = data.weekdays.indexOf(Math.max(...data.weekdays));
  const busiestHour = data.hours.indexOf(Math.max(...data.hours));

  return (
    <div className="git-insights-summary">
      <div className="git-insights-summary-stats select-text">
        <span><strong>{data.total.toLocaleString()}</strong> commits</span>
        <span><strong>{data.days.length.toLocaleString()}</strong> active days</span>
        {data.total > 0 && (
          <>
            <span>busiest day <strong>{WEEKDAYS[busiestDay]}</strong></span>
            <span>busiest hour <strong>{String(busiestHour).padStart(2, '0')}:00</strong></span>
          </>
        )}
      </div>

      <HeatmapCalendar days={data.days} />

      <div className="git-insights-summary-charts">
        <section>
          <h4 className="git-insights-section-title">Day of week</h4>
          <BarChart
            ariaLabel="Commits by day of week"
            bars={data.weekdays.map((count, i) => ({ label: WEEKDAYS[i], tick: WEEKDAYS[i], count }))}
          />
        </section>
        <section>
          <h4 className="git-insights-section-title">Time of day</h4>
          <BarChart
            ariaLabel="Commits by hour of day"
            bars={data.hours.map((count, hour) => {
              const label = `${String(hour).padStart(2, '0')}:00`;
              return { label: `${label}–${String(hour).padStart(2, '0')}:59`, tick: hour % 3 === 0 ? String(hour) : undefined, count };
            })}
          />
        </section>
      </div>
    </div>
  );
}
