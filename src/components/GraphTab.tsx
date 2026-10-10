import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { copyToClipboard, MaterialSymbol, type PanelHost } from '@nimbalyst/extension-sdk';
import { callBackendTool, useBackendTool } from '../backendClient';
import { commitMatches, type CommitGraph, type GraphCommit } from '../commitGraph';
import type { CommitAction } from '../gitLog';
import { CommitDetail } from './CommitDetail';
import type { Branches, InsightsFilter } from './GitInsightsPanel';

const ROW_HEIGHT = 26;
const LANE_WIDTH = 14;
const DOT_RADIUS = 4;

/**
 * Categorical lane colors, cycled by lane slot. No red (reads as "deleted") or
 * yellow (unreadable on light themes); lane colors only ever draw lines and borders.
 */
const LANE_COLORS = ['#3b82f6', '#ec4899', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4'];

const PAGE = 300;
const MAX_COMMITS = 2000; // backend cap

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60]];

/** "3 days ago" for a `%ai` date ("2024-01-15 14:23:01 +0700"). */
function relativeDate(authorDate: string): string {
  const iso = authorDate.replace(/^(\S+) (\S+) ([+-]\d\d)(\d\d)$/, '$1T$2$3:$4');
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  if (Number.isNaN(seconds)) return authorDate.slice(0, 10);
  const [unit, size] = UNITS.find(([, size]) => Math.abs(seconds) >= size) ?? ['second', 1];
  return RELATIVE.format(Math.round(seconds / size), unit);
}

const laneColor = (slot: number) => LANE_COLORS[slot % LANE_COLORS.length];
const laneX = (lane: number) => LANE_WIDTH / 2 + lane * LANE_WIDTH;
const rowY = (row: number) => ROW_HEIGHT / 2 + row * ROW_HEIGHT;

interface Props {
  host: PanelHost;
  workspacePath: string;
  filter: InsightsFilter;
  branches: Branches | null;
  reloadKey: number;
  onRepoChanged: () => void;
}

