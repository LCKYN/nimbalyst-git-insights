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
  try {
    return (await aiService.callBackendTool(`git-insights.${toolName}`, args)) as T;
  } catch (err) {
    // The host only registers our tools once the backend module is running for
    // this workspace. It stays parked if the workspace was untrusted when it
    // opened (trusting it later doesn't restart the module) or consent was declined.
    if (err instanceof Error && err.message.includes('Backend tool not available')) {
      throw new Error(
        'Git Insights backend is not running in this workspace. Make sure the workspace is trusted and the ' +
          'Git Insights backend is enabled in Settings → Extensions, then reopen the project window.',
      );
    }
    throw err;
  }
}

const inFlight = new Map<string, { running: Promise<unknown>; next?: Promise<unknown> }>();

/**
 * Like `callBackendTool`, but at most one identical call (tool + args) runs at a time.
 * Calls made while one is running share a single rerun that starts when it settles,
 * so a burst of reloads during a slow `git log` costs two runs, not one per reload.
 */
export function callBackendToolCoalesced<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
  const key = `${toolName} ${JSON.stringify(args)}`;
  const entry = inFlight.get(key);
  if (entry) {
    entry.next ??= entry.running.catch(() => {}).then(() => callBackendToolCoalesced(toolName, args));
    return entry.next as Promise<T>;
  }
  const running = callBackendTool<T>(toolName, args).finally(() => {
    if (inFlight.get(key)?.running === running) inFlight.delete(key);
  });
  inFlight.set(key, { running });
  return running;
}

/**
 * Calls a backend tool whenever `args` (compared by value) or `reloadKey` (any value) change.
 * Keeps the previous `data` while a reload is in flight so filters don't flash.
 * On error, keeps `data` if it came from the same args (a failed reload), so
 * views can show the error above the last good result; drops it if the args
 * changed, since data for a different filter would be wrong.
 */
export function useBackendTool<T>(toolName: string, args: Record<string, unknown>, reloadKey: unknown = 0) {
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
    callBackendToolCoalesced<T>(toolName, JSON.parse(argsKey))
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
