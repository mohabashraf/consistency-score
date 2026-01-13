/**
 * Tests for the Consistency Score system
 *
 * Covers: sparse data, dense data, timezone boundaries, edge cases
 */

import { calculateConsistencyScore } from '../src/scoring';
import { Session } from '../src/types';

/**
 * Helper: Create a session at a specific day offset
 */
function createSession(
  daysAgo: number,
  durationSec: number = 30,
): Session {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(12, 0, 0, 0); // Noon

  return {
    id: `session-${daysAgo}`,
    timestamp: date,
    durationSec,
  };
}

describe('Consistency Score System', () => {

  /* ------------------------------------------------------------------ */
  /* TEST 1: Sparse Data                                                 */
  /* ------------------------------------------------------------------ */
  describe('Sparse Data - New/Casual Users', () => {
    it('should calculate fair score for 4 sessions over 28 days', () => {
      const sessions: Session[] = [
        createSession(27),
        createSession(20),
        createSession(12),
        createSession(2),
      ];

      const result = calculateConsistencyScore({ sessions });

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(30); // relaxed boundary
      expect(result.metadata.activeDays).toBe(4);
      expect(result.metadata.totalSessions).toBe(4);

      expect(result.explanations.length).toBeGreaterThanOrEqual(3);
      expect(result.explanations.length).toBeLessThanOrEqual(5);

      expect(result.explanations.join(' '))
        .toContain('4 out of 28 days');

      expect(result.chartData).toHaveLength(28);
      expect(result.chartData.filter(d => d.hasActivity).length).toBe(4);
    });

    it('should handle 2 sessions gracefully', () => {
      const sessions: Session[] = [
        createSession(15),
        createSession(1),
      ];

      const result = calculateConsistencyScore({ sessions });

      expect(result.score).toBeGreaterThan(0);
      expect(result.metadata.activeDays).toBe(2);
      expect(result.breakdown.distributionBonus).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 score for no sessions', () => {
      const result = calculateConsistencyScore({ sessions: [] });

      expect(result.score).toBe(0);
      expect(result.metadata.activeDays).toBe(0);
      expect(result.metadata.totalSessions).toBe(0);
      expect(result.chartData).toHaveLength(28);
    });
  });

  /* ------------------------------------------------------------------ */
  /* TEST 2: Dense Data                                                  */
  /* ------------------------------------------------------------------ */
  describe('Dense Data - Consistent Athletes', () => {
    it('should calculate high score for evenly-distributed activity', () => {
      const sessions: Session[] = [];
      for (let i = 0; i < 28; i += 1.4) {
        sessions.push(createSession(Math.floor(i)));
      }

      const result = calculateConsistencyScore({ sessions });

      expect(result.score).toBeGreaterThan(65);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.metadata.activeDays).toBeGreaterThanOrEqual(18);
      expect(result.breakdown.distributionBonus).toBeGreaterThan(10);

      const hasPositiveLanguage = result.explanations.some(exp =>
        /(great|strong|consistent|well)/i.test(exp)
      );
      expect(hasPositiveLanguage).toBe(true);
    });

    it('should treat multi-session days as one active day', () => {
      const sessions: Session[] = [];
      for (let i = 0; i < 10; i++) {
        const d = Math.floor(i * 2.8);
        const m = createSession(d);
        m.timestamp.setHours(8);
        const e = createSession(d);
        e.timestamp.setHours(18);
        sessions.push(m, e);
      }

      const result = calculateConsistencyScore({ sessions });

      expect(result.metadata.activeDays).toBe(10);
      expect(result.metadata.totalSessions).toBe(20);

      const expectedBase = (10 / 28) * 60;
      expect(result.breakdown.baseScore).toBeCloseTo(expectedBase, 1);
    });

    it('should cap score at 100 for perfect streaks', () => {
      const sessions = Array.from({ length: 28 }, (_, i) => createSession(i));

      const result = calculateConsistencyScore({ sessions });

      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.metadata.longestStreak).toBe(28);
      expect(result.breakdown.streakBonus).toBe(10);
    });
  });

  /* ------------------------------------------------------------------ */
  /* TEST 3: Timezone & Calendar Boundaries                              */
  /* ------------------------------------------------------------------ */
  describe('Timezone Boundary Cases', () => {
    it('should bucket sessions by local day (midnight crossing)', () => {
      const d1 = new Date();
      d1.setDate(d1.getDate() - 5);
      d1.setHours(23, 55);

      const d2 = new Date();
      d2.setDate(d2.getDate() - 4);
      d2.setHours(0, 5);

      const sessions: Session[] = [
        { id: 'a', timestamp: d1, durationSec: 30 },
        { id: 'b', timestamp: d2, durationSec: 30 },
      ];

      const result = calculateConsistencyScore({
        sessions,
        timezone: 'America/New_York',
      });

      expect(result.metadata.activeDays).toBe(1); // normalized correctly
    });

    it('should normalize same UTC date across timezones', () => {
      const date = new Date('2024-01-15T05:00:00Z');

      const sessions: Session[] = [
        { id: 'a', timestamp: date, durationSec: 30 },
        { id: 'b', timestamp: date, durationSec: 30 },
      ];

      expect(
        calculateConsistencyScore({ sessions, timezone: 'UTC' })
          .metadata.activeDays
      ).toBe(1);

      expect(
        calculateConsistencyScore({ sessions, timezone: 'Asia/Tokyo' })
          .metadata.activeDays
      ).toBe(1);
    });

    it('should handle daylight saving transitions safely', () => {
      const sessions: Session[] = [
        { id: 'a', timestamp: new Date('2024-03-10T01:30:00'), durationSec: 30 },
        { id: 'b', timestamp: new Date('2024-03-10T03:30:00'), durationSec: 30 },
      ];

      const result = calculateConsistencyScore({
        sessions,
        timezone: 'America/New_York',
        referenceDate: new Date('2024-03-10T12:00:00'),
      });

      expect(result.metadata.activeDays).toBe(1);
    });
  });

  /* ------------------------------------------------------------------ */
  /* TEST 4: Edge & Pathological Cases                                   */
  /* ------------------------------------------------------------------ */
  describe('Weird Timestamps and Edge Cases', () => {
    it('should be order-independent', () => {
      const sessions = [
        createSession(5),
        createSession(1),
        createSession(15),
        createSession(10),
      ];

      const result = calculateConsistencyScore({ sessions });

      expect(result.metadata.activeDays).toBe(4);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should tolerate zero-duration sessions', () => {
      const sessions = [
        createSession(10, 0),
        createSession(5, 30),
        createSession(1, 0),
      ];

      const result = calculateConsistencyScore({ sessions });

      expect(result.metadata.activeDays).toBe(3);
      expect(Number.isNaN(result.score)).toBe(false);
    });

    it('should collapse identical timestamps into one day', () => {
      const t = new Date();
      t.setDate(t.getDate() - 10);

      const sessions: Session[] = [
        { id: 'a', timestamp: new Date(t), durationSec: 30 },
        { id: 'b', timestamp: new Date(t), durationSec: 45 },
      ];

      const result = calculateConsistencyScore({ sessions });

      expect(result.metadata.activeDays).toBe(1);
      expect(result.metadata.totalSessions).toBe(2);
    });

    it('should penalize clustered activity (weekend warrior)', () => {
      const sessions = [
        createSession(27), createSession(27), createSession(26),
        createSession(20), createSession(20), createSession(19),
        createSession(13), createSession(12),
        createSession(6), createSession(5),
      ];

      const result = calculateConsistencyScore({ sessions });

      expect(result.metadata.activeDays).toBeLessThanOrEqual(8);
      expect(result.breakdown.distributionBonus).toBeLessThan(20);

      const mentionsDistribution = result.explanations.some(e =>
        /(distribution|spacing|even)/i.test(e)
      );
      expect(mentionsDistribution).toBe(true);
    });

    it('should reward current streaks and recency', () => {
      const sessions = [
        createSession(0),
        createSession(1),
        createSession(2),
        createSession(3),
        createSession(4),
        createSession(10),
      ];

      const result = calculateConsistencyScore({ sessions });

      expect(result.breakdown.streakBonus).toBeGreaterThan(0);
      expect(result.breakdown.recencyBonus).toBe(5);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Integration                                                         */
  /* ------------------------------------------------------------------ */
  describe('Integration', () => {
    it('should be deterministic', () => {
      const sessions = [
        createSession(10),
        createSession(5),
        createSession(1),
      ];

      const a = calculateConsistencyScore({ sessions });
      const b = calculateConsistencyScore({ sessions });

      expect(a).toEqual(b);
    });

    it('should always return full structure', () => {
      const result = calculateConsistencyScore({ sessions: [createSession(5)] });

      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('explanations');
      expect(result).toHaveProperty('chartData');
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('breakdown');
    });
  });
});