# Scoring Design Rationale

This document explains the "why" behind every scoring decision.

## Core Design Constraints

### 1. Explainability First
**Constraint:** Every point must be traceable to a specific behavior.

**Why:** Users need to understand their score to improve it. "AI magic" scores frustrate users who don't know what to do differently.

**Implementation:** 
- Each component (base, distribution, streak, recency) has clear formula
- Explanations directly reference the same metrics used in scoring
- README includes worked examples anyone can verify by hand

---

### 2. Fair Across User Levels
**Constraint:** Must work for beginners (3 sessions/month) AND athletes (daily training).

**Why:** Unfair scoring alienates one group. A beginner scoring 5/100 will quit; an athlete scoring 95/100 has no motivation.

**Implementation:**
- Base score uses percentage (9/28 days = same % for everyone)
- Distribution bonus scales with activity level
- New users aren't penalized (missing data ≠ bad score)

**Example:**
- Beginner: 4 sessions spread out → 20/100 (fair)
- Athlete: 20 sessions spread out → 75/100 (fair)
- Weekend warrior: 12 sessions clustered → 25/100 (correctly penalized)

---

### 3. Non-Medical
**Constraint:** Cannot make health claims or prescribe behavior.

**Why:** Legal risk, ethical concerns, not qualified.

**Implementation:**
- Focus on "consistency" not "fitness" or "health"
- Explanations use neutral language: "trained X days" not "you're healthy"
- No claims about outcomes: "great momentum" not "you'll live longer"

---

## Scoring Formula Breakdown

### Component 1: Base Score (60 points max)

**Formula:** `(activeDays / 28) * 60`

**Rationale:**
- **Why 60 points?** Leaves room for bonuses while making frequency the foundation. Someone active every day gets 60 base points before bonuses.
- **Why 28 days?** Aligns with monthly cycles, long enough to see patterns but short enough to stay motivated.
- **Why active days, not total sessions?** Prevents gaming the system with 3 workouts in one day. We care about consistency, not volume.

**Edge Cases Handled:**
- 0 sessions → 0 base score (fair)
- 28 sessions → 60 base score (excellent)
- 14 sessions → 30 base score (moderate)

**Alternative Considered:** 
- Using total sessions instead of active days
- **Rejected:** Rewards unsustainable bursts. Someone doing 10 sessions in 2 days would score higher than someone spreading 10 sessions across 10 days.

---

### Component 2: Distribution Bonus (25 points max)

**Formula:** `(1 - normalizedStdDev) * 25`

**Rationale:**
- **Why standard deviation?** Mathematically captures "evenness" of distribution. Low std dev = evenly spaced sessions.
- **Why normalize?** Makes the metric comparable across different activity levels. A beginner's 4 sessions can be "well distributed" relative to their baseline.
- **Why 25 points?** Significant enough to reward good behavior but not so large it dominates the score.

**Math Details:**
```
Gaps between sessions: [3, 2, 4, 3, 5] days
Mean gap: 3.4 days
Variance: ((3-3.4)² + (2-3.4)² + ... ) / 5 = 1.04
Std Dev: √1.04 = 1.02

Theoretical max std dev for this pattern: ~6.5
Normalized: 1 - (1.02 / 6.5) = 0.84
Distribution bonus: 0.84 * 25 = 21 points
```

**Why This Matters:**
- User A: 12 sessions, all on weekends → std dev high → bonus low
- User B: 12 sessions, spread evenly → std dev low → bonus high
- Both have same frequency but User B gets better score

**Alternative Considered:**
- Coefficient of variation (CV = std dev / mean)
- **Rejected:** Penalizes high-frequency users who train daily (mean gap approaches 1, CV explodes)

---

### Component 3: Streak Bonus (10 points max)

**Formula:** `min(currentStreakDays * 2, 10)`

**Rationale:**
- **Why current streak?** Rewards momentum. If you trained 5 days straight ending today, you're "hot". If you trained 5 days straight last week then stopped, you've lost momentum.
- **Why 2 points per day?** 5-day streak = 10 points (max). Achievable but requires effort.
- **Why cap at 10?** Prevents dominating the score. A 28-day streak shouldn't make frequency irrelevant.

**Examples:**
- Streak of 1 day → 2 points
- Streak of 3 days → 6 points
- Streak of 5+ days → 10 points (maxed)

**Design Decision:**
- We count a "break" as 1+ days of no activity
- This is strict but clear: miss one day = streak resets

**Alternative Considered:**
- Longest streak (ever in 28 days, not just current)
- **Rejected:** Doesn't incentivize current behavior. You could have a 10-day streak 3 weeks ago and no recent activity.

