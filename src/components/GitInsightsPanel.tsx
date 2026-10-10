import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { MaterialSymbol, type PanelHost, type PanelHostProps } from '@nimbalyst/extension-sdk';
import { useBackendTool } from '../backendClient';
import { localDateKey } from '../commitActivity';
import { DistributionTab } from './DistributionTab';
import { GraphTab } from './GraphTab';
import { PrCreateButton } from './PrCreateButton';
import { SummaryTab } from './SummaryTab';
import { UncommittedFilesTab } from './UncommittedFilesTab';

type TabId = 'graph' | 'summary' | 'distribution' | 'uncommitted';

const TABS: { id: TabId; label: string }[] = [
  { id: 'graph', label: 'Graph' },
  { id: 'summary', label: 'Summary' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'uncommitted', label: 'Uncommitted' },
];

/** Shared by Graph, Summary and Distribution. Unset fields mean "all branches" / "all time". */
export interface InsightsFilter {
  ref?: string;
  /** Inclusive YYYY-MM-DD lower bound. */
  since?: string;
}

const RANGES = [
  { id: '7d', label: '7d', days: 7 },
  { id: '30d', label: '30d', days: 30 },
  { id: '90d', label: '90d', days: 90 },
  { id: '1y', label: '1y', days: 365 },
  { id: 'all', label: 'All', days: 0 },
] as const;

type RangeId = (typeof RANGES)[number]['id'];

function sinceFor(range: RangeId): string | undefined {
  const days = RANGES.find((r) => r.id === range)?.days ?? 0;
  if (!days) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  return localDateKey(d);
}

export interface Branches {
  current: string;
  local: string[];
  remote: string[];
}

/** `useState` that survives closing the panel, via the extension's workspace storage. */
function useStored<T>(host: PanelHost, key: string, initial: T) {
  const [value, setValue] = useState<T>(() => host.storage.get<T>(key) ?? initial);
  const set = (next: T) => {
    setValue(next);
    void host.storage.set(key, next);
  };
  return [value, set] as const;
}

export function GitInsightsPanel({ host }: PanelHostProps) {
  const [activeTab, setActiveTab] = useStored<TabId>(host, 'activeTab', 'graph');
  const [ref, setRef] = useState('');
  const [range, setRange] = useStored<RangeId>(host, 'range', 'all');
  const [reloadKey, setReloadKey] = useState(0);
  const workspacePath = host.workspacePath;
  const { data: branches } = useBackendTool<Branches>('get_branches', { repoPath: workspacePath }, reloadKey);
  const reload = () => setReloadKey((k) => k + 1);
  const idBase = useId();
  const tabId = (id: TabId) => `${idBase}-tab-${id}`;

  // Roving tabindex: only the active tab is a tab stop; arrows/Home/End move and activate.
  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = TABS.findIndex((t) => t.id === activeTab);
    const target = ({ ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: TABS.length - 1 } as Record<string, number>)[e.key];
    if (target === undefined) return;
    e.preventDefault();
    const next = (target + TABS.length) % TABS.length;
    setActiveTab(TABS[next].id);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };

  // Commits, checkouts and edits all fire this; bursts collapse into one reload.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = host.onWorkspaceEvent('git:status-changed', () => {
      clearTimeout(timer);
      timer = setTimeout(() => setReloadKey((k) => k + 1), 500);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [host]);

  if (!workspacePath) {
    return <div className="git-insights-panel git-insights-empty">Open a workspace to see Git Insights.</div>;
  }

  const filter: InsightsFilter = { ref: ref || undefined, since: sinceFor(range) };

  return (
    <div className="git-insights-panel">
      <div className="git-insights-toolbar">
        {branches && (
          <span className="git-insights-branch select-text" title="Current branch">
            <span aria-hidden="true"><MaterialSymbol icon="call_split" size={16} /></span>
            <span className="git-insights-branch-name">{branches.current || 'detached HEAD'}</span>
          </span>
        )}
        <div className="git-insights-tabs" role="tablist" aria-label="Git Insights views" onKeyDown={onTabKeyDown}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={activeTab === tab.id}
              aria-controls={`${idBase}-panel`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={activeTab === tab.id ? 'git-insights-tab git-insights-tab--active' : 'git-insights-tab'}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab !== 'uncommitted' && (
          <div className="git-insights-filters">
            <select
              className="git-insights-select"
              aria-label="Branch"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
            >
              <option value="">All branches</option>
              {branches && branches.local.length > 0 && (
                <optgroup label="Local">
                  {branches.local.map((b) => (
                    <option key={b} value={b}>{b === branches.current ? `${b} (current)` : b}</option>
                  ))}
                </optgroup>
              )}
              {branches && branches.remote.length > 0 && (
                <optgroup label="Remote">
                  {branches.remote.map((b) => <option key={b} value={b}>{b}</option>)}
                </optgroup>
              )}
            </select>
            <div className="git-insights-segmented" role="group" aria-label="Date range">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={r.id === range ? 'git-insights-segmented-button git-insights-segmented-button--active' : 'git-insights-segmented-button'}
                  onClick={() => setRange(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <button type="button" className="git-insights-icon-button" title="Refresh" aria-label="Refresh" onClick={reload}>
          <MaterialSymbol icon="refresh" size={16} />
        </button>
        <PrCreateButton workspacePath={workspacePath} branch={branches?.current} />
      </div>

      <div className="git-insights-content" role="tabpanel" id={`${idBase}-panel`} aria-labelledby={tabId(activeTab)}>
        {activeTab === 'graph' && (
          <GraphTab
            host={host}
            workspacePath={workspacePath}
            filter={filter}
            branches={branches}
            reloadKey={reloadKey}
            onRepoChanged={reload}
          />
        )}
        {activeTab === 'summary' && <SummaryTab workspacePath={workspacePath} filter={filter} range={range} reloadKey={reloadKey} />}
        {/* Keyed by range so a manual granularity pick resets to auto when the range changes. */}
        {activeTab === 'distribution' && <DistributionTab key={range} workspacePath={workspacePath} filter={filter} reloadKey={reloadKey} />}
        {activeTab === 'uncommitted' && <UncommittedFilesTab host={host} workspacePath={workspacePath} reloadKey={reloadKey} />}
      </div>
    </div>
  );
}
