---
planStatus:
  planId: plan-git-insights-v2
  title: Git Insights v2 — fixes, new insights, and a redesigned panel
  status: draft
  planType: improvement
  priority: high
  owner: pawarit.t
  stakeholders: []
  tags: [git-insights, extension, ui, feature]
  created: "2026-10-07"
  updated: "2026-10-07T00:00:00.000Z"
  progress: 0
---

# Git Insights v2

## Goal

Make the bottom panel something you'd leave open: a single glance that shows
what's happening in the repo, with drill-down from every number. Fix the
correctness bugs first, then add an Overview, richer Activity, an interactive
Graph, a session-aware Changes view, and a safer PR flow.

[Git Insights v2 mockup](../mockups/git-insights-v2.mockup.html "width=1100 height=760")

> **Status (2026-10-07):** B1–B3, B5–B7 and most of B8 (push first, reuse an existing PR, guard
> the default branch) are fixed in the working tree. B4 is only partly fixed. The remaining work is split into
> one plan per topic:
> [history cache](git-insights-history-cache.md) ·
> [overview tab](git-insights-overview-tab.md) ·
> [drill-down](git-insights-drill-down.md) ·
> [changes by session](git-insights-changes-by-session.md) (finishes B4) ·
> [PR popover](git-insights-pr-popover.md) (finishes B8)
>
> **Order:** cache → PR popover → changes by session → overview → drill-down.
> Decided: Overview evolves the Summary tab (no 5th tab), and drill-down is an inline list.

## Review of v0.1 (current state)

### Bugs (fix before adding features)

| # | Where | Problem |
|---|-------|---------|
| B1 | `HeatmapCalendar.tsx:21` `toDateKey` | Builds the grid from **local** midnight, then keys it with `toISOString()` (**UTC**). In any UTC+ zone (e.g. Bangkok, UTC+7) every cell's key is the previous day, so the whole grid is shifted a day and today's commits never show. |
| B2 | `DistributionTab.tsx:6-14` `defaultSince` / `today` | Same UTC issue. Between 00:00 and 07:00 local, "today" is yesterday: the `max` on the date input won't let you pick today, so today's commits get dropped. |
| B3 | `commitActivity.ts:82` `aggregateDistribution` | Only returns buckets that have commits. Empty days/weeks get left out and the bars sit right next to each other, so a 3-week gap looks like no gap at all. |
| B4 | `useSessionsForFile.ts:97` | Every file row calls `sessions:list` (including archived) on its own. With 50 changed files that's 50 full session-list fetches, and all 50 run again on every `session-files:updated`. |
| B5 | `useWorkingChanges.ts:52` | Added, deleted, renamed and conflicted files all show as `M`. Conflicted files are dropped entirely, and so is the staged/unstaged distinction. |
| B6 | `CommitDistributionChart.tsx:27` | `preserveAspectRatio="none"` stretches the bars, so their rounded corners distort. There are no axes or labels, so you can't read values off the chart. |
| B7 | All tabs | Data only refreshes on mount (Uncommitted has a manual button). Nothing listens to `host.onWorkspaceEvent('git:status-changed')`. |
| B8 | `PrCreateButton` | Runs `--fill` immediately. It fails if the branch isn't pushed (gh can't prompt from a non-TTY), and stays enabled on the default branch or when there are 0 commits ahead. When a PR already exists for the branch, it errors instead of linking to it. |

### Gaps

- No context: the panel never tells you which branch you're on, ahead/behind, or when the last commit was.
- The heatmap has no month or weekday labels, no legend, no totals, no streaks, and you can't pick a year.
- No drill-down anywhere. You can't click a day, a bar, a commit, or a file.
- The commit graph (uncommitted WIP: `commitGraph.ts`, `GraphTab.tsx`) is capped at 300 commits, with no search and no detail view.
- No loading skeletons, no retry on errors, and the tab and range don't persist between opens.
- Unused host APIs that fix most of this cheaply: `host.openFile`, `host.onWorkspaceEvent`, `host.storage`.

