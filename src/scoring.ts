/**
 * Pure scoring function for 28-day consistency score
 *
 * Design goals:
 * - Explainable (no opaque math)
 * - Non-medical (behavioral consistency only)
 * - Mobile-friendly (simple chart + bullets)
 */

import {
  ConsistencyScore,
  ScoreInput,
  ActiveDay,
  DayActivity,
  ConsistencyMetadata,
  ScoreBreakdown,
  Session,
} from './types';

const WINDOW_DAYS = 28;

/**
 * Calculate consistency score from session data
 */
export function calculateConsistencyScore(input: ScoreInput): ConsistencyScore {
  const { sessions, referenceDate = new Date(), timezone = 'UTC' } = input;

  // Deduplicate sessions into active calendar days
  const activeDays = groupSessionsByDay(sessions, timezone);

  // Derive metadata (gaps, streaks, recency)
  const metadata = calculateMetadata(activeDays, referenceDate, timezone);

  // Base score components
  const breakdown = calculateScoreBreakdown(activeDays, metadata);

  // Streak bonus needs reference date context
  breakdown.streakBonus = calculateStreakBonus(
    activeDays,
    referenceDate,
    timezone
  );

  // Visualization + explanations
  const chartData = generateChartData(activeDays, referenceDate, timezone);
  const explanations = generateExplanations(metadata, breakdown);

  // Final score (defensive clamp)
  const rawScore =
    breakdown.baseScore +
    breakdown.distributionBonus +
    breakdown.streakBonus +
    breakdown.recencyBonus;

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  return {
    score,
    explanations,
    chartData,
    metadata,
    breakdown,
  };
}

/**
 * Group sessions by calendar date in user's timezone
 * Multiple sessions per day count as one active day
 */
