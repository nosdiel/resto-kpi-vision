// 4-4-5 fiscal calendar helpers.
// A fiscal year has 52 weeks split into 4 quarters of (4,4,5) weeks each = 13 periods total? No: 4 quarters * 3 periods = 12 periods, 52 weeks.
// Period -> week ranges within a fiscal year (1-indexed):
const PERIOD_WEEK_COUNTS = [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5]; // 12 periods, sum 52

export interface PeriodWeekRange {
  period: number;
  startWeek: number;
  endWeek: number;
  quarter: number;
}

export function getPeriodRanges(): PeriodWeekRange[] {
  const out: PeriodWeekRange[] = [];
  let cursor = 1;
  for (let i = 0; i < PERIOD_WEEK_COUNTS.length; i++) {
    const count = PERIOD_WEEK_COUNTS[i];
    out.push({
      period: i + 1,
      startWeek: cursor,
      endWeek: cursor + count - 1,
      quarter: Math.floor(i / 3) + 1,
    });
    cursor += count;
  }
  return out;
}

export function periodForWeek(week: number): number {
  const ranges = getPeriodRanges();
  const found = ranges.find((r) => week >= r.startWeek && week <= r.endWeek);
  return found?.period ?? 1;
}

export function weeksInPeriod(period: number): number[] {
  const r = getPeriodRanges().find((x) => x.period === period);
  if (!r) return [];
  const out: number[] = [];
  for (let w = r.startWeek; w <= r.endWeek; w++) out.push(w);
  return out;
}

/** Returns Sunday-start date for the given fiscal week, given the fiscal year's start_date (a Sunday). */
export function weekStartDate(fyStartDate: string, week: number): Date {
  const [y, m, d] = fyStartDate.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  start.setUTCDate(start.getUTCDate() + (week - 1) * 7);
  return start;
}

export function weekDates(fyStartDate: string, week: number): string[] {
  const start = weekStartDate(fyStartDate, week);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Default FY start: first Sunday on or after Jan 1 of that year. */
export function defaultFyStart(year: number): string {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const offset = (7 - jan1.getUTCDay()) % 7; // days until Sunday
  jan1.setUTCDate(jan1.getUTCDate() + offset);
  return jan1.toISOString().slice(0, 10);
}

/** Given a FY start date (Sunday), return the 1-indexed fiscal week containing `today`. Clamped to 1..52. */
export function fiscalWeekForDate(fyStartDate: string, today: Date = new Date()): number {
  const [y, m, d] = fyStartDate.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diffDays = Math.floor((todayUtc - start) / 86400000);
  if (diffDays < 0) return 1;
  return Math.min(52, Math.floor(diffDays / 7) + 1);
}

/** Best-guess current fiscal year + week using the standard default FY start (first Sunday >= Jan 1). */
export function currentFiscalYearWeek(today: Date = new Date()): { fiscalYear: number; fiscalWeek: number } {
  const year = today.getUTCFullYear();
  const thisStart = defaultFyStart(year);
  const [ty, tm, td] = thisStart.split("-").map(Number);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (todayUtc < Date.UTC(ty, tm - 1, td)) {
    const prev = year - 1;
    return { fiscalYear: prev, fiscalWeek: fiscalWeekForDate(defaultFyStart(prev), today) };
  }
  return { fiscalYear: year, fiscalWeek: fiscalWeekForDate(thisStart, today) };
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];