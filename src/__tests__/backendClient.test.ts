import { describe, expect, it } from 'vitest';
import { callBackendToolCoalesced, setAiService } from '../backendClient';

describe('callBackendToolCoalesced', () => {
  it('runs one identical call at a time and shares a single rerun among callers that arrive meanwhile', async () => {
    const pending: ((value: number) => void)[] = [];
    let calls = 0;
    setAiService({
      callBackendTool: () => {
        calls++;
        return new Promise((resolve) => pending.push(resolve));
      },
    } as never);

    const first = callBackendToolCoalesced<number>('get_summary', { repoPath: '/r' });
    const second = callBackendToolCoalesced<number>('get_summary', { repoPath: '/r' });
    const third = callBackendToolCoalesced<number>('get_summary', { repoPath: '/r' });
    const other = callBackendToolCoalesced<number>('get_summary', { repoPath: '/other' });
    expect(calls).toBe(2); // '/r' once, '/other' once

    pending[0](1);
    expect(await first).toBe(1);
    await new Promise((r) => setTimeout(r));
    expect(calls).toBe(3); // the queued rerun for '/r'

    pending[2](2);
    expect(await second).toBe(2);
    expect(await third).toBe(2);
    pending[1](9);
    expect(await other).toBe(9);
  });
});
