// The Google Drive mirror, without any browser or UI dependencies (so it can be tested).
// Layout in the user's Drive:
//   מכתוב / <book> / 00 — תוכן העניינים
//                  / 01 — פרק 1: ... (Google Doc per chapter)
//                  / 01 — חלק ראשון / ...   (when the book uses parts)
//                  / גרסאות / <date> — <book>.docx (daily)
// The mirror is one-way: Maktub → Drive. If a chapter was edited in Google Docs, the edited
// copy is kept under a new name before it is overwritten, and the app is told.
import { hashString, wordsInHtml } from './text.js'

const FOLDER = 'application/vnd.google-apps.folder'
const GDOC = 'application/vnd.google-apps.document'
export const ROOT_NAME = 'מכתוב'
export const SNAP_FOLDER = 'גרסאות'
export const MANIFEST_NAME = '00 — תוכן העניינים'
const KEEP_SNAPSHOTS = 14

const pad = (n) => String(n).padStart(2, '0')
const safe = (s) => String(s || '').replace(/[\\/]/g, '-').trim()

/** The Drive API wrapper used by the sync. `request(method, url, body, headers)` returns JSON. */
export function makeApi(request) {
  const API = 'https://www.googleapis.com/drive/v3/files'
  const UP = 'https://www.googleapis.com/upload/drive/v3/files'
  const multipart = (meta, content, contentType) => {
    const boundary = 'maktub' + Math.random().toString(36).slice(2)
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`, content, `\r\n--${boundary}--`,
    ])
    return { body, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` } }
  }
  return {
    createFolder: (name, parent) => request('POST', `${API}?fields=id`, { name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) }),
    get: (id, fields = 'id,name,modifiedTime,trashed,parents') => request('GET', `${API}/${id}?fields=${fields}`),
    rename: (id, name, addParent, removeParent) => request('PATCH', `${API}/${id}?fields=id,modifiedTime${addParent ? `&addParents=${addParent}&removeParents=${removeParent}` : ''}`, { name }),
    trash: (id) => request('PATCH', `${API}/${id}?fields=id`, { trashed: true }),
    copy: (id, name) => request('POST', `${API}/${id}/copy?fields=id`, { name }),
    list: (parent) => request('GET', `${API}?q=${encodeURIComponent(`'${parent}' in parents and trashed=false`)}&fields=files(id,name,createdTime)&orderBy=createdTime&pageSize=200`),
    createDoc: (name, parent, html) => { const m = multipart({ name, mimeType: GDOC, parents: [parent] }, html, 'text/html; charset=UTF-8'); return request('POST', `${UP}?uploadType=multipart&fields=id,modifiedTime`, m.body, m.headers) },
    updateDoc: (id, name, html) => { const m = multipart({ name }, html, 'text/html; charset=UTF-8'); return request('PATCH', `${UP}/${id}?uploadType=multipart&fields=id,modifiedTime`, m.body, m.headers) },
    uploadFile: (name, parent, blob, mime) => { const m = multipart({ name, parents: [parent] }, blob, mime); return request('POST', `${UP}?uploadType=multipart&fields=id`, m.body, m.headers) },
  }
}

/** Google Docs defaults every paragraph to left-to-right, so each block gets dir="rtl" explicitly. */
export function rtlHtml(title, bodyHtml) {
  const withDir = String(bodyHtml || '')
    .replace(/<span class="note-anchor"[^>]*>/g, '<span>')
    .replace(/<(p|h1|h2|h3|li|blockquote)(\s|>)/g, '<$1 dir="rtl" style="text-align:right"$2')
    .replace(/<hr[^>]*>/g, '<p dir="rtl" style="text-align:center">* * *</p>')
  return `<html dir="rtl"><head><meta charset="utf-8"></head><body dir="rtl"><h1 dir="rtl" style="text-align:center">${title}</h1>${withDir}</body></html>`
}

export function chapterHtml(ch, label) {
  const scenes = ch.scenes.filter((s) => !s.unused)
  const body = scenes.map((s, i) => `${i > 0 ? '<hr>' : ''}${s.content || ''}`).join('')
  return rtlHtml(label, body)
}

export function chapterHash(ch, label, partId) {
  return hashString([label, partId || '', ...ch.scenes.filter((s) => !s.unused).map((s) => s.id + ':' + (s.content || ''))].join('|'))
}

/**
 * Bring one book's Drive mirror up to date.
 * @param book { id, title }
 * @param groups [{ part, chapters: [{ id, label, scenes, unused }] }] in book order
 * @param state persisted per-book sync state (mutated and returned)
 * @param root the root "מכתוב" folder id
 * @param api from makeApi
 * @param opts { now, makeSnapshot: async () => Blob|null, onConflict(name) }
 */
