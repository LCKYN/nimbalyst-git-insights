---
planStatus:
  planId: plan-git-insights-history-cache
  title: Git Insights — cache parsed history in the backend
  status: ready-for-development
  planType: improvement
  priority: high
  owner: pawarit.t
  stakeholders: []
  tags: [git-insights, extension, backend, performance]
  created: "2026-10-07"
  updated: "2026-10-06T23:13:39.000Z"
  progress: 0
---

# History cache

## Why

Every tab now reloads on `git:status-changed` (debounced to 500 ms). File saves fire
that event, so `get_summary` / `get_distribution` re-run a full `git log --all` and
re-parse it on each save. That's fine on a small repo but not on a 20k+ commit one.
It's also a prerequisite for the Overview and drill-down plans, which add more
callers of the same history.

## Design

- **Key:** `git for-each-ref --format=%(objectname)` output plus `git rev-parse HEAD`,
  hashed. Listing refs is cheap (ms) and changes whenever a commit, fetch, checkout,
  reset, or tag happens. Working-tree edits don't change it, which is exactly when we
  want cache hits.
- **Value:** the parsed `RawCommit[]` for a given `(cwd, ref)` pair.
- **Where:** `backend.ts` `loadCommits()`, which is the single point `get_summary` and
  `get_distribution` (and later `get_overview` / `get_commits`) already go through.
- **Size:** one entry per `(cwd, ref)`, overwritten when the key changes. No LRU.
  `// ponytail:` note: unbounded across refs. Add a cap if people flip through
  many branches.
- `get_graph` stays uncached. It's capped at ≤2000 rows and needs `--topo-order`
  output, not `RawCommit[]`.

## Files

- `src/backend.ts`: wrap `loadCommits` in the cache (~20 lines).
- `src/gitLog.ts`: `refsFingerprint(cwd)` helper.

## Testing

- Unit: cache returns the same array when the fingerprint is unchanged, and re-reads when it changes
  (inject a fake `runGit`).
- Manual: a large repo (for example the Nimbalyst repo itself). Save a file with Summary open
  and confirm there's no `git log` spawn in the backend logs. Commit, and confirm it reloads.

## Out of scope

- Caching per-file numstat (only needed by Overview's hot files; that plan
  caches its own pass with the same key).