## Design

### Panel shell

```
┌────────────────────────────────────────────────────────────────────────┐
│ ⎇ feature/login  ↑3 ↓0 · last commit 2h ago   [Overview|Activity|Graph|Changes]   ⟳  [Create PR ▾] │
├────────────────────────────────────────────────────────────────────────┤
│ tab content                                                            │
└────────────────────────────────────────────────────────────────────────┘
```

- **Context strip** (left): current branch, ahead/behind upstream, time since the last commit.
- **Tabs**: Overview (default) · Activity · Graph · Changes (the Changes tab shows a count badge).
- **Refresh**: one button for all tabs, plus an automatic refresh on `git:status-changed`, debounced to 1s.
- **PR button**: a split button. The main action opens the PR popover; when a PR already exists, the button becomes `View PR #123`.
- The active tab and the selected range are saved in `host.storage`.
- **Shared states**: a skeleton shaped like the content it replaces, an empty state that suggests a next step, and an error with a Retry button.
- **Styling**: `--nim-*` tokens only, a 4/8px spacing grid, 12px base text, and tabular numbers for counts. Container queries collapse the layout to one column under 640px.

### 1. Overview (new, default tab)

- **KPI tiles** (row of 5): commits in the last 30 days (with Δ against the previous 30), active days, current and longest streak, contributors, and uncommitted files (split into AI vs manual).
- **Heatmap**, rebuilt:
  - month labels across the top, Mon/Wed/Fri labels down the side
  - a Less→More legend and a total like "1,284 commits in the last year"
  - a year selector: Last 12 months, then one entry per year in the history
  - clicking a day opens a popover with that day's commits (subject, author, hash); clicking a commit opens it in the Graph tab
- **Top contributors**: the top 5, each with a share bar and a commit count.
- **Hot files**: the 8 most-changed files in the last 90 days, with change count and +/− lines. Clicking a file calls `host.openFile`.

### 2. Activity (replaces Distribution)

- **Range presets**: 7d · 30d · 90d · 12m · All, plus Custom (the existing date inputs). Granularity is picked automatically and can be overridden.
- **Author filter**: a dropdown, defaulting to everyone.
- **Bar chart**, rewritten:
  - the time axis is zero-filled (fixes B3)
  - 3 horizontal gridlines with y labels, and sparse x labels
  - a custom hover tooltip
  - clicking a bar lists that bucket's commits below the chart
- **Punch card**: a 7×24 grid of weekday by hour, showing when the team commits.
- **Contributors table**: author, commits, +lines, −lines, first commit, last commit, and a share bar. Sortable.

### 3. Graph

- A search box that filters by subject, author or hash, with matches highlighted and the rest dimmed.
- A toggle between All branches and Current branch.
- A "Load 300 more" button at the bottom (`skip` param).
- Relative dates, with the absolute date in the tooltip.
- **Commit detail drawer**: clicking a row opens it on the right. It shows the full message, author and date, parents (clickable), refs, a copy-hash button, and the changed files with +/−. Clicking a file calls `host.openFile`.

### 4. Changes (renamed from Uncommitted)

- **Summary bar**: "12 files · 8 from 3 AI sessions · 4 manual".
- **Group toggle**: By file, or By session.
  - By session: one card per session showing title, provider, last edit time, total +/−, and its files. Edits made outside any session go in a "Manual edits" card.
  - By file: the current view, with correct status badges (A/M/D/R/U/C) and a staged dot (fixes B5).
- Clicking a file calls `host.openFile`.
- Fix B4: fetch `sessions:list` once per tab load and share it across every row.

### 5. PR / MR popover

```
Create pull request
  base  [main ▾]      feature/login → main · 3 commits
  title [Add login form validation          ]
  body  [• commit subject 1                 ]
        [• commit subject 2                 ]
  [ ] Draft
                                  [Cancel] [Create PR]
```

