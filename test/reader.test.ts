import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';
import type { DigestNight, DigestRow } from '../src/digest/types.js';

const row = (night: DigestNight | null, job: string): DigestRow | undefined =>
  night?.rows.find((r) => r.job === job);

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('reads 5 jobs sorted by job and counts the 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('fixtures/refresh recovered: lastStatus ok, lastError kept', () => {
    expect(row(night, 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('notes/backup failed with its error', () => {
    expect(row(night, 'notes/backup')).toEqual({
      job: 'notes/backup',
      owner: 'lane-07',
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      firstAt: '2026-10-29T04:00:01+01:00',
      lastAt: '2026-10-29T04:00:01+01:00',
    });
  });

  it('digest/render keeps the row with owner null', () => {
    expect(row(night, 'digest/render')).toEqual({
      job: 'digest/render',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T05:41:09+01:00',
      lastAt: '2026-10-29T05:41:09+01:00',
    });
  });

  it('lane/sync counts valid lines only; first/last are file order, offsets unchanged', () => {
    expect(row(night, 'lane/sync')).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });

  it('rig/rotate-logs', () => {
    expect(row(night, 'rig/rotate-logs')).toEqual({
      job: 'rig/rotate-logs',
      owner: 'lane-07',
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-28T23:00:02+01:00',
      lastAt: '2026-10-28T23:00:02+01:00',
    });
  });
});

describe('readNight edge cases (temp runs dir)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    writeFileSync(join(dir, 'x.jsonl'), '');
    expect(readNight(join(dir, 'sub'), '../x')).toBeNull();
    expect(readNight(dir, 'x')).toBeNull();
    expect(readNight(dir, '2026-1-01')).toBeNull();
    expect(readNight(dir, '2026-01-01\n')).toBeNull();
  });

  it('an empty file gives no rows and no bad lines', () => {
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('skips blank lines; counts invalid JSON and lines not matching LogLine', () => {
    const lines = [
      '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      '',
      '   ',
      'not json',
      '[1,2]',
      'null',
      '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"done","owner":"x"}',
      '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok"}',
      '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok","owner":3}',
      '{"at":1,"job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"fail","owner":"x","error":7}',
      '{"at":"2026-01-03T02:00:00+01:00","job":"a","status":"retry","owner":null,"error":"boom"}',
      '',
    ];
    writeFileSync(join(dir, '2026-01-03.jsonl'), lines.join('\n'));
    expect(readNight(dir, '2026-01-03')).toEqual({
      night: '2026-01-03',
      badLines: 8,
      rows: [
        {
          job: 'a',
          owner: null,
          runs: 2,
          retries: 1,
          lastStatus: 'retry',
          lastError: 'boom',
          firstAt: '2026-01-03T01:00:00+01:00',
          lastAt: '2026-01-03T02:00:00+01:00',
        },
      ],
    });
  });
});