function groupSessionsByDay(
  sessions: Session[],
  timezone: string
): ActiveDay[] {
  const dayMap = new Map<string, ActiveDay>();

  for (const session of sessions) {
    const dateStr = toLocalDateString(session.timestamp, timezone);

    if (!dayMap.has(dateStr)) {
      dayMap.set(dateStr, {
        date: dateStr,
        sessionCount: 0,
        totalDurationSec: 0,
      });
    }

    const day = dayMap.get(dateStr)!;
    day.sessionCount++;

    // Defensive normalization of duration
    const duration = Math.max(0, Number(session.durationSec) || 0);
    day.totalDurationSec += duration;
  }

  return Array.from(dayMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

/**
 * Base score: frequency of active days
 * (activeDays / 28) * 60
 */
function calculateBaseScore(activeDays: ActiveDay[]): number {
  const MAX_BASE_SCORE = 60;
  return (activeDays.length / WINDOW_DAYS) * MAX_BASE_SCORE;
}

/**
 * Distribution bonus
 * Rewards even spacing, penalizes long gaps
 *
 * Simple, explainable rule:
 * - Measure the longest gap between active days
 * - Normalize against the 28-day window
 */
function calculateDistributionBonus(activeDays: ActiveDay[]): number {
  const MAX_DISTRIBUTION_BONUS = 25;

  if (activeDays.length < 2) return 0;

  const gaps: number[] = [];

  for (let i = 1; i < activeDays.length; i++) {
    const prev = new Date(activeDays[i - 1].date);
    const curr = new Date(activeDays[i].date);
    const gapDays = Math.floor(
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
    );
    gaps.push(gapDays);
  }

  const maxGap = Math.max(...gaps);
  const distributionQuality = 1 - Math.min(maxGap / WINDOW_DAYS, 1);

  return distributionQuality * MAX_DISTRIBUTION_BONUS;
}

/**
 * Streak bonus (current consecutive days)
 * +2 points per day, capped at 10
 */
function calculateStreakBonus(
  activeDays: ActiveDay[],
  referenceDate: Date,
  timezone: string
): number {
  const MAX_STREAK_BONUS = 10;
  const POINTS_PER_DAY = 2;

  if (activeDays.length === 0) return 0;

  const activeDaySet = new Set(activeDays.map(d => d.date));

  let streak = 0;
  let checkDate = new Date(
    toLocalDateString(referenceDate, timezone)
  );

  for (let i = 0; i < WINDOW_DAYS; i++) {
    const dateStr = toLocalDateString(checkDate, timezone);

    if (activeDaySet.has(dateStr)) {
      streak++;
    } else if (streak > 0) {
      break;
    }

    checkDate.setDate(checkDate.getDate() - 1);
  }

  return Math.min(streak * POINTS_PER_DAY, MAX_STREAK_BONUS);
}

/**
 * Recency bonus
 * Encourages recent activity
 */
function calculateRecencyBonus(metadata: ConsistencyMetadata): number {
  const { daysSinceLastSession } = metadata;

  if (daysSinceLastSession <= 1) return 5;
  if (daysSinceLastSession <= 3) return 3;
  if (daysSinceLastSession <= 7) return 1;
  return 0;
}

/**
 * Assemble score breakdown (excluding streak)
 */
function calculateScoreBreakdown(
  activeDays: ActiveDay[],
  metadata: ConsistencyMetadata
): ScoreBreakdown {
  return {
    baseScore: calculateBaseScore(activeDays),
    distributionBonus: calculateDistributionBonus(activeDays),
    streakBonus: 0, // calculated separately
    recencyBonus: calculateRecencyBonus(metadata),
  };
}

/**
 * Compute metadata about activity patterns
 */
function calculateMetadata(
  activeDays: ActiveDay[],
  referenceDate: Date,
  timezone: string
): ConsistencyMetadata {
  if (activeDays.length === 0) {
    return {
      totalSessions: 0,
      activeDays: 0,
      longestStreak: 0,
      longestGap: 0,
      averageGap: 0,
      daysSinceLastSession: WINDOW_DAYS,
    };
  }

  const totalSessions = activeDays.reduce(
    (sum, d) => sum + d.sessionCount,
    0
  );

  // Longest streak
  let longestStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < activeDays.length; i++) {
    const prev = new Date(activeDays[i - 1].date);
    const curr = new Date(activeDays[i].date);
    const diffDays = Math.floor(
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 1) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  // Gaps
  const gaps: number[] = [];
  for (let i = 1; i < activeDays.length; i++) {
    const prev = new Date(activeDays[i - 1].date);
    const curr = new Date(activeDays[i].date);
    const gap = Math.floor(
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
    );
    gaps.push(gap);
  }

  const longestGap = gaps.length ? Math.max(...gaps) : 0;
  const averageGap = gaps.length
    ? gaps.reduce((s, g) => s + g, 0) / gaps.length
    : 0;

  const lastDate = new Date(activeDays[activeDays.length - 1].date);
  const refLocal = new Date(toLocalDateString(referenceDate, timezone));
  const daysSinceLastSession = Math.floor(
    (refLocal.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    totalSessions,
    activeDays: activeDays.length,
    longestStreak,
    longestGap,
    averageGap,
    daysSinceLastSession,
  };
}

/**
 * Generate 28 days of chart data
 */
function generateChartData(
  activeDays: ActiveDay[],
  referenceDate: Date,
  timezone: string
): DayActivity[] {
  const activeDayMap = new Map(
    activeDays.map(d => [d.date, d])
  );

  const chart: DayActivity[] = [];

  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - i);
    const dateStr = toLocalDateString(d, timezone);

    const day = activeDayMap.get(dateStr);

    chart.push({
      date: dateStr,
      hasActivity: !!day,
      sessionCount: day?.sessionCount ?? 0,
    });
  }

  return chart;
}

/**
 * Generate human-readable explanations (max 5)
 */
function generateExplanations(
  metadata: ConsistencyMetadata,
  breakdown: ScoreBreakdown
): string[] {
  const bullets: string[] = [];

  const pct = Math.round((metadata.activeDays / WINDOW_DAYS) * 100);
  bullets.push(`You trained ${metadata.activeDays} out of 28 days (${pct}%)`);

  if (metadata.activeDays >= 2) {
    const distPct = Math.round(
      (breakdown.distributionBonus / 25) * 100
    );

    if (distPct >= 75) {
      bullets.push('Your sessions are evenly distributed');
    } else if (distPct >= 50) {
      bullets.push('Your sessions are fairly well spaced');
    } else {
      bullets.push('Long gaps reduce your consistency score');
    }
  }

  if (metadata.longestStreak > 1) {
    bullets.push(`Longest streak: ${metadata.longestStreak} days`);
  }

  if (metadata.daysSinceLastSession <= 3) {
    bullets.push(
      metadata.daysSinceLastSession === 0
        ? 'You exercised today—great momentum!'
        : `Last session was ${metadata.daysSinceLastSession} days ago`
    );
  }

  if (metadata.longestGap > 7 && bullets.length < 5) {
    bullets.push(`Longest gap: ${metadata.longestGap} days`);
  }

  return bullets.slice(0, 5);
}

/**
 * Convert Date to YYYY-MM-DD in user's timezone
 */
function toLocalDateString(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(date);
}