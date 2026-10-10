import { useEffect, useState } from 'react';
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

/**
 * Calls a backend tool whenever `args` (compared by value) or `reloadKey` change.
 * Keeps the previous `data` while a reload is in flight so filters don't flash.
 * On error, keeps `data` if it came from the same args (a failed reload), so
 * views can show the error above the last good result; drops it if the args
 * changed, since data for a different filter would be wrong.
 */
export function useBackendTool<T>(toolName: string, args: Record<string, unknown>, reloadKey = 0) {
  const argsKey = JSON.stringify(args);
  const [state, setState] = useState<{ data: T | null; dataKey: string | null; error: string | null; loading: boolean }>({
    data: null,
    dataKey: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, error: null, loading: true }));
    callBackendTool<T>(toolName, JSON.parse(argsKey))
      .then((data) => { if (!cancelled) setState({ data, dataKey: argsKey, error: null, loading: false }); })
      .catch((err) => {
        if (cancelled) return;
        const error = err instanceof Error ? err.message : String(err);
        setState((prev) =>
          prev.dataKey === argsKey ? { ...prev, error, loading: false } : { data: null, dataKey: null, error, loading: false },
        );
      });
    return () => { cancelled = true; };
  }, [toolName, argsKey, reloadKey]);

  return { data: state.data, error: state.error, loading: state.loading };
}
