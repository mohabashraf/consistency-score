/**
 * Type definitions for the Consistency Score system
 * Designed to be explainable, non-medical, and mobile-friendly
 */

/**
 * Raw session data (as stored in Firestore)
 */
export interface Session {
  id: string; // Unique session ID (used for deduplication)
  timestamp: Date;
  durationSec?: number; // Duration in seconds (optional, may be missing/invalid)
  type?: string;
}

/**
 * Aggregated activity for a single calendar day
 */
export interface ActiveDay {
  date: string; // YYYY-MM-DD (local to user timezone)
  sessionCount: number;
  totalDurationSec: number;
}

/**
 * Per-day chart data for lightweight visualization
 */
export interface DayActivity {
  date: string; // YYYY-MM-DD
  hasActivity: boolean;
  sessionCount: number;
}

/**
 * Derived metadata describing user activity patterns
 */
export interface ConsistencyMetadata {
  totalSessions: number;
  activeDays: number;
  longestStreak: number;
  longestGap: number;
  averageGap: number;
  daysSinceLastSession: number;
}

/**
 * Detailed score breakdown for transparency/debugging
 */
export interface ScoreBreakdown {
  baseScore: number;         // Frequency component (0–60)
  distributionBonus: number; // Even spacing reward (0–25)
  streakBonus: number;       // Current streak reward (0–10)
  recencyBonus: number;      // Recent activity reward (0–5)
}

/**
 * Complete consistency score output
 */
export interface ConsistencyScore {
  score: number; // Final score (0–100)
  explanations: string[]; // 3–5 human-readable bullets
  chartData: DayActivity[]; // 28-day visualization data
  metadata: ConsistencyMetadata;
  breakdown: ScoreBreakdown;
}

/**
 * Input parameters for score calculation
 */
export interface ScoreInput {
  sessions: Session[];
  referenceDate?: Date; // Defaults to "now"
  timezone?: string; // IANA timezone (e.g. "UTC", "America/New_York")
}