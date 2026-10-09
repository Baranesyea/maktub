// Writing statistics: words typed today and active writing time.
// Only typed text counts. Pastes, imports and big jumps (over 50 words at once) change the
// word count of the book but not the daily progress or the streak.
import { useEffect, useState } from 'react'
import { db } from '@/api/db'
import { queueUpdate } from '@/lib/outbox'
import { todayKey } from '@/lib/utils'

const MAX_TYPED_CHUNK = 50
const IDLE_GAP_MS = 60_000
const listeners = new Set()
let today = null
let creating = null
let lastKeyAt = 0
let pendingWords = 0
let pendingSeconds = 0

function notify() { listeners.forEach((fn) => fn(today)) }

async function ensureToday() {
  const date = todayKey()
  if (today && today.date === date) return today
  if (creating) return creating
  creating = (async () => {
    try {
      const rows = await db.WritingDay.filter({ date })
      today = rows[0] || await db.WritingDay.create({ date, words: 0, seconds: 0, sessions: [] })
    } catch {
      today = { id: null, date, words: 0, seconds: 0 }
    }
    if (pendingWords || pendingSeconds) {
      today.words = (today.words || 0) + pendingWords
      today.seconds = (today.seconds || 0) + pendingSeconds
      pendingWords = 0; pendingSeconds = 0
      persist()
    }
    creating = null
    notify()
    return today
  })()
  return creating
}

function persist() {
  if (today?.id) queueUpdate('WritingDay', today.id, { words: today.words, seconds: today.seconds }, { delay: 2000 })
}

/** Called by the editor after each change, with the word delta and whether it was a paste. */
export function recordTyping(delta, { pasted = false } = {}) {
  const now = Date.now()
  let secs = 0
  if (lastKeyAt && now - lastKeyAt < IDLE_GAP_MS) secs = (now - lastKeyAt) / 1000
  lastKeyAt = now
  const counted = !pasted && delta > 0 && delta <= MAX_TYPED_CHUNK ? delta : 0
  if (!today || today.date !== todayKey()) {
    pendingWords += counted; pendingSeconds += secs
    ensureToday()
    return
  }
  today = { ...today, words: (today.words || 0) + counted, seconds: (today.seconds || 0) + secs }
  persist()
  notify()
  sprintListeners.forEach((fn) => fn(counted))
}

export function useToday() {
  const [t, setT] = useState(today)
  useEffect(() => {
    listeners.add(setT)
    ensureToday().then(setT)
    return () => listeners.delete(setT)
  }, [])
  return t || { words: 0, seconds: 0, date: todayKey() }
}

export async function loadHistory(days = 120) {
  try {
    const rows = await db.WritingDay.list('-date', days)
    return rows
  } catch { return [] }
}

/** Measured words per hour from recent days, if there is enough data (at least one hour). */
export function measuredWordsPerHour(history) {
  const recent = history.slice(0, 14)
  const words = recent.reduce((n, d) => n + (d.words || 0), 0)
  const secs = recent.reduce((n, d) => n + (d.seconds || 0), 0)
  if (secs < 3600) return null
  return Math.round(words / (secs / 3600))
}

// Sprint support: listeners receive counted words as they are typed.
const sprintListeners = new Set()
export function onTypedWords(fn) { sprintListeners.add(fn); return () => sprintListeners.delete(fn) }
