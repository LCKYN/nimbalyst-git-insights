import { useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Cursor-following hover tooltip. Portaled to <body> because the panel's
 * `container-type` makes it the containing block for `position: fixed`, and
 * the content area's `overflow: auto` would clip anything positioned inside it.
 */
export function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null);

  const show = (event: MouseEvent, content: ReactNode) => setTip({ x: event.clientX, y: event.clientY, content });
  const hide = () => setTip(null);
  const node = tip
    ? createPortal(
        <div className="git-insights-tooltip" style={{ left: tip.x, top: tip.y }}>
          {tip.content}
        </div>,
        document.body,
      )
    : null;

  return { show, hide, node };
}
