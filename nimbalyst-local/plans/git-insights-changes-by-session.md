---
planStatus:
  planId: plan-git-insights-changes-by-session
  title: Git Insights — group uncommitted changes by AI session
  status: draft
  planType: feature
  priority: medium
  owner: pawarit.t
  stakeholders: []
  tags: [git-insights, extension, ui, ai-attribution]
  created: "2026-10-07"
  updated: "2026-10-06T23:13:39.000Z"
  progress: 0
---

# Changes by session

## Goal

Answer "which AI session made these edits?" before committing. Then a commit
can be scoped to one session's work.

## Current state

- `UncommittedFilesTab` lists files grouped into Conflicts / Changes / Untracked, with
  status badges, a staged dot, inline diffs, and session chips per row.
- `useSessionsForFile` runs **per row**: one `session-files:get-sessions-by-file` call plus
  one `session-files:get-by-sessions` call for each file, and each row subscribes to
  `session-files:updated` on its own. With 50 files that's 100 IPC calls and 50 listeners,
  and all of it runs again on every update. The `sessions:list` part is already shared through a 5 s cache.

## Design

### 1. One attribution fetch per tab (fixes the N× IPC)

Replace the per-row hook with `useSessionAttribution(workspacePath, absolutePaths[])`.
It returns `Map<absPath, SessionEditEntry[]>`, with one subscription to `session-files:updated`.

**Decided (2026-10-07): option A.** B stays here as the fallback if the payload gets too big.

- **A. IPC, batched.** One `sessions:list` call, then one `session-files:get-by-sessions(allIds, 'edited')`
  call, filtered to the changed paths client-side. It uses the same channels as today, so no new permission.
  The payload grows with total session history.
- **B. SQL via `host.data.query`.** A single `SELECT … FROM session_files JOIN ai_sessions
  WHERE file_path = ANY($1)`. Smallest payload, but it needs the `nimbalyst-database-read`
  catalog permission, and the SDK says the schema isn't a stable contract.

### 2. Group toggle: By file | By session

- **By file**: today's view.
- **By session**: one card per session with title, provider, last edit (relative), total
  +/− and its files, newest session first. Files touched by more than one session appear
  under each. Files with no session go in a **Manual edits** card at the bottom.
- Store the toggle in `host.storage` (same `useStored` helper as the panel).
- **Summary bar**: "12 files · 8 from 3 AI sessions · 4 manual".

## Files

- `src/hooks/useSessionsForFile.ts`: becomes `useSessionAttribution` (smaller than
  today: one fetch, one map).
- `src/components/UncommittedFilesTab.tsx`: toggle, `SessionCard`, summary bar. `FileRow`
  takes `sessions` as a prop instead of fetching.

## Testing

- Unit: the pure grouping function `groupBySession(files, attribution)`, covering a file
  shared by two sessions and the manual bucket.
- Manual: 50+ changed files. Watch that one IPC burst happens per update, not 50.

## Out of scope

- Opening a session from its chip. `PanelHost` has no API for it yet.
- "Commit this session's files". That needs a commit UI, which is a separate plan if wanted.
