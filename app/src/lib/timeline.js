// Story time: when each scene happened, separate from where it sits in the book.
// Types: exact, range (fuzzy, e.g. "summer 2015"), relative (N days after another scene), era, unknown.

const DAY = 864e5

/** Parse "2015", "2015-07", "2015-07-14" into [start, end] dates covering that precision. */
export function parsePartialDate(s) {
  if (!s) return null
  const m = String(s).trim().match(/^(\d{1,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/)
  if (!m) return null
  const y = +m[1], mo = m[2] ? +m[2] - 1 : null, d = m[3] ? +m[3] : null
  if (d != null) { const a = new Date(y, mo, d); return [a, a, 'day'] }
  if (mo != null) return [new Date(y, mo, 1), new Date(y, mo + 1, 0), 'month']
  return [new Date(y, 0, 1), new Date(y, 11, 31), 'year']
}

const SEASONS = { 'חורף': [11, 2], 'אביב': [2, 5], 'קיץ': [5, 8], 'סתיו': [8, 11] }

/**
 * Understand free text like "קיץ 2015", "תחילת שנות התשעים", "בערך 2012", "1998".
 * Returns { start, end } as YYYY-MM-DD strings, or null.
 */
export function parseFuzzy(text = '') {
  const t = text.trim()
  const z = (n) => String(n).padStart(2, '0')
  const fmt = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
  const year = t.match(/(\d{4})/)
  for (const [name, [a, b]] of Object.entries(SEASONS)) {
    if (t.includes(name) && year) {
      const y = +year[1]
      const start = name === 'חורף' ? new Date(y - 1, 11, 1) : new Date(y, a, 1)
      const end = name === 'חורף' ? new Date(y, 2, 0) : new Date(y, b, 0)
      return { start: fmt(start), end: fmt(end) }
    }
  }
  const decades = { 'השישים': 1960, 'השבעים': 1970, 'השמונים': 1980, 'התשעים': 1990, 'האלפיים': 2000 }
  for (const [w, base] of Object.entries(decades)) {
    if (t.includes(`שנות ${w}`) || t.includes(`שנות ה${w.slice(1)}`)) {
      let a = base, b = base + 9
      if (t.includes('תחילת')) b = base + 3
      if (t.includes('אמצע')) { a = base + 3; b = base + 6 }
      if (t.includes('סוף')) a = base + 6
      return { start: `${a}-01-01`, end: `${b}-12-31` }
    }
  }
  if (year) {
    const y = +year[1]
    if (t.includes('בערך') || t.includes('?')) return { start: `${y - 1}-01-01`, end: `${y + 1}-12-31` }
    const p = parsePartialDate(t.match(/\d{4}(-\d{1,2}(-\d{1,2})?)?/)[0])
    if (p) return { start: fmt(p[0]), end: fmt(p[1]) }
  }
  return null
}

/** Resolve a scene's story time to concrete dates. Follows relative chains (with loop protection). */
export function resolveTime(scene, ctx, seen = new Set()) {
  const st = scene?.story_time
  if (!st || !st.type || st.type === 'unknown') return null
  if (st.type === 'exact') {
    const p = parsePartialDate(st.start)
    return p ? { start: p[0], end: p[1], precision: p[2] } : null
  }
  if (st.type === 'range') {
    const a = parsePartialDate(st.start), b = parsePartialDate(st.end || st.start)
    return a ? { start: a[0], end: (b || a)[1], precision: 'range', label: st.label } : null
  }
  if (st.type === 'era') {
    const era = ctx.eras.find((e) => e.id === st.era_id)
    if (!era) return null
    const a = parsePartialDate(era.start), b = parsePartialDate(era.end || era.start)
    return a ? { start: a[0], end: (b || a)[1], precision: 'era', label: era.name } : null
  }
  if (st.type === 'relative') {
    if (seen.has(scene.id)) return { error: 'loop' }
    seen.add(scene.id)
    const anchor = ctx.scenes.find((s) => s.id === st.anchor_scene_id)
    const base = anchor && resolveTime(anchor, ctx, seen)
    if (!base || base.error) return base?.error ? base : null
    const off = (st.offset_days || 0) * DAY
    return { start: new Date(base.start.getTime() + off), end: new Date(base.end.getTime() + off), precision: base.precision, relative: true }
  }
  return null
}

export const midpoint = (r) => (r ? (r.start.getTime() + r.end.getTime()) / 2 : null)

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

export function formatTime(scene, ctx) {
  const st = scene?.story_time
  if (!st || !st.type || st.type === 'unknown') return 'לא ידוע'
  if (st.label) return st.label
  const r = resolveTime(scene, ctx)
  if (!r) return 'לא ידוע'
  if (r.error) return 'שגיאה: תלות מעגלית'
  if (st.type === 'relative') {
    const d = st.offset_days || 0
    const anchor = ctx.scenes.find((s) => s.id === st.anchor_scene_id)
    return `${describeSpan(Math.abs(d))} ${d >= 0 ? 'אחרי' : 'לפני'} "${anchor?.title || 'סצנה'}"`
  }
  if (r.precision === 'day') return `${r.start.getDate()} ב${MONTHS[r.start.getMonth()]} ${r.start.getFullYear()}`
  if (r.precision === 'month') return `${MONTHS[r.start.getMonth()]} ${r.start.getFullYear()}`
  if (r.precision === 'year') return String(r.start.getFullYear())
  return `${r.start.getFullYear()}–${r.end.getFullYear()}`
}

export function describeSpan(days) {
  if (days < 1) return 'באותו יום'
  if (days < 14) return days === 1 ? 'יום' : `${days} ימים`
  if (days < 60) return `${Math.round(days / 7)} שבועות`
  if (days < 365) return `${Math.round(days / 30)} חודשים`
  const y = Math.round(days / 365)
  return y === 1 ? 'שנה' : y === 2 ? 'שנתיים' : `${y} שנים`
}

/** Compare each scene with the previous dated scene in reading order. */
export function jumps(scenesInOrder, ctx) {
  const out = {}
  let prev = null
  for (const s of scenesInOrder) {
    const r = resolveTime(s, ctx)
    if (!r || r.error) continue
    if (prev) {
      const diff = (midpoint(r) - midpoint(prev)) / DAY
      if (diff < -20) out[s.id] = { dir: 'back', days: -diff, label: `↶ ${describeSpan(Math.round(-diff))} אחורה` }
      else if (diff > 365 * 2) out[s.id] = { dir: 'forward', days: diff, label: `↷ קפיצה של ${describeSpan(Math.round(diff))} קדימה` }
    }
    prev = r
  }
  return out
}

/** Problems worth flagging: relative loops, characters before birth / after death. */
export function timelineChecks(scenesInOrder, ctx) {
  const issues = []
  let undated = 0
  for (const s of scenesInOrder) {
    const r = resolveTime(s, ctx)
    if (!r) { undated++; continue }
    if (r.error) { issues.push({ sceneId: s.id, text: 'תאריך יחסי שתלוי בעצמו' }); continue }
    for (const cid of s.character_ids || []) {
      const c = ctx.characters.find((x) => x.id === cid)
      const birth = c && parsePartialDate(c.birth_date)
      const death = c && parsePartialDate(c.death_date)
      if (birth && r.end < birth[0]) issues.push({ sceneId: s.id, text: `${c.name} מופיע/ה לפני שנולד/ה` })
      if (death && r.start > death[1]) issues.push({ sceneId: s.id, text: `${c.name} מופיע/ה אחרי מותו/ה` })
    }
  }
  return { issues, undated }
}

/** Age range of a character during a scene, e.g. "16–17". */
export function ageAt(character, sceneRange) {
  const birth = parsePartialDate(character?.birth_date)
  if (!birth || !sceneRange) return null
  const yrs = (a, b) => Math.floor((a - b) / (365.25 * DAY))
  const lo = Math.max(0, yrs(sceneRange.start, birth[1]))
  const hi = Math.max(0, yrs(sceneRange.end, birth[0]))
  return lo === hi ? String(lo) : `${lo}–${hi}`
}
