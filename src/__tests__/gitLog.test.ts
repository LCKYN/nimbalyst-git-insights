import { describe, expect, it } from 'vitest';
import { commitActionArgs, parseGitLogOutput, remoteActionArgs } from '../gitLog';

const RS = '\x1e';
const US = '\x1f';

describe('parseGitLogOutput', () => {
  it('returns an empty array for an empty repo (no output)', () => {
    expect(parseGitLogOutput('')).toEqual([]);
  });

  it('parses author date and name out of record/field-separated entries', () => {
    const raw = [
      `${RS}2024-01-01 09:00:00 +0000${US}Ada Lovelace`,
      `${RS}2024-01-02 10:00:00 +0000${US}Bea Byte`,
    ].join('\n');

    expect(parseGitLogOutput(raw)).toEqual([
      { authorDate: '2024-01-01 09:00:00 +0000', author: 'Ada Lovelace' },
      { authorDate: '2024-01-02 10:00:00 +0000', author: 'Bea Byte' },
    ]);
  });

  it('drops entries with no author date', () => {
    const raw = `${RS}${US}Nobody\n${RS}2024-01-01 09:00:00 +0000${US}Ada`;
    expect(parseGitLogOutput(raw)).toEqual([{ authorDate: '2024-01-01 09:00:00 +0000', author: 'Ada' }]);
  });
});

describe('commitActionArgs', () => {
  const hash = 'abc1234';

  it('builds argv for each action', () => {
    expect(commitActionArgs('checkout', hash)).toEqual(['checkout', '--detach', hash]);
    expect(commitActionArgs('checkout', hash, 'main')).toEqual(['checkout', 'main']);
    expect(commitActionArgs('create_branch', hash, 'feature/x')).toEqual(['branch', 'feature/x', hash]);
    expect(commitActionArgs('create_tag', hash, 'v1')).toEqual(['tag', 'v1', hash]);
    expect(commitActionArgs('cherry_pick', hash)).toEqual(['cherry-pick', hash]);
    expect(commitActionArgs('revert', hash)).toEqual(['revert', '--no-edit', hash]);
  });

  it('rejects names and hashes git would read as options', () => {
    expect(() => commitActionArgs('create_branch', hash, '--output=/tmp/x')).toThrow();
    expect(() => commitActionArgs('create_tag', hash, '')).toThrow();
    expect(() => commitActionArgs('cherry_pick', '--abort')).toThrow();
  });
});

describe('remoteActionArgs', () => {
  it('pushes to the upstream, or publishes to origin when there is none', () => {
    expect(remoteActionArgs('push', { hasUpstream: true })).toEqual(['push']);
    expect(remoteActionArgs('push')).toEqual(['push', '-u', 'origin', 'HEAD']);
  });

  it('maps each pull strategy to an explicit flag, defaulting to rebase', () => {
    expect(remoteActionArgs('pull')).toEqual(['pull', '--rebase']);
    expect(remoteActionArgs('pull', { strategy: 'merge' })).toEqual(['pull', '--no-rebase']);
    expect(remoteActionArgs('pull', { strategy: 'ff-only' })).toEqual(['pull', '--ff-only']);
  });

  it('rejects unknown actions', () => {
    expect(() => remoteActionArgs('reset' as never)).toThrow('Unknown remote action');
  });
});
