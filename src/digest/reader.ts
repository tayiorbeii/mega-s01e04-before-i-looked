import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, NightDigest, ReadNight } from './types.js';

type LogEvent = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

function isLogEvent(value: unknown): value is LogEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return (
    'at' in value && typeof value.at === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.at) &&
    Number.isFinite(Date.parse(value.at)) &&
    'job' in value && typeof value.job === 'string' && value.job.trim().length > 0 &&
    'status' in value && (value.status === 'ok' || value.status === 'retry' || value.status === 'fail') &&
    'owner' in value && (value.owner === null || typeof value.owner === 'string') &&
    (!('error' in value) || typeof value.error === 'string')
  );
}

export const readNight: ReadNight = (runsDir, night) => {
  if (night.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(night)) {
    throw new TypeError('Invalid night: expected YYYY-MM-DD');
  }

  let content: string;
  try {
    content = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const digest: NightDigest = { rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const events: LogEvent[] = [];
  const lines = content.split(/\r?\n/);
  // A terminal newline ends the preceding record; it is not another record.
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      digest.badLines += 1;
      continue;
    }
    if (!isLogEvent(value)) {
      digest.badLines += 1;
      continue;
    }
    events.push(value);
  }

  // Compare instants, not offset-bearing strings. Stable ties follow file order.
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const rows = new Map<string, DigestRow>();
  for (const event of events) {
    digest.counts[event.status] += 1;
    let row = rows.get(event.job);
    if (!row) {
      row = {
        job: event.job, owner: event.owner, runs: 0, retries: 0,
        lastStatus: event.status, lastError: null, firstAt: event.at, lastAt: event.at,
      };
      rows.set(event.job, row);
    }
    row.runs += 1;
    if (event.status === 'retry') row.retries += 1;
    row.owner = event.owner;
    row.lastStatus = event.status;
    row.lastAt = event.at;
    if (event.error !== undefined) row.lastError = event.error;
  }
  digest.rows = [...rows.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return digest;
};