---

### Component 4: Recency Bonus (5 points max)

**Formula:**
```
0-1 days ago → 5 points
2-3 days ago → 3 points
4-7 days ago → 1 point
8+ days ago → 0 points
```

**Rationale:**
- **Why recency?** Encourages users to stay active NOW. Without this, someone could train 20 days in first half of the month then ghost for 2 weeks and still score well.
- **Why steep drop-off?** Creates urgency. The difference between "today" and "3 days ago" should be meaningful.
- **Why 5 points max?** Small enough that it won't save a bad overall score, but enough to nudge behavior.

**User Psychology:**
- "You exercised today—great momentum!" → 5 points
- "Last session was 4 days ago—time to get moving!" → 1 point
- Gentle nudge without being preachy

**Alternative Considered:**
- Exponential decay (e.g., 0.95^daysSinceLastSession)
- **Rejected:** Too complex to explain. Linear buckets are intuitive.

---

## Total Score Capping

**Rule:** `Total = min(base + distribution + streak + recency, 100)`

**Rationale:**
- **Why cap at 100?** Intuitive scale. Everyone understands 0-100.
- **Can you exceed 100 mathematically?** Yes: 60 + 25 + 10 + 5 = 100. But we cap anyway for safety.

**Is 100 achievable?**
- 28 active days → 60 base
- Perfect distribution → 25 distribution
- 5+ day streak → 10 streak
- Trained today → 5 recency
- Total: 100

Requires perfection but IS possible.

---

## What This Scoring Is NOT

### Not Fitness Assessment
- We don't measure intensity, heart rate, calories
- A 10-minute walk counts the same as a 2-hour marathon
- **Why:** We lack the data and medical expertise

### Not Comparative
- No leaderboards (by design)
- No "you're in top 20%"
- **Why:** Competition creates anxiety; consistency is personal

### Not Prescriptive
- We don't say "you should train X times per week"
- We describe patterns, not make recommendations
- **Why:** Everyone's goals differ

---

## Validation: Does This Score Predict Good Behavior?

### Hypothetical A/B Test Results

If we ran this in production, we'd measure:

**Hypothesis:** Higher consistency score → better retention

**Validation Metrics:**
- Users with score >60 return next month: 75%
- Users with score 30-60 return: 55%
- Users with score <30 return: 35%

If true → scoring formula aligns with business goals.

**Would Need to Check:**
- Score doesn't discriminate (gender, age, location)
- Score correlates with user satisfaction surveys
- Changes to formula change user behavior

---

## Known Limitations & Future Improvements

### Limitation 1: Ignores Intensity
**Issue:** 10-minute walk = 2-hour marathon

**Why Not Fixed Now:** 
- Would require intensity data (heart rate, perceived exertion)
- Adds complexity to explanation
- Risk of penalizing low-intensity exercise (which is still good!)

**Future V2:**
- Add optional intensity weighting
- Separate scores for "frequency" and "effort"

### Limitation 2: No Goal Personalization
**Issue:** Someone aiming for 3x/week gets same formula as daily trainer

**Why Not Fixed Now:**
- Requires users to set goals
- Cold start problem for new users
- Formula needs to adapt per user

**Future V2:**
- Let users set target (e.g., "4 days/week")
- Score measures: "achievement vs. goal"

### Limitation 3: Weekend Bias
**Issue:** If you always train Saturday-Sunday, gaps between sessions are 5-6 days

**Why Not Fixed Now:**
- It IS clustered, even if predictable
- Hard to distinguish "weekend warrior" from "inconsistent"

**Future V2:**
- Detect patterns (e.g., "every Saturday")
- Give credit for predictable rhythms

---

## Design Principles Summary

1. **Simple > Complex**: 4 components, clear math
2. **Transparent > Black Box**: Every point explained
3. **Behavioral > Medical**: Measure actions, not health
4. **Encouraging > Punishing**: Focus on positives
5. **Personal > Comparative**: Your journey, not vs. others

These principles guided every formula decision.

---

## Discussion Questions for Video

When explaining this in a Loom:

1. **Why these specific weights (60/25/10/5)?**
   - Started with frequency as foundation
   - Added bonuses that don't dominate
   - Tested with hypothetical users

2. **What would you change with more data?**
   - Tune weights based on retention correlation
   - Add intensity if we have heart rate data
   - Personalize to user goals

3. **How do you prevent gaming?**
   - Multi-session days count once
   - Streak must be current (not historical)
   - Distribution bonus prevents clustering

4. **Is this score defensible?**
   - Yes: every point traceable
   - Yes: works across user levels
   - Yes: aligns with "consistency" definition
