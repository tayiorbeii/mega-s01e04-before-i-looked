export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: DigestStatus;
  lastError: string | null;
  // Original log timestamps, including their offsets; never normalized to UTC.
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  // One row per job, sorted by job, shared by HTML and JSON.
  rows: DigestRow[];
  badLines: number;
  // Count all valid log events, including failures followed by a later success.
  counts: Record<DigestStatus, number>;
};

// Missing file = null; an existing empty file has no rows and all counts zero.
export type ReadNightResult = NightDigest | null;

// The reader will export readNight with this synchronous signature.
export type ReadNight = (runsDir: string, night: string) => ReadNightResult;
