import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type NightCounts = { ok: number; retry: number; fail: number };
export type NightSummary = { night: string; counts: NightCounts | null };

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// Jobs by lastStatus in the night's digest; null when the digest can't be read.
export function countNight(runsDir: string, night: string): NightCounts | null {
  const digest = readNight(runsDir, night);
  if (!digest) return null;
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const row of digest.rows) counts[row.lastStatus]++;
  return counts;
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => ({ night, counts: countNight(config.runsDir, night) })),
  };
}
