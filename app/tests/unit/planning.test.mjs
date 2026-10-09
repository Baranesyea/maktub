import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computePlan, chapterDueDates, computeStreak, dateKey } from '../../src/lib/planning.js'

const today = new Date(2026, 9, 11) // Sunday 11 Oct 2026
const plan = { deadline: '2026-11-09', target_words: 30000, weekly_minutes: [60, 60, 60, 60, 60, 120, 0], days_off: [] }

test('feasible plan gives a sensible daily target', () => {
  const r = computePlan(plan, { written: 10000, wph: 800, today })
  assert.equal(r.remaining, 20000)
  assert.ok(r.feasible)
  assert.ok(r.todayTarget > 0 && r.todayTarget < 1500, `target ${r.todayTarget}`)
})
test('infeasible plan offers extra time and a realistic date', () => {
  const r = computePlan(plan, { written: 0, wph: 400, today })
  assert.equal(r.feasible, false)
  assert.ok(r.extraMinutesPerDay > 0)
  assert.ok(r.realisticDate > plan.deadline)
})
test('days off give no target', () => {
  const r = computePlan({ ...plan, days_off: [dateKey(today)] }, { written: 0, wph: 600, today })
  assert.equal(r.todayTarget, 0)
})
test('saturday off by schedule', () => {
  const sat = new Date(2026, 9, 17)
  const r = computePlan(plan, { written: 0, wph: 600, today: sat })
  assert.equal(r.todayTarget, 0)
})
test('locked target is respected', () => {
  const r = computePlan(plan, { written: 0, wph: 600, today, lockedToday: 777 })
  assert.equal(r.todayTarget, 777)
})
test('ramp pace starts lower than steady', () => {
  const steady = computePlan(plan, { written: 0, wph: 2000, today })
  const ramp = computePlan({ ...plan, pace: 'ramp' }, { written: 0, wph: 2000, today })
  assert.ok(ramp.todayTarget < steady.todayTarget)
})
test('chapter due dates are in order and pinned dates stay', () => {
  const chapters = [{ id: 'a', words: 0 }, { id: 'b', words: 0, due_date: '2026-10-20' }, { id: 'c', words: 0 }]
  const r = chapterDueDates(chapters, plan, { wph: 600, today })
  assert.ok(r.a.due <= r.c.due)
  assert.equal(r.b.due, '2026-10-20')
  assert.equal(r.b.pinned, true)
})
test('streak skips planned days off', () => {
  const history = [
    { date: '2026-10-11', words: 300 }, // Sunday (today)
    { date: '2026-10-09', words: 200 }, // Friday
    { date: '2026-10-08', words: 100 }, // Thursday
  ] // Saturday 10th is a day off
  assert.equal(computeStreak(history, plan, { today }), 3)
})
