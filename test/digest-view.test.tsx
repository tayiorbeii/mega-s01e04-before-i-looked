import { renderToString } from 'hono/jsx/dom/server';
import { describe, expect, it } from 'vitest';
import type { NightDigest } from '../src/digest/types.js';
import { DigestPage } from '../src/views/digest.js';

describe('DigestPage view', () => {
  it('renders rows with all fields', () => {
    const digest: NightDigest = {
      rows: [
        {
          job: 'app/deploy',
          owner: 'alice',
          runs: 2,
          retries: 1,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T01:00:00+01:00',
          lastAt: '2026-10-29T01:05:00+01:00',
        },
      ],
      badLines: 0,
      counts: { ok: 1, retry: 0, fail: 0 },
    };

    const html = renderToString(<DigestPage night="2026-10-29" digest={digest} />);
    expect(html).toContain('app/deploy');
    expect(html).toContain('alice');
    expect(html).toContain('2026-10-29T01:00:00+01:00');
  });

  it('renders null owner as —', () => {
    const digest: NightDigest = {
      rows: [
        {
          job: 'digest/render',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00',
          lastAt: '2026-10-29T05:41:09+01:00',
        },
      ],
      badLines: 0,
      counts: { ok: 1, retry: 0, fail: 0 },
    };

    const html = renderToString(<DigestPage night="2026-10-29" digest={digest} />);
    expect(html).toContain('—');
  });

  it('renders null lastError as —', () => {
    const digest: NightDigest = {
      rows: [
        {
          job: 'app/test',
          owner: 'bob',
          runs: 3,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T00:00:00+01:00',
          lastAt: '2026-10-29T03:00:00+01:00',
        },
      ],
      badLines: 0,
      counts: { ok: 1, retry: 0, fail: 0 },
    };

    const html = renderToString(<DigestPage night="2026-10-29" digest={digest} />);
    const dashCount = (html.match(/—/g) || []).length;
    expect(dashCount).toBeGreaterThanOrEqual(1);
  });

  it('warns for retries >= 3 with ok status', () => {
    const digest: NightDigest = {
      rows: [
        {
          job: 'fixtures/refresh',
          owner: 'rook',
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T01:30:00+01:00',
          lastAt: '2026-10-29T01:37:00+01:00',
        },
      ],
      badLines: 0,
      counts: { ok: 1, retry: 0, fail: 0 },
    };

    const html = renderToString(<DigestPage night="2026-10-29" digest={digest} />);
    expect(html).toContain('class="warn"');
  });

  it('warns for fail status regardless of retries', () => {
    const digest: NightDigest = {
      rows: [
        {
          job: 'notes/backup',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00',
          lastAt: '2026-10-29T04:00:01+01:00',
        },
      ],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 1 },
    };

    const html = renderToString(<DigestPage night="2026-10-29" digest={digest} />);
    expect(html).toContain('class="warn"');
  });

  it('does not warn for retries < 3 with ok status', () => {
    const digest: NightDigest = {
      rows: [
        {
          job: 'batch/process',
          owner: 'charlie',
          runs: 3,
          retries: 2,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T00:00:00+01:00',
          lastAt: '2026-10-29T02:00:00+01:00',
        },
      ],
      badLines: 0,
      counts: { ok: 1, retry: 0, fail: 0 },
    };

    const html = renderToString(<DigestPage night="2026-10-29" digest={digest} />);
    expect(html).not.toContain('class="warn"');
  });

  it('shows counts in header', () => {
    const digest: NightDigest = {
      rows: [
        {
          job: 'app/deploy',
          owner: 'alice',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T01:00:00+01:00',
          lastAt: '2026-10-29T01:00:00+01:00',
        },
      ],
      badLines: 0,
      counts: { ok: 2, retry: 1, fail: 0 },
    };

    const html = renderToString(<DigestPage night="2026-10-29" digest={digest} />);
    expect(html).toContain('ok 2');
    expect(html).toContain('retry 1');
    expect(html).toContain('fail 0');
  });

  it('shows bad line count when > 0 with rows', () => {
    const digest: NightDigest = {
      rows: [
        {
          job: 'app/deploy',
          owner: 'alice',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T01:00:00+01:00',
          lastAt: '2026-10-29T01:00:00+01:00',
        },
      ],
      badLines: 1,
      counts: { ok: 1, retry: 0, fail: 0 },
    };

    const html = renderToString(<DigestPage night="2026-10-29" digest={digest} />);
    expect(html).toContain('bad lines 1');
  });

  it('shows bad line count with only malformed lines', () => {
    const digest: NightDigest = {
      rows: [],
      badLines: 2,
      counts: { ok: 0, retry: 0, fail: 0 },
    };

    const html = renderToString(<DigestPage night="2026-10-29" digest={digest} />);
    expect(html).toContain('nothing ran');
    expect(html).toContain('bad lines 2');
  });

  it('renders "nothing ran" for empty digest with no bad lines', () => {
    const digest: NightDigest = {
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    };

    const html = renderToString(<DigestPage night="2026-10-29" digest={digest} />);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<tbody>');
  });

  it('escapes special characters in error messages', () => {
    const digest: NightDigest = {
      rows: [
        {
          job: 'app/deploy',
          owner: 'alice',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'Connection <reset> & failed',
          firstAt: '2026-10-29T01:00:00+01:00',
          lastAt: '2026-10-29T01:00:00+01:00',
        },
      ],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 1 },
    };

    const html = renderToString(<DigestPage night="2026-10-29" digest={digest} />);
    expect(html).toContain('Connection &lt;reset&gt; &amp; failed');
  });
});
