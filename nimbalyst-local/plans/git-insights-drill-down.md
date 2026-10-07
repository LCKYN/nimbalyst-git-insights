---
planStatus:
  planId: plan-git-insights-drill-down
  title: Git Insights — drill-down from heatmap days and chart bars to commits
  status: draft
  planType: feature
  priority: medium
  owner: pawarit.t
  stakeholders: []
  tags: [git-insights, extension, ui, feature]
  created: "2026-10-07"
  updated: "2026-10-06T23:13:39.000Z"
  progress: 0
---

# Drill-down

## Goal

Every number leads to the commits behind it. Clicking a heatmap day or a distribution bar
lists those commits, and clicking a commit opens it in the Graph tab with the detail
pane already showing.

## UX

- **Heatmap day / bar click** → a commit list appears **inline below the chart**
  (not a popover, which keeps it simple, keyboard-friendly, and scrollable). The header reads
  "Mar 4, 2026 · 7 commits", with a × to close. Clicking the same cell again closes it.
- **List row**: subject, author, short hash, relative time (reuse `relativeDate` from
  GraphTab; move it to a small shared spot).
- **Row click** → `setActiveTab('graph')` + `selected = hash`. The Graph tab needs to accept
  an `initialSelected` prop. If the commit is outside the loaded window (>limit), the detail
  pane still loads via `get_commit_detail`; the row just won't be highlighted.
- Selected cell or bar gets an outline so it's clear what the list belongs to.

## Backend

- New tool `get_commits({ repoPath, ref, since, until, limit = 200 })` →
  `GraphCommit[]` (it reuses `GRAPH_LOG_FORMAT` / `parseGraphLogOutput`).
  Validate `since` and `until` with `^\d{4}-\d{2}-\d{2}$` (a new `assertDate` in `gitLog.ts`).
- Uses `--since="<d> 00:00" --until="<d> 23:59:59"`. Caveat: git compares in the
  local zone, while buckets use each commit's own offset. Filter the result again by
  `parseAuthorDateDay` so the list matches the cell count exactly.
- Week/month bars pass the bucket's first/last day. Add `bucketRange(bucket)` to
  `commitActivity.ts`.

## Files

- `src/gitLog.ts`: `assertDate`.
- `src/commitActivity.ts`: `bucketRange`.
- `src/backend.ts`: `get_commits`.
- `src/components/CommitList.tsx` (new, ~50 lines).
- `HeatmapCalendar.tsx`, `BarChart.tsx`: an `onSelect(key)` prop and a selected outline.
- `SummaryTab.tsx`, `DistributionTab.tsx`: hold `selected`, render `CommitList`.
- `GitInsightsPanel.tsx`, `GraphTab.tsx`: an "open commit in graph" handoff.

## Testing

- Unit: `bucketRange` for a day, an ISO week (including W01 across a year boundary), and a month;
  `assertDate` rejects `--since=x`.
- Manual: a commit made near midnight in another offset lands in the same cell as
  the tooltip says.
