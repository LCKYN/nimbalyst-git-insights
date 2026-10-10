---
planStatus:
  planId: plan-git-insights-design-review-fixes
  title: Git Insights — design review fixes
  status: draft
  planType: improvement
  priority: medium
  owner: pawarit.t
  stakeholders: []
  tags: [git-insights, extension, ui, accessibility]
  created: "2026-10-10"
  startDate: "2026-10-10"
  updated: "2026-10-10T17:20:00.000Z"
  progress: 96
---

# Design review fixes

This plan implements every finding from the 2026-10-10 design review of the panel. None of
it changes features. It covers hierarchy, theme correctness, keyboard access and copy. The
panel should keep looking native to Nimbalyst: no new colors, typefaces or decoration.

## Implementation checklist

- [x] Phase 1: theme tokens and colors
  - [x] `--nim-danger` → `--nim-error` everywhere; drop hex fallbacks for tokens the host defines
  - [x] Lane palette without red or yellow
  - [x] Ref badges use neutral text with a lane-colored border
- [x] Phase 2: copy and deletions
  - [x] Delete the commits-per-day histogram, `dailyCountHistogram`, `DailyCountBin`, its tests, `BarChart`'s `unit` prop and `.git-insights-summary-wide`
  - [x] "manual" → "No AI session"
  - [x] Summary stats put the value first every time
  - [x] PR button labels in sentence case
- [x] Phase 3: icons
  - [x] Swap the Unicode glyphs for `MaterialSymbol` from `@nimbalyst/extension-sdk`
- [x] Phase 4: toolbar hierarchy and PR button states
  - [x] Range toggle and granularity toggle restyled as quiet segmented controls
  - [x] PR button: hidden for unknown hosts, disabled with a reason when the CLI is missing or unauthenticated
  - [x] Class renames: `segmented-button`, `button`, `button--primary`
- [x] Phase 5: heatmap respects the date range
- [x] Phase 6: keyboard and focus
  - [x] `:focus-visible` ring on the panel and the portaled menu
  - [x] Tabs: roving tabindex, arrow keys, `tabpanel`
  - [x] Graph list: one tab stop, arrow keys move the selection, a key opens the context menu
  - [x] Commit menu: focus moves into it, arrow keys between items, Escape returns focus
- [x] Phase 7: keep the last good data when a reload fails
- [ ] Phase 8: verify (tests, build, reload, manual pass in both themes)
  — tests, typecheck, build and install/reload done; manual pass in both themes still open

## Phase 1: theme tokens and colors

**Finding:** the host defines `--nim-error`, not `--nim-danger`, so every red in
[styles.css](../../src/styles.css) currently renders the hardcoded `#f87171`. Lane colors are
Tailwind hex values that ignore the theme. `#eab308` used as text on a light background fails
contrast, and the `#ef4444` lane reads as "deleted" next to the red deletion counts.

- Replace `var(--nim-danger, #f87171)` with `var(--nim-error)` (7 places).
- Drop the hex fallbacks on `--nim-success` and `--nim-warning`; the SDK defines both.
- `LANE_COLORS` in [GraphTab.tsx](../../src/components/GraphTab.tsx): remove red and yellow,
  leaving 6 hues (blue, pink, green, amber, purple, cyan). Lanes repeat after 6, which is
  fine because adjacent lanes still differ.
- `.git-insights-graph-ref`: text `var(--nim-text)`, border keeps the lane color. The lane
  color then only has to be visible as a line, never readable as text, so contrast stops
  depending on the theme.

## Phase 2: copy and deletions

- **Histogram:** delete the "Commits per day distribution" section in
  [SummaryTab.tsx](../../src/components/SummaryTab.tsx), `dailyCountHistogram` and
  `DailyCountBin` in [commitActivity.ts](../../src/commitActivity.ts), the
  `describe('dailyCountHistogram')` block, the `unit` prop on
  [BarChart.tsx](../../src/components/BarChart.tsx) (the histogram was its only user), and
  `.git-insights-summary-wide`.
- **Attribution:** files with no matching session show "No AI session" instead of "manual"
  ([UncommittedFilesTab.tsx:111](../../src/components/UncommittedFilesTab.tsx)). "Manual" claims
  something the data can't prove.
- **Summary stats:** value first every time: **1,204** commits · **87** active days ·
  **Mon** busiest day · **14:00** busiest hour.
- **PR button:** "Create pull request" / "Create merge request", and "Creating pull request…".

## Phase 3: icons

`MaterialSymbol` is re-exported from `@nimbalyst/extension-sdk` and externalized by the
SDK's Vite plugin, so it costs no bundle size. Props: `icon`, `size`, `title`, `className`.

| Where | Now | Icon |
|---|---|---|
| Toolbar branch label | ⎇ | `call_split` |
| Refresh | ⟳ | `refresh` |
| Dismiss status / close detail | × | `close` |
| Diff toggle | ▸ ▾ | `chevron_right` / `expand_more` |

All at 16px, with `.git-insights-icon-button` sized to match the 12px text baseline.
Verify the import resolves at runtime. If it doesn't, check the externals map's key for the
SDK re-export before working around it.

