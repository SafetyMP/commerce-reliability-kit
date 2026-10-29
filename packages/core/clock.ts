export function instant(value: string): number {
  const ms = Date.parse(value);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(ms)) throw new Error('Invalid UTC timestamp');
  const normalized = value.replace(/(?:\.(\d{1,3}))?Z$/, (_match: string, fraction: string | undefined) => '.' + (fraction ?? '').padEnd(3, '0') + 'Z');
  if (new Date(ms).toISOString() !== normalized) throw new Error('Invalid calendar timestamp');
  return ms;
}
export class VirtualClock {
  private time: number;
  constructor(at: string) { this.time = instant(at); }
  now(): string { return new Date(this.time).toISOString(); }
  advance(milliseconds: number): string {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || !Number.isSafeInteger(this.time + milliseconds) || this.time + milliseconds > 8640000000000000) throw new Error('Invalid clock advance');
    this.time += milliseconds;
    return this.now();
  }
}
