// Planning: turns "finish by date X, I have these hours" into daily targets and chapter due dates.
// Pure functions so they can be unit tested.

export const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
export const DEFAULT_WPH = 500
export const DEFAULT_WEEKLY = [60, 60, 60, 60, 60, 120, 0] // minutes, Sunday..Saturday

const z = (n) => String(n).padStart(2, '0')
export const dateKey = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
export const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

/** Minutes available on a given date, given the weekly schedule and days off. */
export function minutesOn(date, plan) {
  const key = dateKey(date)
  if ((plan.days_off || []).includes(key)) return 0
  const weekly = plan.weekly_minutes || DEFAULT_WEEKLY
  return weekly[date.getDay()] || 0
}

/** All writing days from `from` (inclusive) to the deadline (inclusive). */
export function writingDays(from, plan) {
  if (!plan.deadline) return []
  const end = parseKey(plan.deadline)
  const out = []
  for (let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d <= end; d = addDays(d, 1)) {
    const m = minutesOn(d, plan)
    out.push({ date: dateKey(d), minutes: m })
  }
  return out
}

/** Weights per day for a pace style. "ramp" starts lower and climbs steadily. */
function weightsFor(days, pace) {
  const active = days.filter((d) => d.minutes > 0)
  if (pace !== 'ramp' || active.length < 3) return days.map((d) => d.minutes)
  let k = 0
  return days.map((d) => {
    if (!d.minutes) return 0
    const factor = 0.6 + (0.8 * k) / (active.length - 1) // 0.6 → 1.4
    k++
    return d.minutes * factor
  })
}

/**
 * The full picture for the plan.
 * @param plan { deadline, target_words, weekly_minutes, days_off, pace }
 * @param written current words in the book
 * @param wph words per hour
 * @param todayDone words typed today (so the remaining target excludes them)
 */
export function computePlan(plan, { written = 0, wph = DEFAULT_WPH, today = new Date(), todayDone = 0, lockedToday = null } = {}) {
  const target = plan.target_words || 0
  const remaining = Math.max(0, target - written)
  const days = writingDays(today, plan)
  const totalMinutes = days.reduce((n, d) => n + d.minutes, 0)
  const capacity = Math.round((totalMinutes / 60) * wph)
  const feasible = !plan.deadline || remaining <= capacity

  // Words still needed at the start of today = remaining + what was already typed today.
  const startOfDayRemaining = remaining + todayDone
  const weights = weightsFor(days, plan.pace)
  const wsum = weights.reduce((a, b) => a + b, 0)
  const todayWeight = days[0]?.date === dateKey(today) ? weights[0] : 0
  let todayTarget = wsum > 0 ? Math.ceil((startOfDayRemaining * todayWeight) / wsum) : 0
  if (lockedToday != null) todayTarget = lockedToday
  const todayMinutes = days[0]?.date === dateKey(today) ? days[0].minutes : 0
  const todayCapacity = Math.round((todayMinutes / 60) * wph)
  const unrealistic = todayCapacity > 0 && todayTarget > todayCapacity * 1.5

  // Options when the plan does not fit.
  let extraMinutesPerDay = 0
  let realisticDate = null
  if (!feasible && plan.deadline) {
    const activeDays = days.filter((d) => d.minutes > 0).length || days.length || 1
    const neededMinutes = (remaining / wph) * 60
    extraMinutesPerDay = Math.ceil((neededMinutes - totalMinutes) / activeDays)
    // Walk forward with the same weekly schedule until capacity covers the remaining words.
    let acc = 0
    for (let d = new Date(today), i = 0; i < 365 * 5; i++, d = addDays(d, 1)) {
      acc += (minutesOn(d, plan) / 60) * wph
      if (acc >= remaining) { realisticDate = dateKey(d); break }
    }
  }
  const scopeWords = capacity // what fits by the deadline
  return { target, remaining, days, totalMinutes, capacity, feasible, todayTarget, todayMinutes, todayCapacity, unrealistic, extraMinutesPerDay, realisticDate, scopeWords }
}

/**
 * Spread chapters over the calendar. Each chapter gets a due date based on its estimated size
 * and the time available. Chapters with a pinned deadline keep it; the rest flow around them.
 */
export function chapterDueDates(chapters, plan, { wph = DEFAULT_WPH, today = new Date() } = {}) {
  const target = plan.target_words || 0
  const n = chapters.length
  if (!n || !plan.deadline) return {}
  const perChapter = target > 0 ? target / n : 3000
  const days = writingDays(today, plan)
  const result = {}
  let dayIdx = 0
  let wordsLeftToday = ((days[0]?.minutes || 0) / 60) * wph
  for (const ch of chapters) {
    const need = Math.max(0, (ch.estimate || perChapter) - (ch.words || 0))
    let left = need
    while (left > 0 && dayIdx < days.length) {
      const take = Math.min(left, wordsLeftToday)
      left -= take
      wordsLeftToday -= take
      if (left > 0) { dayIdx++; wordsLeftToday = ((days[dayIdx]?.minutes || 0) / 60) * wph }
    }
    const auto = days[Math.min(dayIdx, days.length - 1)]?.date || plan.deadline
    const pinned = ch.due_date || null
    result[ch.id] = { due: pinned || auto, pinned: !!pinned, late: pinned ? auto > pinned : false, done: need === 0 }
  }
  return result
}

/** Consecutive streak of writing days. Planned days off never break the streak. */
export function computeStreak(history, plan = {}, { today = new Date(), goal = 1 } = {}) {
  const byDate = new Map(history.map((h) => [h.date, h.words || 0]))
  let streak = 0
  let d = new Date(today)
  // Today counts only if already met; otherwise start from yesterday without breaking.
  if ((byDate.get(dateKey(d)) || 0) >= goal) streak++
  d = addDays(d, -1)
  for (let i = 0; i < 3650; i++, d = addDays(d, -1)) {
    const k = dateKey(d)
    const w = byDate.get(k) || 0
    if (w >= goal) { streak++; continue }
    if (minutesOn(d, plan) === 0) continue // a planned day off
    break
  }
  return streak
}
