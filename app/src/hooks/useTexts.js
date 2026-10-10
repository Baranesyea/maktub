// Texts: short writings that do not belong to a book. A flat list, no hierarchy.
// Kept in memory between screens, like books, and saved through the outbox.
import { useCallback, useEffect, useState } from 'react'
import { db } from '@/api/db'
import { queueUpdate, pendingFor, flush } from '@/lib/outbox'

let cache = null
const listeners = new Set()
const set = (next) => { cache = next; listeners.forEach((fn) => fn(next)) }
const overlay = (rows) => { const p = pendingFor('LooseText'); return rows.map((r) => (p[r.id] ? { ...r, ...p[r.id] } : r)) }

async function load() {
  await flush()
  const rows = await db.LooseText.list('-created_date', 1000)
  set(overlay(rows))
}

export function useTexts() {
  const [texts, setTexts] = useState(cache)
  const [error, setError] = useState(null)
  useEffect(() => {
    listeners.add(setTexts)
    load().catch((e) => { if (!cache) setError(e) })
    return () => listeners.delete(setTexts)
  }, [])
  const create = useCallback(async (rec = {}) => {
    const r = await db.LooseText.create({ title: '', description: '', content: '', word_count: 0, deleted: false, ...rec })
    set([r, ...(cache || [])])
    return r
  }, [])
  const update = useCallback((id, patch, opts) => {
    set((cache || []).map((r) => (r.id === id ? { ...r, ...patch } : r)))
    queueUpdate('LooseText', id, patch, opts)
  }, [])
  return { texts: (texts || []).filter((t) => !t.deleted), loading: texts === null && !error, error, create, update }
}

/** Create a text from outside the texts screen (moving a chapter or scene out of a book). */
export async function addText(rec) {
  const r = await db.LooseText.create({ title: '', description: '', content: '', word_count: 0, deleted: false, ...rec })
  if (cache) set([r, ...cache])
  return r
}
