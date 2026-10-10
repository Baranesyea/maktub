// A copy of the writing kept on this device, independent of the server.
// While you write, each scene's text is copied here at most once a minute, and kept for 7 days.
// It survives a closed tab, a crash or a server outage, and can be restored from the versions window.
const DB_NAME = 'maktub-journal'
const STORE = 'copies'
const EVERY_MS = 60 * 1000
const KEEP_MS = 7 * 864e5
const lastCopy = new Map()
let dbPromise = null

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('no indexedDB'))
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE, { keyPath: 'key', autoIncrement: true })
        s.createIndex('scene', 'scene_id')
        s.createIndex('at', 'at')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

const tx = async (mode, fn) => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const out = fn(t.objectStore(STORE))
    t.oncomplete = () => resolve(out?.result ?? out)
    t.onerror = () => reject(t.error)
  })
}

/** Keep a copy of a scene. Throttled to once a minute per scene unless forced. */
export async function keepCopy({ sceneId, bookId, html, words }, { force = false } = {}) {
  const now = Date.now()
  if (!force && now - (lastCopy.get(sceneId) || 0) < EVERY_MS) return false
  lastCopy.set(sceneId, now)
  try {
    await tx('readwrite', (s) => s.add({ scene_id: sceneId, book_id: bookId, html, words, at: now }))
    return true
  } catch { return false }
}

/** Copies of one scene, newest first. */
export async function copiesOf(sceneId) {
  try {
    const rows = await tx('readonly', (s) => s.index('scene').getAll(sceneId))
    return (rows || []).sort((a, b) => b.at - a.at)
  } catch { return [] }
}

/** Remove copies older than a week. */
export async function pruneCopies() {
  try {
    const cutoff = Date.now() - KEEP_MS
    await tx('readwrite', (s) => {
      const req = s.index('at').openCursor(IDBKeyRange.upperBound(cutoff))
      req.onsuccess = () => { const c = req.result; if (c) { c.delete(); c.continue() } }
    })
  } catch { /* ignore */ }
}

/** How many copies are kept on this device, and the newest time. */
export async function journalStats() {
  try {
    const rows = await tx('readonly', (s) => s.getAll())
    return { count: rows.length, newest: rows.reduce((m, r) => Math.max(m, r.at), 0) || null }
  } catch { return { count: 0, newest: null } }
}
