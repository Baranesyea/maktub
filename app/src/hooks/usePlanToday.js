import { useEffect, useMemo, useState } from 'react'
import { computePlan, DEFAULT_WPH } from '@/lib/planning'
import { useToday, loadHistory, measuredWordsPerHour } from '@/lib/stats'
import { useSettings } from '@/lib/settings'
import { todayKey } from '@/lib/utils'

/**
 * Today's target for a book. The target is locked at the first look of the day and
 * does not shrink while typing; it is recalculated the next day.
 */
export function usePlanToday(bk) {
  const today = useToday()
  const { settings } = useSettings()
  const [history, setHistory] = useState([])
  useEffect(() => { loadHistory(60).then(setHistory) }, [])
  const plan = bk.book?.plan || null
  const measured = measuredWordsPerHour(history)
  const wph = settings.words_per_hour || measured || DEFAULT_WPH
  const written = bk.flatChapters?.reduce((n, c) => n + (c.unused ? 0 : c.words), 0) || 0
  const key = todayKey()
  const locked = plan?.locked?.date === key ? plan.locked.target : null

  const result = useMemo(() => {
    if (!plan?.deadline || !plan?.target_words) return { todayTarget: 0, hasPlan: false, wph, measured, written }
    const r = computePlan(plan, { written, wph, todayDone: today.words || 0, lockedToday: locked })
    return { ...r, hasPlan: true, wph, measured, written }
  }, [plan, written, wph, today.words, locked])

  useEffect(() => {
    if (!bk.book || !plan?.deadline || locked != null || !result.hasPlan) return
    bk.update('book', bk.book.id, { plan: { ...plan, locked: { date: key, target: result.todayTarget } } }, { delay: 500 })
  }, [bk.book?.id, plan?.deadline, locked, result.hasPlan])

  return result
}