## Phase 4: toolbar hierarchy and PR button states

**Finding:** the toolbar wraps in a short panel, and two filled-primary controls compete
(the active range button and Create PR), plus a third on the Distribution tab.

- **Segmented controls:** the range toggle (toolbar) and granularity toggle (Distribution)
  use one quiet style: no border per button, `--nim-bg-hover` on the active one, the same
  as the tabs. The PR button is then the only filled-primary control in the panel.
  **Decision:** the range stays a 5-button segmented control (one click per switch,
  about 180px), not a dropdown.
- **PR button states** ([PrCreateButton.tsx](../../src/components/PrCreateButton.tsx)):
  - checking → render nothing (no "Checking gh/glab…" text that jumps the layout)
  - `host: 'unknown'` → render nothing
  - CLI not installed or not authenticated → disabled button; the tooltip gives the reason
    and the fix (`Run "gh auth login" to create pull requests.`)
  - status check throws → render nothing and log it; it's not the user's job
  - create fails → error stays inline under the button (unchanged)
- **Class names that lie:**
  - `git-insights-granularity-button` → `git-insights-segmented-button` (range, granularity)
  - "Load 300 more" and "Expand all" → new `git-insights-button` (quiet secondary)
  - Menu "Create" submit → `git-insights-button git-insights-button--primary`, which the
    PR button also uses
  - Merge the duplicate `.git-insights-pr-create--error` / `.git-insights-pr-create-error`

## Phase 5: heatmap respects the date range

**Finding:** `HeatmapCalendar` always draws 53 weeks while `get_summary` filters by `since`.
On "7d" it shows a year-wide grid with 7 lit cells.

**Decision: the grid shrinks to the range.**

- Add `heatmapWeeks(range)` next to `heatmapGrid`: 90d → 13 weeks, 1y and All → 53,
  7d and 30d → 0.
- Pass `weeks` into `HeatmapCalendar` instead of the `WEEKS` constant. `SummaryTab`
  doesn't render the heatmap when it's 0. At 7d/30d the day-of-week and hour charts say
  more than a sliver of cells would.
- The month-label collision filter already handles short grids. Check that 13 weeks still
  gets at least 2 labels.
- `SummaryTab` needs the range id, not just `since`, so pass the range down from the panel.

## Phase 6: keyboard and focus

- **Focus ring:** `.git-insights-panel :focus-visible, .git-insights-menu :focus-visible`
  → `outline: 2px solid var(--nim-border-focus); outline-offset: 1px`. The menu is portaled
  to `<body>`, so it needs its own selector.
- **Tabs** ([GitInsightsPanel.tsx](../../src/components/GitInsightsPanel.tsx)): only the active
  tab is in the tab order. Left/Right/Home/End move between tabs and activate them. Each tab
  gets an `id` and `aria-controls`; `.git-insights-content` gets `role="tabpanel"` and
  `aria-labelledby`.
- **Graph list** ([GraphTab.tsx](../../src/components/GraphTab.tsx)): the `<ol>` is one tab stop
  (`tabIndex={0}`, `role="listbox"`, `aria-activedescendant`), not 2,000 focusable rows.
  - Up/Down move the selection, which also updates the detail pane, and scroll the row into
    view (the existing `scrollIntoView` effect already does this)
  - Home/End go to the first/last loaded commit
  - Escape clears the selection
  - Shift+F10 or the ContextMenu key opens the commit menu at the selected row's position
- **Commit menu:** focus moves to the first item on open. Up/Down move between items. Escape
  and choosing an action return focus to the graph list.
- **Out of scope:** keyboard access to chart tooltips. The charts are `role="img"` with
  labels, and the stat line above them carries the same numbers.

## Phase 7: keep the last good data when a reload fails

`useBackendTool` ([backendClient.ts](../../src/backendClient.ts)) sets `data: null` on
error, so one failed reload wipes the tab.

- Remember which `argsKey` the current `data` belongs to. On error, keep `data` if it's for
  the same args (a reload or auto-refresh). Drop it if the args changed (a new filter),
  because stale data from a different filter would be wrong.
- Views render the error alone only when there's no data. When both exist, a one-line
  error sits above the stale content. That applies to Graph, Summary, Distribution,
  Uncommitted, `CommitDetail` and `DiffView`.

## Phase 8: verify

- `npm test`. Update tests for the deleted histogram. Add one test for the new heatmap
  range logic as a pure helper next to `heatmapGrid`.
- Build and reload the extension through the extension-dev MCP tools.
- Manual pass in light **and** dark themes:
  - Every range: the heatmap matches the selected range
  - Narrow panel: the toolbar fits on one row at a typical bottom-panel width, or wraps
    cleanly
  - Keyboard only: switch tabs, walk the graph, open the menu, create a branch, close it
  - Non-GitHub repo: no red text in the toolbar
  - Kill the backend mid-session: the last data stays with an error line above it

## Decisions

1. The heatmap shrinks to the range and is hidden at 7d/30d (Phase 5).
2. The range control stays a quiet segmented control (Phase 4).
