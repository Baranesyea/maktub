// The outbox makes sure no word is ever lost.
// Every change is written to localStorage first, then sent to the server.
// If the network is down, changes wait here and are sent when it returns.
import { db } from '@/api/db'

const KEY = 'maktub_outbox_v1'
const listeners = new Set()
let state = { status: 'saved', pending: 0, lastSavedAt: null, error: null }
let flushing = false
let timer = null

function readBox() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}
function writeBox(box) {
  try { localStorage.setItem(KEY, JSON.stringify(box)) } catch (e) { setState({ status: 'error', error: e }) }
}
function setState(patch) {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn(state))
}

export function subscribeSave(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn) }
export function getSaveState() { return state }

/** Queue a partial update for a record. Later patches to the same record merge into one. */
export function queueUpdate(entity, id, patch, { delay = 900 } = {}) {
  const box = readBox()
  const k = `${entity}:${id}`
  const prev = box[k]
  box[k] = { entity, id, patch: { ...(prev?.patch || {}), ...patch }, ts: Date.now() }
  writeBox(box)
  setState({ status: navigator.onLine === false ? 'offline' : 'saving', pending: Object.keys(box).length })
  clearTimeout(timer)
  timer = setTimeout(flush, delay)
}

/** Pending local patches, used to overlay unsent edits on data loaded from the server. */
export function pendingFor(entity) {
  const box = readBox()
  const out = {}
  for (const v of Object.values(box)) if (v.entity === entity) out[v.id] = v.patch
  return out
}

export function hasPending() { return Object.keys(readBox()).length > 0 }

export async function flush() {
  if (flushing) return
  const box = readBox()
  const entries = Object.entries(box)
  if (!entries.length) { setState({ status: 'saved', pending: 0 }); return }
  if (navigator.onLine === false) { setState({ status: 'offline', pending: entries.length }); return }
  flushing = true
  setState({ status: 'saving', pending: entries.length })
  let failed = false
  for (const [k, item] of entries) {
    try {
      await db[item.entity].update(item.id, item.patch)
      const now = readBox()
      // Only remove if nothing newer was queued while we were sending.
      if (now[k] && now[k].ts === item.ts) { delete now[k]; writeBox(now) }
    } catch (e) {
      if (e?.offline) { failed = true; break }
      // A record that no longer exists cannot be saved; drop it so the queue does not jam.
      if (String(e?.message || '').match(/not found|404/i)) { const now = readBox(); delete now[k]; writeBox(now); continue }
      failed = true
      setState({ error: e })
      break
    }
  }
  flushing = false
  const left = Object.keys(readBox()).length
  if (failed) {
    setState({ status: navigator.onLine === false ? 'offline' : 'error', pending: left })
    clearTimeout(timer)
    timer = setTimeout(flush, 5000)
  } else if (left) {
    clearTimeout(timer)
    timer = setTimeout(flush, 300)
  } else {
    setState({ status: 'saved', pending: 0, lastSavedAt: new Date(), error: null })
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flush())
  window.addEventListener('offline', () => { if (hasPending()) setState({ status: 'offline' }) })
  window.addEventListener('beforeunload', (e) => {
    if (hasPending()) { flush(); e.preventDefault(); e.returnValue = '' }
  })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
  setTimeout(flush, 1500)
}
