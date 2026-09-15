import { useState } from 'react';
import type { PanelHostProps } from '@nimbalyst/extension-sdk';
import { DistributionTab } from './DistributionTab';
import { HeatmapTab } from './HeatmapTab';
import { PrCreateButton } from './PrCreateButton';
import { UncommittedFilesTab } from './UncommittedFilesTab';

type TabId = 'heatmap' | 'distribution' | 'uncommitted';

const TABS: { id: TabId; label: string }[] = [
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'uncommitted', label: 'Uncommitted' },
];

export function GitInsightsPanel({ host }: PanelHostProps) {
  const [activeTab, setActiveTab] = useState<TabId>('heatmap');
  const workspacePath = host.workspacePath;

  if (!workspacePath) {
    return <div className="git-insights-panel git-insights-empty">Open a workspace to see Git Insights.</div>;
  }

  return (
    <div className="git-insights-panel">
      <div className="git-insights-toolbar">
        <div className="git-insights-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? 'git-insights-tab git-insights-tab--active' : 'git-insights-tab'}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <PrCreateButton workspacePath={workspacePath} />
      </div>

      <div className="git-insights-content">
        {activeTab === 'heatmap' && <HeatmapTab workspacePath={workspacePath} />}
        {activeTab === 'distribution' && <DistributionTab workspacePath={workspacePath} />}
        {activeTab === 'uncommitted' && <UncommittedFilesTab workspacePath={workspacePath} />}
      </div>
    </div>
  );
}
