---
planStatus:
  planId: plan-git-insights-pr-popover
  title: Git Insights — PR/MR popover with base, title, body, draft, and existing-PR link
  status: draft
  planType: improvement
  priority: medium
  owner: pawarit.t
  stakeholders: []
  tags: [git-insights, extension, ui, pr]
  created: "2026-10-07"
  updated: "2026-10-06T23:13:39.000Z"
  progress: 0
---

# PR / MR popover

## Current state (after the polish pass)

`create_pr` refuses detached HEAD and the default branch. It pushes (`-u origin HEAD`
when there's no upstream), runs `gh pr create --fill` / `glab mr create --fill --yes`, and if a
PR already exists it opens that PR's URL. That works, but it's still a blind one-click.
You can't pick a base, edit the title, or make a draft, and the button doesn't
say a PR already exists until you click it.

## Design

```
Create pull request
  base  [main ▾]      feature/login → main · 3 commits
  title [Add login form validation          ]
  body  [• commit subject 1                 ]
        [• commit subject 2                 ]
  [ ] Draft
                                  [Cancel] [Create PR]
```

- **Button state**, from the new `get_pr_status`:
  - PR exists → `View PR #123` (opens its URL; no popover)
  - Default branch / detached / 0 commits ahead → disabled, with the reason as a tooltip
  - Otherwise → `Create PR` opens the popover
- **Prefill**: one commit → its subject and body. Several → the branch name humanized
  as the title, plus a bullet list of subjects as the body.
- **Base picker**: the remote branches from `get_branches`, defaulting to `origin/HEAD`.
- Popover portaled to `<body>`, like `CommitMenu`. Esc and outside-click close it.

## Backend

- `get_pr_status` (new): `{ branch, base, ahead, commits: subject[], existing?: { number, url } }`.
  - `ahead`/`commits`: `git log --format=%s origin/<base>..HEAD`.
  - existing: `gh pr view --json number,url,state` (open only) or
    `glab mr view --output json`. **Verify the glab flag** against the installed version.
- `create_pr({ base, title, body, draft })`:
  - gh: `--base --title --body [--draft]`
  - glab: `--target-branch --title --description [--draft] --yes`
  - Validate `base` with `assertRef`. Title and body go through argv (`shell: false`), so
    there's no escaping concern.
- Keep the push and default-branch guards that are already in `prHost.ts`.

## Files

- `src/prHost.ts`: `getPrStatus` and args on `createPullRequest`.
- `src/backend.ts`: the `get_pr_status` descriptor and the new `create_pr` params.
- `src/components/PrCreateButton.tsx`: becomes the button plus `PrPopover` (one file).

## Testing

- Unit: the prefill function (one vs. several commits) and argv building for gh/glab.
- Manual: no upstream, an existing PR, gh not installed, gh unauthed, a GitLab remote.
