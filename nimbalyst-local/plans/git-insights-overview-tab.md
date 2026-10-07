---
planStatus:
  planId: plan-git-insights-overview-tab
  title: Git Insights — Overview tab (KPIs, streaks, contributors, hot files)
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

# Overview tab

## Goal

One glance at repo health, without picking a tab. This plan reuses the v2 mockup:

[Git Insights v2 mockup](../mockups/git-insights-v2.mockup.html "width=1100 height=760")

## Current state

The Summary tab already has the totals line, the heatmap (with month/weekday labels and
legend), and the weekday/hour bar charts. Overview should **evolve Summary rather than
add a fifth tab**. Rename it to Overview and add the pieces below.

## Additions

1. **KPI tiles** (one row, wraps under 640px):
   - Commits, with a Δ against the previous period of the same length (uses the range filter)
   - Active days
   - Current and longest streak (consecutive days with ≥1 commit)
   - Contributors (distinct authors)
2. **Top contributors**: top 5 with share bars. Reuse the `.git-insights-author-share`
   markup that DistributionTab already has.
3. **Hot files**: the 8 most-changed paths in the range, with change count and +/−.
   Clicking one calls `host.openFile`. Deleted paths are shown but not clickable.

## Backend

- Extend `get_summary`. Don't add a new tool:
  - `streaks: { current, longest }`, computed in `commitActivity.ts` from the
    sorted `days`. Pure, so it's unit-testable.
  - `previousTotal`: the count in `[since - span, since)`. This needs the commits before
    `since`, which `loadCommits` already returns unfiltered.
  - `contributors`: the length of the all-authors set.
- `hotFiles`: a second pass, `git log <revs> --since=<since> --numstat --format=%x1e`.
  Parse it into path → `{ commits, added, deleted }` and keep the top 8. Default to 90 days
  when the range is "All", so it stays bounded. Cache it with the history-cache key once
  that plan lands.

## Files

- `src/commitActivity.ts`: `computeStreaks(days, today)` and `parseLogNumstat(raw)`.
- `src/backend.ts`: the extra fields on `get_summary`.
- `src/components/SummaryTab.tsx`: rename it to `OverviewTab.tsx` and add tiles and the two lists.
- `src/components/GitInsightsPanel.tsx`: the tab label and id. Migrate a stored
  `activeTab: 'summary'` to `'overview'`.
- `src/styles.css`: `.git-insights-tile` grid.

## Testing

- Unit: streaks (empty, today-only, a gap yesterday, a run ending yesterday that still
  counts as current), and numstat parsing (binary `-`, rename `=>`, tabs in paths).
- Manual: an empty repo, one commit, the "All" range on a large repo.

## Open questions

- Does the current streak count if today has no commits yet but yesterday does?
  GitHub says yes. Proposed: yes.
