// Google Drive backup: connection (Google Identity Services, drive.file scope) and the sync loop.
// The app only ever sees files it created itself; the rest of the user's Drive stays invisible to it.
import { useEffect, useState } from 'react'
import { db } from '@/api/db'
import { buildTree, chapterLabel } from '@/hooks/useBook'
import { makeApi, syncBook, ROOT_NAME } from '@/lib/driveCore'
import { pendingFor } from '@/lib/outbox'
import { toast } from '@/lib/toast'

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const TOKEN_KEY = 'maktub_drive_token'
const DIRTY_KEY = 'maktub_drive_dirty'
const TICK_MS = 30_000
const IDLE_MS = 5_000

let settingsRef = { get: () => null, update: () => {} }
let token = null
let lastEditAt = 0
let running = false
let timer = null
const statusByBook = {}
const listeners = new Set()
const emit = () => listeners.forEach((fn) => fn({ ...statusByBook }))

function loadToken() {
  try { const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null'); if (t && t.exp > Date.now() + 60_000) return t } catch { /* ignore */ }
  return null
}
token = typeof sessionStorage !== 'undefined' ? loadToken() : null

const dirty = () => { try { return JSON.parse(localStorage.getItem(DIRTY_KEY) || '{}') } catch { return {} } }
const setDirty = (d) => localStorage.setItem(DIRTY_KEY, JSON.stringify(d))

/** Called on every edit. The next tick (≤30s, after 5s of quiet) syncs the book. */
export function markBookDirty(bookId) {
  lastEditAt = Date.now()
  const d = dirty(); d[bookId] = Date.now(); setDirty(d)
}

export function bindDriveSettings(get, update) { settingsRef = { get, update } }

const driveSettings = () => settingsRef.get()?.drive || null
export const clientId = () => driveSettings()?.client_id || import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
export const isConnected = () => !!driveSettings()?.connected

function setStatus(bookId, s) { statusByBook[bookId] = { ...(statusByBook[bookId] || {}), ...s }; emit() }

export function useDriveState(bookId) {
  const [all, setAll] = useState({ ...statusByBook })
  useEffect(() => { listeners.add(setAll); return () => listeners.delete(setAll) }, [])
  if (!isConnected()) return { status: 'off' }
  if (!token) return { status: 'attention', reason: 'reconnect' }
  return all[bookId] || { status: 'synced' }
}

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = resolve
    s.onerror = () => reject(new Error('לא הצלחנו לטעון את ההתחברות של גוגל'))
    document.head.appendChild(s)
  })
}

/** Ask Google for access. Must be called from a click. */
export async function connectDrive({ prompt = 'consent' } = {}) {
  const cid = clientId()
  if (!cid) throw new Error('חסר מזהה לקוח של גוגל. ראו הוראות בהגדרות.')
  await loadGis()
  const resp = await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: cid,
      scope: SCOPE,
      prompt,
      callback: (r) => (r.error ? reject(new Error(r.error_description || r.error)) : resolve(r)),
      error_callback: (e) => reject(new Error(e?.message || 'החיבור בוטל')),
    })
    client.requestAccessToken()
  })
  token = { value: resp.access_token, exp: Date.now() + (resp.expires_in || 3600) * 1000 }
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token))
  const cur = driveSettings() || {}
  settingsRef.update({ drive: { ...cur, client_id: cid, connected: true, connected_at: cur.connected_at || new Date().toISOString() } })
  emit()
  startDriveLoop()
  setTimeout(() => tick(true), 500)
  return true
}

export function disconnectDrive() {
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token.value, () => {})
  token = null
  sessionStorage.removeItem(TOKEN_KEY)
  const cur = driveSettings() || {}
  settingsRef.update({ drive: { ...cur, connected: false } })
  emit()
}

