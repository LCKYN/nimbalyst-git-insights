import { describe, expect, it } from 'vitest';
import { parseGitLogOutput } from '../gitLog';

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
