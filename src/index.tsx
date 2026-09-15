import type { ExtensionContext } from '@nimbalyst/extension-sdk';
import { setAiService } from './backendClient';
import { GitInsightsPanel } from './components/GitInsightsPanel';
import './styles.css';

export function activate(context: ExtensionContext): void {
  setAiService(context.services.ai);
}

export function deactivate(): void {
  setAiService(undefined);
}

export const panels = {
  'git-insights': { component: GitInsightsPanel },
};
