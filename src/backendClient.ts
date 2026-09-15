import type { ExtensionContext } from '@nimbalyst/extension-sdk';

/**
 * `context.services.ai` is only handed to the extension's top-level
 * `activate()` (see index.tsx) — panels don't receive it through `PanelHost`.
 * Stashing it here at activation lets panel components reach the backend
 * module's registered tools through the one read bridge the SDK exposes
 * (`ExtensionAIService.callBackendTool`), namespaced as `git-insights.<tool>`.
 */
let aiService: ExtensionContext['services']['ai'] | null = null;

export function setAiService(service: ExtensionContext['services']['ai'] | undefined): void {
  aiService = service ?? null;
}

export async function callBackendTool<T>(toolName: string, args?: Record<string, unknown>): Promise<T> {
  if (!aiService) {
    throw new Error('Git Insights: the backend module is not available yet. Reopen the panel and try again.');
  }
  return aiService.callBackendTool(`git-insights.${toolName}`, args) as Promise<T>;
}