export function GraphTab({ host, workspacePath, filter, branches, reloadKey, onRepoChanged }: Props) {
  const [limit, setLimit] = useState(PAGE);
  const { data: graph, error, loading } = useBackendTool<CommitGraph>('get_graph', { repoPath: workspacePath, ...filter, limit }, reloadKey);
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; commit: GraphCommit } | null>(null);
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const optionIdBase = useId();
  const optionId = (hash: string) => `${optionIdBase}-${hash}`;

  useEffect(() => {
    if (selected) listRef.current?.querySelector(`[data-hash="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  /** Closes the commit menu; Escape and actions hand focus back to the list, outside clicks don't. */
  const closeMenu = (refocus: boolean) => {
    setMenu(null);
    if (refocus) listRef.current?.focus();
  };

  const runAction = async (commit: GraphCommit, action: CommitAction, name?: string) => {
    closeMenu(true);
    if (CONFIRM[action] && !window.confirm(`${CONFIRM[action]} ${commit.hash.slice(0, 7)} "${commit.subject}"?`)) return;
    setStatus(null);
    try {
      await callBackendTool('commit_action', { repoPath: workspacePath, hash: commit.hash, action, name });
      setStatus({ error: false, text: `${ACTION_DONE[action]} ${name ?? commit.hash.slice(0, 7)}` });
      onRepoChanged();
    } catch (err) {
      setStatus({ error: true, text: err instanceof Error ? err.message : String(err) });
    }
  };

  if (error && !graph) {
    return <div className="git-insights-error select-text">{error}</div>;
  }
  if (!graph) {
    return <div className="git-insights-loading">Loading commit graph…</div>;
  }

  const graphWidth = Math.max(1, graph.laneCount) * LANE_WIDTH;
  // Searching shows matches as a flat list: lane lines between non-adjacent rows would be wrong.
  const searching = query.trim() !== '';
  const rows = searching ? graph.rows.filter((row) => commitMatches(row.commit, query)) : graph.rows;

  // The list is one tab stop; arrows move the selection (and the detail pane) instead of focus.
  const onListKeyDown = (e: KeyboardEvent<HTMLOListElement>) => {
    if (rows.length === 0) return;
    const current = rows.findIndex((r) => r.commit.hash === selected);
    if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
      e.preventDefault();
      const row = current >= 0 ? listRef.current?.querySelector(`[data-hash="${selected}"]`) : null;
      if (!row) return;
      const rect = row.getBoundingClientRect();
      setMenu({ x: rect.left + 16, y: rect.bottom, commit: rows[current].commit });
      return;
    }
    if (e.key === 'Escape') {
      if (selected) {
        e.preventDefault();
        setSelected(null);
      }
      return;
    }
    const target = ({
      ArrowDown: current < 0 ? 0 : current + 1,
      ArrowUp: current < 0 ? 0 : current - 1,
      Home: 0,
      End: rows.length - 1,
    } as Record<string, number>)[e.key];
    if (target === undefined) return;
    e.preventDefault();
    setSelected(rows[Math.max(0, Math.min(rows.length - 1, target))].commit.hash);
  };

  return (
    <div className="git-insights-graph-layout">
      <div className="git-insights-graph-scroll">
        <div className="git-insights-search">
          <MaterialSymbol icon="search" size={16} className="git-insights-search-icon" />
          <input
            className="git-insights-search-input"
            type="search"
            placeholder="Search commits by message, author, or hash"
            aria-label="Search commits"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
          {searching && (
            <>
              <span className="git-insights-muted">{rows.length} of {graph.rows.length} loaded</span>
              <button type="button" className="git-insights-icon-button" aria-label="Clear search" onClick={() => setQuery('')}>
                <MaterialSymbol icon="close" size={16} />
              </button>
            </>
          )}
        </div>
        {error && <div className="git-insights-error git-insights-error--stale select-text" title={error}>Couldn't refresh: {error}</div>}
        {status && (
          <div className={status.error ? 'git-insights-error git-insights-status select-text' : 'git-insights-muted git-insights-status select-text'}>
            {status.text}
            <button type="button" className="git-insights-icon-button" aria-label="Dismiss" onClick={() => setStatus(null)}>
              <MaterialSymbol icon="close" size={16} />
            </button>
          </div>
        )}
        {graph.rows.length === 0 && <div className="git-insights-muted">No commits match this filter.</div>}
        {searching && graph.rows.length > 0 && rows.length === 0 && (
          <div className="git-insights-muted">No loaded commits match “{query.trim()}”.</div>
        )}
        <div className="git-insights-graph">
          {!searching && <svg
            className="git-insights-graph-svg"
            width={graphWidth}
            height={graph.rows.length * ROW_HEIGHT}
            role="img"
            aria-label="Commit graph"
          >
            {graph.rows.flatMap((row, i) =>
              row.segments.map((seg, j) => {
                const x1 = laneX(seg.fromLane);
                const x2 = laneX(seg.toLane);
                const y1 = rowY(i - 1);
                const y2 = rowY(i);
                const yMid = (y1 + y2) / 2;
                return (
                  <path
                    key={`${i}-${j}`}
                    d={x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${yMid} ${x2} ${yMid} ${x2} ${y2}`}
                    stroke={laneColor(seg.color)}
                    strokeWidth={2}
                    fill="none"
                  />
                );
              })
            )}
            {graph.rows.map((row, i) => (
              <circle
                key={row.commit.hash}
                cx={laneX(row.lane)}
                cy={rowY(i)}
                r={DOT_RADIUS}
                fill={row.commit.refs.some((ref) => ref.startsWith('HEAD')) ? 'var(--nim-bg)' : laneColor(row.lane)}
                stroke={laneColor(row.lane)}
                strokeWidth={2}
              />
            ))}
          </svg>}

          <ol
            ref={listRef}
            className="git-insights-graph-rows"
            style={{ marginLeft: searching ? 0 : graphWidth + 8 }}
            tabIndex={0}
            role="listbox"
            aria-label="Commits"
            aria-activedescendant={selected ? optionId(selected) : undefined}
            onKeyDown={onListKeyDown}
          >
            {rows.map((row) => (
              <li
                key={row.commit.hash}
                id={optionId(row.commit.hash)}
                role="option"
                aria-selected={row.commit.hash === selected}
                data-hash={row.commit.hash}
                className={row.commit.hash === selected ? 'git-insights-graph-row git-insights-graph-row--selected' : 'git-insights-graph-row'}
                style={{ height: ROW_HEIGHT }}
                onClick={() => setSelected(row.commit.hash === selected ? null : row.commit.hash)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSelected(row.commit.hash);
                  setMenu({ x: e.clientX, y: e.clientY, commit: row.commit });
                }}
              >
                {row.commit.refs.map((ref) => (
                  <span
                    key={ref}
                    className="git-insights-graph-ref"
                    style={{ borderColor: laneColor(row.lane) }}
                  >
                    {ref.replace(/^HEAD -> /, '')}
                  </span>
                ))}
                <span className="git-insights-graph-subject" title={row.commit.subject}>{row.commit.subject}</span>
                <span className="git-insights-graph-meta">{row.commit.author}</span>
                <span className="git-insights-graph-meta">{row.commit.hash.slice(0, 7)}</span>
                <span className="git-insights-graph-meta" title={row.commit.authorDate}>{relativeDate(row.commit.authorDate)}</span>
              </li>
            ))}
          </ol>
        </div>
        {graph.rows.length >= limit && limit < MAX_COMMITS && (
          <button type="button" className="git-insights-button git-insights-load-more" disabled={loading} onClick={() => setLimit((l) => l + PAGE)}>
            {loading ? 'Loading…' : `Load ${PAGE} more`}
          </button>
        )}
      </div>

      {selected && (
        <CommitDetail
          host={host}
          workspacePath={workspacePath}
          hash={selected}
          onSelect={setSelected}
          onClose={() => setSelected(null)}
        />
      )}

      {menu && (
        <CommitMenu
          x={menu.x}
          y={menu.y}
          commit={menu.commit}
          localBranches={branches?.local ?? []}
          onAction={(action, name) => runAction(menu.commit, action, name)}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

/** Actions that write a new commit onto the current branch get a confirm first. */
const CONFIRM: Partial<Record<CommitAction, string>> = {
  cherry_pick: 'Cherry-pick',
  revert: 'Revert',
};

const ACTION_DONE: Record<CommitAction, string> = {
  checkout: 'Checked out',
  create_branch: 'Created branch',
  create_tag: 'Created tag',
  cherry_pick: 'Cherry-picked',
  revert: 'Reverted',
};

interface MenuProps {
  x: number;
  y: number;
  commit: GraphCommit;
  localBranches: string[];
  onAction: (action: CommitAction, name?: string) => void;
  onClose: (refocus: boolean) => void;
}

/** Right-click menu for a graph row. Portaled to <body> for the same reason as the tooltip. */
function CommitMenu({ x, y, commit, localBranches, onAction, onClose }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [naming, setNaming] = useState<'create_branch' | 'create_tag' | null>(null);
  const [name, setName] = useState('');

  // Flip back inside the window when opened near the right or bottom edge.
  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      x: Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)),
    });
  }, [x, y, naming]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(false); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(true); };
    const onBlur = () => onClose(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, [onClose]);

  // Keyboard users land on the first item; the naming form's input autofocuses itself.
  useEffect(() => {
    if (!naming) ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [naming]);

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (items.length === 0) return;
    e.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? current + 1 : current - 1;
    items[(next + items.length) % items.length].focus();
  };

  const branchesHere = commit.refs
    .map((r) => r.replace(/^HEAD -> /, ''))
    .filter((r) => localBranches.includes(r));
  const item = (label: string, onClick: () => void) => (
    <button key={label} type="button" role="menuitem" className="git-insights-menu-item" onClick={onClick}>{label}</button>
  );

  return createPortal(
    <div ref={ref} className="git-insights-menu" role="menu" style={{ left: pos.x, top: pos.y }} onKeyDown={onMenuKeyDown}>
      {naming ? (
        <form
          className="git-insights-menu-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onAction(naming, name.trim());
          }}
        >
          <label>
            {naming === 'create_branch' ? 'New branch at ' : 'New tag at '}
            {commit.hash.slice(0, 7)}
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="name" />
          </label>
          <button type="submit" className="git-insights-button git-insights-button--primary" disabled={!name.trim()}>Create</button>
        </form>
      ) : (
        <>
          {item('Copy commit hash', () => { copyToClipboard(commit.hash); onClose(true); })}
          {item('Copy commit message', () => { copyToClipboard(commit.subject); onClose(true); })}
          <hr />
          {branchesHere.map((b) => item(`Checkout ${b}`, () => onAction('checkout', b)))}
          {item('Checkout commit (detached)', () => onAction('checkout'))}
          {item('Create branch here…', () => setNaming('create_branch'))}
          {item('Create tag here…', () => setNaming('create_tag'))}
          <hr />
          {item('Cherry-pick onto current branch', () => onAction('cherry_pick'))}
          {item('Revert commit', () => onAction('revert'))}
        </>
      )}
    </div>,
    document.body,
  );
}