async function request(method, url, body, headers = {}) {
  if (!token || token.exp < Date.now()) { token = null; emit(); throw Object.assign(new Error('reconnect'), { reconnect: true }) }
  for (let attempt = 0; attempt < 6; attempt++) {
    const isJson = body && !(body instanceof Blob)
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token.value}`, ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: isJson ? JSON.stringify(body) : body,
    })
    if (res.status === 401) { token = null; sessionStorage.removeItem(TOKEN_KEY); emit(); throw Object.assign(new Error('reconnect'), { reconnect: true }) }
    if (res.status === 429 || (res.status === 403 && /rate|quota/i.test(await res.clone().text()))) {
      const wait = Math.min(64000, 1000 * 2 ** attempt) + Math.random() * 500
      await new Promise((r) => setTimeout(r, wait))
      continue
    }
    if (!res.ok) throw new Error(`Drive ${res.status}`)
    return res.status === 204 ? {} : res.json()
  }
  throw new Error('Drive busy')
}
const api = makeApi(request)

async function loadBookForSync(bookId) {
  const q = { book_id: bookId }
  const [book, parts, chapters, scenes] = await Promise.all([db.Book.get(bookId), db.Part.filter(q), db.Chapter.filter(q), db.Scene.filter(q)])
  const pend = pendingFor('Scene')
  const sc = scenes.map((s) => (pend[s.id] ? { ...s, ...pend[s.id] } : s))
  const tree = buildTree({ parts, chapters, scenes: sc, usesParts: !!book.use_parts })
  const groups = tree.map((g) => ({ part: g.part, chapters: g.chapters.map((c) => ({ ...c, label: chapterLabel(c) })) }))
  const bkLike = { book, flatChapters: tree.flatMap((g) => g.chapters) }
  return { book, groups, bkLike }
}

async function ensureRoot() {
  const cur = driveSettings() || {}
  if (cur.root_folder_id) {
    const f = await api.get(cur.root_folder_id).catch(() => null)
    if (f && !f.trashed) return cur.root_folder_id
  }
  const r = await api.createFolder(ROOT_NAME)
  settingsRef.update({ drive: { ...(driveSettings() || {}), root_folder_id: r.id } })
  return r.id
}

export async function syncNow(bookId) {
  if (!isConnected() || !token) return
  setStatus(bookId, { status: navigator.onLine === false ? 'pending' : 'syncing' })
  if (navigator.onLine === false) return
  try {
    const root = await ensureRoot()
    const { book, groups, bkLike } = await loadBookForSync(bookId)
    const all = driveSettings()?.books || {}
    const { state, changed } = await syncBook({
      book, groups, state: structuredClone(all[bookId] || {}), root, api,
      makeSnapshot: async () => (await import('@/lib/exporter')).buildDocx(bkLike, { format: 'book' }),
      onConflict: (name) => toast(`פרק נערך ישירות בגוגל דוקס. העותק נשמר בשם: ${name}`, { ms: 9000 }),
      onProgress: (count) => setStatus(bookId, { status: 'syncing', count }),
    })
    settingsRef.update({ drive: { ...(driveSettings() || {}), books: { ...((driveSettings() || {}).books || {}), [bookId]: state } } })
    const d = dirty(); delete d[bookId]; setDirty(d)
    setStatus(bookId, { status: 'synced', at: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }), count: 0, changed, error: null })
  } catch (e) {
    setStatus(bookId, e.reconnect ? { status: 'attention', reason: 'reconnect' } : { status: 'attention', error: e.message })
  }
}

async function tick(force = false) {
  if (running || !isConnected() || !token) return
  const d = dirty()
  const ids = Object.keys(d)
  if (!ids.length) return
  if (!force && Date.now() - lastEditAt < IDLE_MS) return
  running = true
  try { for (const id of ids) await syncNow(id) } finally { running = false }
}

export function startDriveLoop() {
  if (timer) return
  timer = setInterval(() => tick(), TICK_MS)
  window.addEventListener('online', () => tick(true))
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') tick(true) })
}
