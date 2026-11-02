import { describe, expect, it } from 'vitest';
import { StatusBoard } from '../src/views/status.js';
import type { Status } from '../src/status.js';

describe('board', () => {
  it('links each night to its digest with counts', () => {
    const status: Status = {
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      lastBeat: null,
      nights: [
        { date: '2026-10-28', counts: { ok: 10, retry: 4, fail: 1 } },
        { date: '2026-10-27', counts: { ok: 7, retry: 0, fail: 0 } },
      ],
    };

    const html = String(<StatusBoard status={status} />);
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toContain('ok 10 retry 4 fail 1');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
    expect(html).toContain('ok 7 retry 0 fail 0');
  });

  it('shows no nights when the list is empty', () => {
    const status: Status = {
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      lastBeat: null,
      nights: [],
    };

    const html = String(<StatusBoard status={status} />);
    expect(html).toContain('nothing in runs/');
    expect(html).not.toContain('<a href="/digest/');
  });
});
