import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/types.js';

const line = (o: Record<string, unknown>) => JSON.stringify(o);
const T = '2026-10-28T01:00:00+01:00';

const FULL = [
  line({ at: T, job: 'lane/sync', status: 'ok', owner: null }),
  line({ at: T, job: 'alpha/build', status: 'retry', owner: 'ana', error: 'timeout' }),
  line({ at: T, job: 'alpha/build', status: 'retry', owner: 'ana', error: 'timeout' }),
  line({ at: T, job: 'alpha/build', status: 'retry', owner: 'ana', error: 'timeout' }),
  line({ at: T, job: 'alpha/build', status: 'ok', owner: 'ana' }),
  line({ at: T, job: 'zeta/export', status: 'fail', owner: 'bo', error: 'disk full' }),
].join('\n') + '\n';

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '2026-10-01.jsonl'), FULL);
  writeFileSync(join(dir, '2026-10-02.jsonl'), '');
  writeFileSync(
    join(dir, '2026-10-03.jsonl'),
    line({ at: T, job: 'lane/sync', status: 'ok', owner: 'ana' }) + '\nnot json\n',
  );
  app = createApp({ adapter: 'shim', installed: T, beatEverySeconds: 60, runsDir: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('GET /digest/:night', () => {
  it('200 with jobs, dash for null owner, warn on fail and retries>=3', async () => {
    const res = await app.request('/digest/2026-10-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const j of ['lane/sync', 'alpha/build', 'zeta/export']) expect(html).toContain(j);
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('<td class="warn">3</td>');
    expect(html).toContain('<td class="warn">fail</td>');
    expect(html.match(/class="warn"/g)).toHaveLength(2);
  });

  it('404 for a night with no file and for an invalid night', async () => {
    for (const n of ['2026-10-09', 'nope']) {
      const res = await app.request(`/digest/${n}`);
      expect(res.status).toBe(404);
      expect(await res.text()).toContain('no run log for this night');
    }
  });

  it('empty night says nothing ran', async () => {
    const res = await app.request('/digest/2026-10-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('bad line: page renders and mentions the unreadable line', async () => {
    const res = await app.request('/digest/2026-10-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 unreadable line skipped');
    expect(html).toContain('lane/sync');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 with rows', async () => {
    const res = await app.request('/api/digest/2026-10-01');
    const body = (await res.json()) as DigestNight;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-10-01');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/build', 'lane/sync', 'zeta/export']);
    expect(body.rows.find((r) => r.job === 'lane/sync')?.owner).toBeNull();
    expect(body.rows.find((r) => r.job === 'alpha/build')?.retries).toBe(3);
    expect(body.rows.find((r) => r.job === 'zeta/export')?.lastStatus).toBe('fail');
  });

  it('404 for a night with no file and for an invalid night', async () => {
    for (const n of ['2026-10-09', 'nope']) {
      const res = await app.request(`/api/digest/${n}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'no such night', night: n });
    }
  });

  it('empty night gives no rows and no bad lines', async () => {
    const res = await app.request('/api/digest/2026-10-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-10-02', rows: [], badLines: 0 });
  });

  it('bad line is counted', async () => {
    const res = await app.request('/api/digest/2026-10-03');
    const body = (await res.json()) as DigestNight;
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const html = await (await app.request('/digest/2026-10-01')).text();
    const body = (await (await app.request('/api/digest/2026-10-01')).json()) as DigestNight;
    const pageJobs = [...html.matchAll(/<tr><td>([^<]+)<\/td><td>/g)].map((m) => m[1]);
    expect(pageJobs).toEqual(body.rows.map((r) => r.job));
    expect(pageJobs).toHaveLength(3);
  });
});
