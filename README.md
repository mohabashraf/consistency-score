# 28-Day Consistency Score (v1)

An **explainable 0–100 consistency score** based on the last 28 days of exercise sessions.

This is a **behavioral signal**, not a medical or performance metric.  
It answers one question only:

> "How consistent has this user been recently?"

---

## How to Review (5–7 minutes)

1. **README** – overview + worked example  
2. `src/scoring.ts` – pure scoring function  
3. `src/queries.ts` – efficient Firestore query (single read path)  
4. `__tests__/scoring.test.ts` – edge-case coverage  

---

## Design Philosophy

**What makes consistency "good"?**

1. **Frequency** – more active days is better  
2. **Distribution** – spread-out sessions beat clustering  
3. **Recency** – recent activity reflects current commitment  
4. **Sustainability** – avoid rewarding short bursts  

**Key Principles**

- New users are not penalized for limited history
- Multiple sessions in one day count **once**
- Consistency > volume
- Every point is explainable

---

## Score Formula (0–100)

```
Base Score (0–60)
= (activeDays / 28) * 60

Distribution Bonus (0–25)
= rewards even spacing of sessions

Streak Bonus (0–10)
= current consecutive days * 2 (capped)

Recency Bonus (0–5)
= based on days since last session

Total = Base + Distribution + Streak + Recency (capped at 100)
```

---

## Worked Example (Manual)

### User Activity (last 28 days)

Sessions on days: **1, 2, 5, 8, 9, 10, 15, 22, 28**

**Step 1 – Base Score**

```
Active days = 9
(9 / 28) * 60 = 19.3
```

**Step 2 – Distribution Bonus**

```
Session gaps = [1,3,3,1,1,5,7,6]
Std dev ≈ 2.36
Normalized = 1 - (2.36 / 8.75) = 0.73
0.73 * 25 = 18.3
```

**Step 3 – Streak Bonus**

```
Current streak = 1 day
1 * 2 = 2
```

**Step 4 – Recency Bonus**

```
Last session = today
+5
```

**Final Score**

```
19.3 + 18.3 + 2 + 5 = 44.6 → 45/100
```

**Generated Explanation**

```json
{
  "score": 45,
  "explanations": [
    "You trained 9 out of 28 days (32%)",
    "Your sessions are fairly well distributed",
    "Current streak: 1 day",
    "You exercised today—great momentum"
  ]
}
```

---

## Firestore Data Model & Query

### Data Structure

```
users/{userId}/sessions/{sessionId}
  - timestamp: Timestamp
  - duration: number
  - timezone: string
```

### Query Strategy

```typescript
db.collection('users')
  .doc(userId)
  .collection('sessions')
  .where('timestamp', '>=', startDate)
  .orderBy('timestamp', 'desc')
  .limit(200);
```

**Why this works**

- Single query per user (no N+1)
- Subcollection partitions data naturally
- Limit prevents runaway reads
- Descending order favors recent sessions

### Required Index

```
Collection: sessions
Field: timestamp (descending)
```

---

## Timezone Handling

- Sessions stored as UTC timestamps
- Converted to user timezone before bucketing
- Deduplicated by calendar day (YYYY-MM-DD)
- Prevents midnight double-counting

---

## Test Coverage

The test suite explicitly covers:

### 1. Sparse data
- 2–4 sessions
- No divide-by-zero
- Encouraging explanations

### 2. Dense data
- 20+ sessions
- Multi-session days counted once
- Upper score bounds

### 3. Timezone boundaries
- Midnight splits
- DST transitions

### 4. Weird timestamps
- Out-of-order events
- Duplicate timestamps
- Clustered "weekend warrior" patterns

---

## Observability (Minimal)

On each score calculation, log:

- final score
- activeDays
- totalSessions
- score breakdown
- calculation duration (ms)

This is sufficient to detect:

- scoring regressions
- data quality issues
- performance degradation

---

## Tradeoffs & Non-Goals

- Not a medical or fitness assessment
- Session intensity is ignored
- No leaderboards or comparisons
- Streaks are capped to avoid burst gaming

---

## Future Improvements (Out of Scope)

- Intensity weighting
- Goal-based scoring (e.g. 3×/week target)
- Trend detection (improving vs declining)
- Pattern recognition (e.g. predictable weekends)

---

## License

MIT