export async function syncBook({ book, groups, state, root, api, now = new Date(), makeSnapshot, onConflict = () => {}, onProgress = () => {} }) {
  const st = state || {}
  st.chapters = st.chapters || {}
  st.parts = st.parts || {}
  st.conflicts = st.conflicts || []
  const bookName = safe(book.title) || 'ספר'
  let changed = 0

  // Book folder (recreated if the user deleted it in Drive).
  if (st.folderId) {
    const f = await api.get(st.folderId).catch(() => null)
    if (!f || f.trashed) { st.folderId = null; st.chapters = {}; st.parts = {}; st.manifestId = null; st.snapFolderId = null }
    else if (f.name !== bookName) await api.rename(st.folderId, bookName)
  }
  if (!st.folderId) st.folderId = (await api.createFolder(bookName, root)).id

  const usesParts = groups.some((g) => g.part)
  const live = new Set()
  const todo = []
  let n = 0
  for (const [gi, g] of groups.entries()) {
    let parent = st.folderId
    if (g.part) {
      const pname = `${pad(gi + 1)} — ${safe(g.part.title) || 'חלק'}`
      let p = st.parts[g.part.id]
      if (!p) { p = { id: (await api.createFolder(pname, st.folderId)).id, name: pname }; st.parts[g.part.id] = p }
      else if (p.name !== pname) { await api.rename(p.id, pname); p.name = pname }
      parent = p.id
    }
    for (const ch of g.chapters) {
      if (ch.unused) continue
      n += 1
      live.add(ch.id)
      const name = `${pad(n)} — ${safe(ch.label)}`
      const hash = chapterHash(ch, ch.label, g.part?.id)
      const prev = st.chapters[ch.id]
      if (!prev || prev.hash !== hash || prev.name !== name || prev.parent !== parent) todo.push({ ch, name, hash, parent, prev })
    }
  }
  onProgress(todo.length)

  for (const t of todo) {
    const html = chapterHtml(t.ch, t.ch.label)
    if (!t.prev) {
      const r = await api.createDoc(t.name, t.parent, html)
      st.chapters[t.ch.id] = { fileId: r.id, hash: t.hash, name: t.name, parent: t.parent, modifiedTime: r.modifiedTime }
    } else {
      // Was it edited directly in Google Docs since our last write? Keep that version.
      const remote = await api.get(t.prev.fileId).catch(() => null)
      if (!remote || remote.trashed) {
        const r = await api.createDoc(t.name, t.parent, html)
        st.chapters[t.ch.id] = { fileId: r.id, hash: t.hash, name: t.name, parent: t.parent, modifiedTime: r.modifiedTime }
        changed++
        continue
      }
      if (t.prev.modifiedTime && remote.modifiedTime && remote.modifiedTime !== t.prev.modifiedTime) {
        const keepName = `${t.prev.name} — נערך בגוגל דוקס — ${now.toISOString().slice(0, 10)}`
        await api.copy(t.prev.fileId, keepName)
        st.conflicts.push({ chapterId: t.ch.id, name: keepName, at: now.toISOString() })
        onConflict(keepName)
      }
      if (t.prev.parent !== t.parent) await api.rename(t.prev.fileId, t.name, t.parent, t.prev.parent)
      const r = t.prev.hash !== t.hash || t.prev.name !== t.name ? await api.updateDoc(t.prev.fileId, t.name, html) : await api.get(t.prev.fileId)
      st.chapters[t.ch.id] = { ...t.prev, hash: t.hash, name: t.name, parent: t.parent, modifiedTime: r.modifiedTime }
    }
    changed++
  }

  // Chapters that were deleted or marked unused leave the mirror (moved to Drive's trash).
  for (const [cid, info] of Object.entries(st.chapters)) {
    if (!live.has(cid)) { await api.trash(info.fileId).catch(() => {}); delete st.chapters[cid]; changed++ }
  }
  if (!usesParts) for (const [pid, p] of Object.entries(st.parts)) { await api.trash(p.id).catch(() => {}); delete st.parts[pid] }

  // Table of contents: only rebuilt when something changed.
  const words = groups.flatMap((g) => g.chapters).filter((c) => !c.unused).reduce((s, c) => s + c.scenes.filter((x) => !x.unused).reduce((a, x) => a + wordsInHtml(x.content), 0), 0)
  if (changed || !st.manifestId || st.manifestWords !== words) {
    const rows = groups.flatMap((g) => [
      ...(g.part ? [`<h2 dir="rtl" style="text-align:right">${g.part.title || 'חלק'}</h2>`] : []),
      ...g.chapters.filter((c) => !c.unused).map((c) => {
        const f = st.chapters[c.id]
        const w = c.scenes.filter((x) => !x.unused).reduce((a, x) => a + wordsInHtml(x.content), 0)
        return `<p dir="rtl" style="text-align:right"><a href="https://docs.google.com/document/d/${f?.fileId}/edit">${c.label}</a> · ${w.toLocaleString('he-IL')} מילים</p>`
      }),
    ]).join('')
    const html = `<html dir="rtl"><body dir="rtl"><h1 dir="rtl" style="text-align:center">${book.title || ''}</h1>
<p dir="rtl" style="text-align:right"><b>זו מראה של מכתוב. שינויים כאן יידרסו בסנכרון הבא.</b></p>
<p dir="rtl" style="text-align:right">סנכרון אחרון: ${now.toLocaleString('he-IL')} · ${words.toLocaleString('he-IL')} מילים</p>${rows}</body></html>`
    if (st.manifestId) {
      const ok = await api.updateDoc(st.manifestId, MANIFEST_NAME, html).catch(() => null)
      if (!ok) st.manifestId = (await api.createDoc(MANIFEST_NAME, st.folderId, html)).id
    } else st.manifestId = (await api.createDoc(MANIFEST_NAME, st.folderId, html)).id
    st.manifestWords = words
  }

  // Daily full-book snapshot as a Word file; keep the last two weeks.
  const day = now.toISOString().slice(0, 10)
  if (makeSnapshot && st.lastSnapshot !== day) {
    if (!st.snapFolderId) st.snapFolderId = (await api.createFolder(SNAP_FOLDER, st.folderId)).id
    const blob = await makeSnapshot()
    if (blob) {
      await api.uploadFile(`${day} — ${bookName}.docx`, st.snapFolderId, blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      st.lastSnapshot = day
      const listed = await api.list(st.snapFolderId).catch(() => ({ files: [] }))
      const files = listed.files || []
      for (const old of files.slice(0, Math.max(0, files.length - KEEP_SNAPSHOTS))) await api.trash(old.id).catch(() => {})
    }
  }
  st.lastSync = now.toISOString()
  return { state: st, changed: todo.length }
}
