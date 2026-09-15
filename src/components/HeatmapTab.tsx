import { useEffect, useState } from 'react';
import { callBackendTool } from '../backendClient';
import type { HeatmapDay } from '../commitActivity';
import { HeatmapCalendar } from './HeatmapCalendar';

export function HeatmapTab({ workspacePath }: { workspacePath: string }) {
  const [days, setDays] = useState<HeatmapDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    callBackendTool<{ days: HeatmapDay[] }>('get_heatmap', { repoPath: workspacePath })
      .then((result) => { if (!cancelled) setDays(result.days); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [workspacePath]);

  if (error) {
    return <div className="git-insights-error select-text">{error}</div>;
  }
  if (!days) {
    return <div className="git-insights-loading">Loading commit history…</div>;
  }

  return <HeatmapCalendar days={days} />;
}
