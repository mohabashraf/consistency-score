/**
 * Firestore query helpers for fetching session data efficiently
 *
 * Scope:
 * - Read-only helpers for Consistency Score (Question 2)
 * - Single-query per user (no N+1)
 * - Explicit limits to control cost
 */

import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { Session } from './types';

const DEFAULT_WINDOW_DAYS = 28;
const DEFAULT_LIMIT = 200;

/**
 * Fetch sessions for a user within the last N days
 *
 * @param db - Firestore instance
 * @param userId - User ID
 * @param days - Lookback window (default: 28)
 * @param options - Optional query tuning
 */
export async function fetchUserSessions(
  db: Firestore,
  userId: string,
  days: number = DEFAULT_WINDOW_DAYS,
  options?: {
    limit?: number;
    referenceDate?: Date;
  }
): Promise<Session[]> {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const referenceDate = options?.referenceDate ?? new Date();

  const startDate = new Date(referenceDate);
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('sessions')
    .where('timestamp', '>=', Timestamp.fromDate(startDate))
    .where('timestamp', '<=', Timestamp.fromDate(referenceDate))
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();

    return {
      id: doc.id,
      timestamp: data.timestamp.toDate(),
      durationSec: Number(data.durationSec) || 0,
      type: data.type,
    };
  });
}

/**
 * Batch fetch sessions for multiple users
 *
 * Intended for:
 * - Leaderboards
 * - Offline aggregation
 * - Admin dashboards
 *
 * @param db - Firestore instance
 * @param userIds - User IDs
 * @param days - Lookback window
 */
export async function batchFetchUserSessions(
  db: Firestore,
  userIds: string[],
  days: number = DEFAULT_WINDOW_DAYS
): Promise<Map<string, Session[]>> {
  const results = await Promise.all(
    userIds.map(async userId => {
      try {
        const sessions = await fetchUserSessions(db, userId, days);
        return [userId, sessions] as const;
      } catch {
        // Fail-soft: return empty data for this user
        return [userId, []] as const;
      }
    })
  );

  return new Map(results);
}

/**
 * Fetch the most recent session for a user
 *
 * Useful for:
 * - Fast recency checks
 * - Debugging / admin views
 */
export async function getLastSession(
  db: Firestore,
  userId: string
): Promise<Session | null> {
  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('sessions')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  return {
    id: doc.id,
    timestamp: data.timestamp.toDate(),
    durationSec: Number(data.durationSec) || 0,
    type: data.type,
  };
}

/**
 * REQUIRED FIRESTORE INDEX
 *
 * Collection: users/{userId}/sessions
 *
 * Composite index:
 *   - timestamp (Descending)
 *
 * Reason:
 * - We filter by a timestamp range (>=, <=)
 * - We order by timestamp DESC
 * - Firestore requires a composite index for range + orderBy
 *
 * Cost considerations:
 * - Reads scale linearly with number of sessions in window
 * - With limit=200 → max 200 reads per score calculation
 * - Subcollections partition data by user automatically
 *
 * Latency:
 * - Single user query: ~100–300ms typical
 * - Batch (50–100 users): ~1–2s with Promise.all
 *
 * Optimization notes:
 * - Scores should be cached and recomputed only on new session writes
 * - This query is designed to be predictable and bounded
 */