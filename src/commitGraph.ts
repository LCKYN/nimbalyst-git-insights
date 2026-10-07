const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';

/** `git log` format for the graph: hash, parents, ref names, subject, author, author date. */
export const GRAPH_LOG_FORMAT = `${RECORD_SEPARATOR}%H${FIELD_SEPARATOR}%P${FIELD_SEPARATOR}%D${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ai`;

export interface GraphCommit {
  hash: string;
  parents: string[];
  /** Branch/tag names pointing at this commit, e.g. ["HEAD -> main", "origin/main", "tag: v1"]. */
  refs: string[];
  subject: string;
  author: string;
  authorDate: string;
}

/** A line drawn from the previous row's center (at `fromLane`) down to this row's center (at `toLane`). */
export interface GraphSegment {
  fromLane: number;
  toLane: number;
  /** Lane slot the line belongs to — used to pick its color. */
  color: number;
}

export interface GraphRow {
  commit: GraphCommit;
  lane: number;
  segments: GraphSegment[];
}

export interface CommitGraph {
  rows: GraphRow[];
  laneCount: number;
}

export function parseGraphLogOutput(raw: string): GraphCommit[] {
  return raw
    .split(RECORD_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash = '', parents = '', refs = '', subject = '', author = '', authorDate = ''] = entry.split(FIELD_SEPARATOR);
      return {
        hash,
        parents: parents.split(' ').filter(Boolean),
        refs: refs.split(', ').filter(Boolean),
        subject,
        author,
        authorDate,
      };
    })
    .filter((commit) => commit.hash.length > 0);
}

/** `git show -s` format for the detail pane; the raw body comes last so it may contain anything but FIELD_SEPARATOR. */
export const DETAIL_LOG_FORMAT = ['%H', '%P', '%D', '%an', '%ae', '%ai', '%cn', '%ce', '%ci', '%B'].join(FIELD_SEPARATOR);

export interface CommitFileChange {
  path: string;
  /** null for binary files. */
  added: number | null;
  deleted: number | null;
}

export interface CommitDetail extends GraphCommit {
  authorEmail: string;
  committer: string;
  committerEmail: string;
  committerDate: string;
  body: string;
  files: CommitFileChange[];
}

export function parseCommitDetail(meta: string, numstat: string): CommitDetail {
  const [hash = '', parents = '', refs = '', author = '', authorEmail = '', authorDate = '', committer = '', committerEmail = '', committerDate = '', ...rest] =
    meta.split(FIELD_SEPARATOR);
  const message = rest.join(FIELD_SEPARATOR).trim();
  const newline = message.indexOf('\n');
  return {
    hash: hash.trim(),
    parents: parents.split(' ').filter(Boolean),
    refs: refs.split(', ').filter(Boolean),
    subject: newline === -1 ? message : message.slice(0, newline),
    body: newline === -1 ? '' : message.slice(newline + 1).trim(),
    author,
    authorEmail,
    authorDate,
    committer,
    committerEmail,
    committerDate,
    files: numstat
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [added, deleted, ...path] = line.split('\t');
        return {
          path: path.join('\t'),
          added: added === '-' ? null : Number(added),
          deleted: deleted === '-' ? null : Number(deleted),
        };
      }),
  };
}

type Lane = { hash: string; fromLane: number } | null;

function freeSlot(lanes: Lane[]): number {
  const free = lanes.indexOf(null);
  return free === -1 ? lanes.length : free;
}

/**
 * Assigns each commit (newest first, topo-ordered) a lane and the line
 * segments that lead into it. Each lane tracks the commit it expects next.
 * A branch keeps its lane down through its first parents. Sibling branches
 * that share a parent keep separate lanes and join at that parent's row, so
 * the fan-out shows at the fork point. Extra merge parents reuse a lane that
 * already expects them, or take a free one.
 */
export function layoutGraph(commits: GraphCommit[]): CommitGraph {
  let lanes: Lane[] = [];
  let merges: { fromLane: number; slot: number }[] = [];
  let laneCount = 0;

  const rows = commits.map((commit) => {
    let lane = lanes.findIndex((l) => l?.hash === commit.hash);
    if (lane === -1) lane = freeSlot(lanes);

    const target = (slot: number) => (lanes[slot]?.hash === commit.hash ? lane : slot);
    const segments: GraphSegment[] = [
      ...lanes.flatMap((l, slot) => (l ? [{ fromLane: l.fromLane, toLane: target(slot), color: slot }] : [])),
      ...merges.map((m) => ({ fromLane: m.fromLane, toLane: target(m.slot), color: m.slot })),
    ];

    const next: Lane[] = lanes.map((l, slot) => (l && l.hash !== commit.hash ? { hash: l.hash, fromLane: slot } : null));
    merges = [];
    commit.parents.forEach((parent, i) => {
      if (i === 0) {
        next[lane] = { hash: parent, fromLane: lane };
        return;
      }
      const existing = next.findIndex((l) => l?.hash === parent);
      if (existing !== -1) {
        merges.push({ fromLane: lane, slot: existing });
      } else {
        next[freeSlot(next)] = { hash: parent, fromLane: lane };
      }
    });
    while (next.length > 0 && next[next.length - 1] === null) next.pop();

    laneCount = Math.max(laneCount, lanes.length, lane + 1, next.length);
    lanes = next;
    return { commit, lane, segments };
  });

  return { rows, laneCount };
}
