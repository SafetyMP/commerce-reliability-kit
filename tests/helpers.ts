import { readFileSync } from 'node:fs';
import type { Scenario, Coverage, CaptureInterval } from '../packages/core/types.ts';
export function fixture(name: string): Scenario { return JSON.parse(readFileSync(new URL(`../scenarios/${name}.json`, import.meta.url), 'utf8')) as Scenario; }
export const time = (hhmm: string): string => `2026-10-28T${hhmm}:00Z`;

export const pointInterval = (at: string): CaptureInterval => ({ version: '1.0.0', start: at, end: at });
export function setCaptureTime(c: Coverage, at: string): void { c.observedAt = at; c.captureInterval = pointInterval(at); }
