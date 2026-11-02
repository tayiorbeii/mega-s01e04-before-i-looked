import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/app.js';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { NightDigest } from '../src/digest/types.js';

const baseConfig = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };

describe('digest routes', () => {
  let tmpDir: string;
  const config = { ...baseConfig, runsDir: '' };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'digest-test-'));
    config.runsDir = tmpDir;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('missing night', () => {
    it('HTML returns 404', async () => {
      const res = await createApp(config).request('/digest/2026-11-15');
      expect(res.status).toBe(404);
    });

    it('JSON returns 404', async () => {
      const res = await createApp(config).request('/api/digest/2026-11-15');
      expect(res.status).toBe(404);
    });
  });

  describe('empty night', () => {
    beforeEach(() => {
      writeFileSync(join(tmpDir, '2026-11-10.jsonl'), '');
    });

    it('HTML returns 200 with no rows', async () => {
      const res = await createApp(config).request('/digest/2026-11-10');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('nothing ran');
    });

    it('JSON returns empty rows and zero counts', async () => {
      const res = await createApp(config).request('/api/digest/2026-11-10');
      expect(res.status).toBe(200);
      const json = await res.json() as NightDigest;
      expect(json.rows).toEqual([]);
      expect(json.counts).toEqual({ ok: 0, retry: 0, fail: 0 });
      expect(json.badLines).toBe(0);
    });
  });

  describe('valid entries', () => {
    beforeEach(() => {
      const content = [
        '{"at":"2026-11-10T10:00:01+01:00","job":"job-a","status":"ok","owner":"user1"}',
        '{"at":"2026-11-10T10:00:02+01:00","job":"job-b","status":"retry","owner":"user2","error":"timeout"}',
        '{"at":"2026-11-10T10:00:03+01:00","job":"job-c","status":"fail","owner":"user1","error":"out of memory"}',
      ].join('\n');
      writeFileSync(join(tmpDir, '2026-11-10.jsonl'), content);
    });

    it('JSON groups rows by job and counts statuses', async () => {
      const res = await createApp(config).request('/api/digest/2026-11-10');
      expect(res.status).toBe(200);
      const json = await res.json() as NightDigest;
      expect(json.rows).toHaveLength(3);
      expect(json.counts).toEqual({ ok: 1, retry: 1, fail: 1 });
      expect(json.badLines).toBe(0);

      // Verify rows are sorted by job
      expect(json.rows[0].job).toBe('job-a');
      expect(json.rows[1].job).toBe('job-b');
      expect(json.rows[2].job).toBe('job-c');
    });

    it('HTML includes rows sorted by job', async () => {
      const res = await createApp(config).request('/digest/2026-11-10');
      expect(res.status).toBe(200);
      const html = await res.text();

      // Verify jobs appear in order
      const jobAIndex = html.indexOf('job-a');
      const jobBIndex = html.indexOf('job-b');
      const jobCIndex = html.indexOf('job-c');
      expect(jobAIndex).toBeGreaterThan(0);
      expect(jobBIndex).toBeGreaterThan(jobAIndex);
      expect(jobCIndex).toBeGreaterThan(jobBIndex);
    });
  });

  describe('multiple runs per job', () => {
    beforeEach(() => {
      const content = [
        '{"at":"2026-11-10T10:00:01+01:00","job":"sync","status":"retry","owner":"rook","error":"lock held"}',
        '{"at":"2026-11-10T10:00:05+01:00","job":"sync","status":"retry","owner":"rook","error":"lock held"}',
        '{"at":"2026-11-10T10:00:10+01:00","job":"sync","status":"retry","owner":"rook","error":"lock held"}',
        '{"at":"2026-11-10T10:00:15+01:00","job":"sync","status":"ok","owner":"rook"}',
      ].join('\n');
      writeFileSync(join(tmpDir, '2026-11-10.jsonl'), content);
    });

    it('aggregates runs and preserves last error on success', async () => {
      const res = await createApp(config).request('/api/digest/2026-11-10');
      const json = await res.json() as NightDigest;

      expect(json.rows).toHaveLength(1);
      const row = json.rows[0];
      expect(row.job).toBe('sync');
      expect(row.runs).toBe(4);
      expect(row.retries).toBe(3);
      expect(row.lastStatus).toBe('ok');
      expect(row.lastError).toBe('lock held');
      expect(row.firstAt).toBe('2026-11-10T10:00:01+01:00');
      expect(row.lastAt).toBe('2026-11-10T10:00:15+01:00');
    });

    it('HTML marks retries >= 3 with warning class', async () => {
      const res = await createApp(config).request('/digest/2026-11-10');
      const html = await res.text();

      // Verify warn class is applied
      expect(html).toContain('class="warn"');
      expect(html).toContain('sync');
    });
  });

  describe('null owner', () => {
    beforeEach(() => {
      const content = [
        '{"at":"2026-11-10T10:00:01+01:00","job":"auto-task","status":"ok","owner":null}',
      ].join('\n');
      writeFileSync(join(tmpDir, '2026-11-10.jsonl'), content);
    });

    it('JSON preserves null owner', async () => {
      const res = await createApp(config).request('/api/digest/2026-11-10');
      const json = await res.json() as NightDigest;

      expect(json.rows[0].owner).toBeNull();
    });

    it('HTML renders null owner as —', async () => {
      const res = await createApp(config).request('/digest/2026-11-10');
      const html = await res.text();

      expect(html).toContain('—');
      expect(html).not.toContain('null');
      expect(html).not.toContain('undefined');
    });
  });

  describe('bad lines', () => {
    beforeEach(() => {
      const content = [
        '{"at":"2026-11-10T10:00:01+01:00","job":"job-a","status":"ok","owner":"user1"}',
        'this is not valid json at all',
        '{"at":"2026-11-10T10:00:02+01:00","job":"job-b","status":"ok","owner":"user2"}',
        '{"incomplete": "json',
      ].join('\n');
      writeFileSync(join(tmpDir, '2026-11-10.jsonl'), content);
    });

    it('counts bad lines separately from valid rows', async () => {
      const res = await createApp(config).request('/api/digest/2026-11-10');
      const json = await res.json() as NightDigest;

      expect(json.rows).toHaveLength(2);
      expect(json.badLines).toBe(2);
      expect(json.counts.ok).toBe(2);
    });

    it('HTML includes both valid rows and bad line count', async () => {
      const res = await createApp(config).request('/digest/2026-11-10');
      const html = await res.text();

      expect(html).toContain('job-a');
      expect(html).toContain('job-b');
      expect(html).toContain('bad lines 2');
    });
  });

  describe('content escaping', () => {
    beforeEach(() => {
      const content = [
        '{"at":"2026-11-10T10:00:01+01:00","job":"<script>alert(1)</script>","status":"ok","owner":"user"}',
        '{"at":"2026-11-10T10:00:02+01:00","job":"safe-job","status":"fail","owner":"user","error":"error: <img src=x onerror=alert(1)>"}',
      ].join('\n');
      writeFileSync(join(tmpDir, '2026-11-10.jsonl'), content);
    });

    it('HTML escapes job names', async () => {
      const res = await createApp(config).request('/digest/2026-11-10');
      const html = await res.text();

      // Verify escaped version is present and raw tags are absent
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;/script&gt;');
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('</script>');
    });

    it('HTML escapes error messages', async () => {
      const res = await createApp(config).request('/digest/2026-11-10');
      const html = await res.text();

      // Verify escaped version is present and raw tags are absent
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(html).not.toContain('<img src=x onerror=alert(1)>');
    });
  });

  describe('path validation', () => {
    beforeEach(() => {
      writeFileSync(join(tmpDir, '2026-11-10.jsonl'), '{"at":"2026-11-10T10:00:01+01:00","job":"a","status":"ok","owner":"x"}');
    });

    it('rejects parent directory traversal in night parameter', async () => {
      const res = await createApp(config).request('/digest/../../etc/passwd');
      expect(res.status).toBe(404);
    });

    it('rejects relative paths with slashes', async () => {
      const res = await createApp(config).request('/api/digest/sub/dir/2026-11-10');
      expect(res.status).toBe(404);
    });
  });

  describe('JSON and HTML consistency', () => {
    beforeEach(() => {
      const content = [
        '{"at":"2026-11-10T10:00:01+01:00","job":"alpha","status":"ok","owner":"user1"}',
        '{"at":"2026-11-10T10:00:02+01:00","job":"beta","status":"retry","owner":"user2","error":"failed"}',
        '{"at":"2026-11-10T10:00:03+01:00","job":"gamma","status":"fail","owner":"user1","error":"error"}',
      ].join('\n');
      writeFileSync(join(tmpDir, '2026-11-10.jsonl'), content);
    });

    it('HTML and JSON have same row count and order', async () => {
      const jsonRes = await createApp(config).request('/api/digest/2026-11-10');
      const htmlRes = await createApp(config).request('/digest/2026-11-10');

      const json = await jsonRes.json() as NightDigest;
      const html = await htmlRes.text();

      expect(json.rows).toHaveLength(3);

      // Verify JSON row order matches HTML table order
      const expectedJobOrder = json.rows.map(row => row.job);
      for (const job of expectedJobOrder) {
        expect(html).toContain(job);
      }

      // Verify table rows appear in same order as JSON
      const indices = expectedJobOrder.map(job => html.indexOf(job));
      for (let i = 0; i < indices.length - 1; i++) {
        expect(indices[i]).toBeLessThan(indices[i + 1]);
      }
    });

    it('JSON counts match what the HTML represents', async () => {
      const jsonRes = await createApp(config).request('/api/digest/2026-11-10');
      const json = await jsonRes.json() as NightDigest;

      expect(json.counts).toEqual({ ok: 1, retry: 1, fail: 1 });
      expect(json.badLines).toBe(0);
    });
  });

  describe('fail status warning', () => {
    beforeEach(() => {
      const content = [
        '{"at":"2026-11-10T10:00:01+01:00","job":"failed-job","status":"fail","owner":"user","error":"something broke"}',
      ].join('\n');
      writeFileSync(join(tmpDir, '2026-11-10.jsonl'), content);
    });

    it('HTML marks fail status with warning class', async () => {
      const res = await createApp(config).request('/digest/2026-11-10');
      const html = await res.text();

      expect(html).toContain('class="warn"');
      expect(html).toContain('failed-job');
    });
  });
});
