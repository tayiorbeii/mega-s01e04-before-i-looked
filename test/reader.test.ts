import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const event = {
  at: '2026-10-28T23:00:00+01:00',
  job: 'lane/sync',
  status: 'ok',
  owner: 'rook',
};

let runsDir: string;

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function writeEvents(events: unknown[]) {
  writeFileSync(join(runsDir, `${night}.jsonl`), events.map((item) => JSON.stringify(item)).join('\n') + '\n');
}

describe('readNight', () => {
  it('returns null for a missing night', () => {
    expect(readNight(runsDir, night)).toBeNull();
  });

  it('distinguishes an empty file from a missing night', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), '');
    expect(readNight(runsDir, night)).toEqual({
      rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('aggregates every event, sorts jobs, keeps null owners and retains errors after success', () => {
    writeEvents([
      { ...event, job: 'z/job', status: 'retry', error: 'first error' },
      { ...event, job: 'a/job', owner: null },
      { ...event, job: 'z/job', at: '2026-10-29T00:01:00+01:00', status: 'fail', error: 'last error' },
      { ...event, job: 'z/job', at: '2026-10-29T00:02:00+01:00', owner: null },
    ]);
    expect(readNight(runsDir, night)).toEqual({
      rows: [
        {
          job: 'a/job', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
          firstAt: event.at, lastAt: event.at,
        },
        {
          job: 'z/job', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: 'last error',
          firstAt: event.at, lastAt: '2026-10-29T00:02:00+01:00',
        },
      ],
      badLines: 0,
      counts: { ok: 2, retry: 1, fail: 1 },
    });
  });

  it('uses event time, not input order or timestamp text order, while retaining offsets', () => {
    writeEvents([
      { ...event, at: '2026-10-29T01:00:00+01:00', status: 'fail', error: 'newest error' },
      { ...event, at: '2026-10-28T23:30:00+00:00', status: 'retry', error: 'older error' },
      { ...event, at: '2026-10-29T03:00:00+02:00', owner: null },
    ]);
    expect(readNight(runsDir, night)?.rows).toEqual([{
      job: event.job, owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: 'newest error',
      firstAt: '2026-10-28T23:30:00+00:00', lastAt: '2026-10-29T03:00:00+02:00',
    }]);
  });

  it('counts malformed and schema-invalid lines once each without losing valid rows', () => {
    const { owner: _owner, ...withoutOwner } = event;
    const invalid: unknown[] = [
      null, [], 42, 'text', {}, withoutOwner,
      { ...event, job: '' }, { ...event, job: 42 },
      { ...event, owner: 42 }, { ...event, status: 'unknown' },
      { ...event, at: 'not a timestamp' }, { ...event, at: 42 },
      { ...event, at: '2026-10-28T23:00:00' }, { ...event, error: 42 },
    ];
    writeFileSync(join(runsDir, `${night}.jsonl`), [
      '{broken', ...invalid.map((item) => JSON.stringify(item)), '', JSON.stringify(event),
    ].join('\n'));
    expect(readNight(runsDir, night)).toEqual({
      rows: [{
        job: event.job, owner: event.owner, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: event.at, lastAt: event.at,
      }],
      badLines: invalid.length + 2,
      counts: { ok: 1, retry: 0, fail: 0 },
    });
  });

  it('supports CRLF and does not count the trailing line separator as a bad line', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), `${JSON.stringify(event)}\r\n`);
    expect(readNight(runsDir, night)?.badLines).toBe(0);
    expect(readNight(runsDir, night)?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });

  it.each(['../2026-10-28', '/2026-10-28', '2026-10-28/extra', '2026-10-28\\extra', '', '2026-10-28\n', '2026-10-28\0'])('rejects unsafe or invalid night identifiers: %j', (value) => {
    expect(() => readNight(runsDir, value)).toThrow('Invalid night');
  });

  it('propagates non-ENOENT filesystem errors', () => {
    mkdirSync(join(runsDir, `${night}.jsonl`));
    expect(() => readNight(runsDir, night)).toThrow();
  });

  it('reads the reference night without changing the fixtures', () => {
    const digest = readNight('runs', night);
    expect(digest?.badLines).toBe(1);
    expect(digest?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows.find((row) => row.job === 'fixtures/refresh')).toMatchObject({
      runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(digest?.rows.find((row) => row.job === 'digest/render')?.owner).toBeNull();
  });

  it('counts all seven successful events from the prior night', () => {
    expect(readNight('runs', '2026-10-27')?.counts).toEqual({ ok: 7, retry: 0, fail: 0 });
  });
});