- Title and body are prefilled from the commits on top of base: the subject for a single commit, the branch name plus a bullet list for several.
- If the branch has no upstream, `create_pr` runs `git push -u origin HEAD` first (fixes B8).
- The button is disabled with a tooltip on the default branch or when there are 0 commits ahead. If a PR already exists, the popover is replaced by `View PR #N`.

## Backend changes (`backend.ts`)

| Tool | Change |
|------|--------|
| `get_repo_status` | **new**: branch, upstream, ahead/behind, default branch (`origin/HEAD`), last commit time, existing PR (`gh pr view --json number,url,state` / `glab mr view`) |
| `get_overview` | **new**: KPIs, streaks, top authors, hot files. Built from one `git log` pass plus one `--numstat` pass limited to 90 days |
| `get_heatmap` | add `year` param and `total` / `streaks` in the result |
| `get_activity` | replaces `get_distribution`: zero-filled buckets, `author` filter, punch card, and per-author +/− (`--numstat`, limited to the range) |
| `get_commits` | **new**: commits for a day or bucket range (used for drill-down) |
| `get_commit` | **new**: full message, parents, refs, and file numstat for one hash |
| `get_graph` | add `skip`, `query`, `scope: 'all' \| 'current'` |
| `create_pr` | accept `{ base, title, body, draft }`, and push first when there's no upstream |

**Cache:** use the output of `git for-each-ref --format=%(objectname)` plus `HEAD` as the key, and memoize parsed logs on it. A single ref-listing is a cheap check, so the 5 tools stop re-reading the whole history every time a tab opens.

**Trust boundary:** these args come from the panel and are passed to git, so validate them before spawning:
- hashes: `^[0-9a-f]{4,40}$`
- dates: `^\d{4}-\d{2}-\d{2}$`
- branch names: reject a leading `-`, and use `--end-of-options` where git supports it

Keep `spawn` with `shell: false`.

## File plan

Stay lean: one new pure-logic module, plus one component per tab or feature.

- `src/repoStats.ts` (new): streaks, zero-fill, punch card, numstat parsing, and a local-date key helper (fixes B1/B2 in one place).
- `src/components/ui.tsx` (new): `Tile`, `Segmented`, `Skeleton`, `EmptyState`, `ErrorState`, `useBackend(tool, args, deps)`. The last one replaces the 4 copy-pasted fetch effects.
- `OverviewTab.tsx`, `ActivityTab.tsx` (replaces `DistributionTab`), `PunchCard.tsx`, `CommitDetail.tsx`, `PrPopover.tsx` (replaces `PrCreateButton`), `ChangesTab.tsx` (replaces `UncommittedFilesTab`).
- `HeatmapCalendar.tsx`, `CommitDistributionChart.tsx`, `GraphTab.tsx`: update in place.

## Phases

1. **Fixes**: commit the graph WIP, then B1–B7. Shell: context strip, refresh, `useBackend`, shared states, storage.
2. **Overview**: tiles, the rebuilt heatmap with day drill-down, contributors, hot files.
3. **Activity**: presets, zero-filled chart with axes, punch card, contributors table.
4. **Graph and Changes**: search, load more, detail drawer, session grouping, `openFile` everywhere.
5. **PR popover** (B8).

Each phase ships on its own.

## Testing

- **Unit (vitest)**:
  - streaks, zero-fill across a month and a year boundary, punch card bucketing, numstat parsing, arg validators
  - heatmap date keys under `TZ=Asia/Bangkok` and `TZ=America/Los_Angeles`, as a regression test for B1
- **Manual in Nimbalyst**: an empty repo, a repo with one commit, a large repo (e.g. 20k+ commits, check the cache), a detached HEAD, no remote, gh not installed.

## Deliberately out of scope (add when asked)

- A repo picker for multi-root workspaces (`host.getWorkspaceFolders()`). Add it when someone opens a multi-root workspace.
- An AI-written weekly digest of commits. Nice, but it needs a prompt-design pass of its own.
- CSV/PNG export.
- Opening an AI session from a chip. `PanelHost` has no API for it, so this waits until the SDK adds one.
