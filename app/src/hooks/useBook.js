// The book store: loads everything for one book and exposes optimistic mutations.
// Text edits go through the outbox (never lost); structural changes go straight to the server.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '@/api/db'
import { queueUpdate, pendingFor, flush } from '@/lib/outbox'
import { wordsInHtml } from '@/lib/text'

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0)
const TRASH_DAYS = 30

function overlay(rows, entity) {
  const pend = pendingFor(entity)
  return rows.map((r) => (pend[r.id] ? { ...r, ...pend[r.id] } : r))
}

export function buildTree({ parts, chapters, scenes, usesParts }) {
  const liveChapters = chapters.filter((c) => !c.deleted).sort(byOrder)
  const liveScenes = scenes.filter((s) => !s.deleted)
  const scenesOf = (cid) => liveScenes.filter((s) => s.chapter_id === cid).sort(byOrder)
  let num = 0
  const decorate = (c) => {
    const sc = scenesOf(c.id)
    const counted = sc.filter((s) => !s.unused)
    const words = counted.reduce((n, s) => n + (s.word_count || 0), 0)
    const numbered = !c.kind || c.kind === 'chapter'
    if (numbered && !c.unused) num += 1
    return { ...c, number: numbered && !c.unused ? num : null, scenes: sc, words }
  }
  if (usesParts) {
    const liveParts = parts.filter((p) => !p.deleted).sort(byOrder)
    const groups = liveParts.map((p) => ({ part: p, chapters: [] }))
    const loose = { part: null, chapters: [] }
    for (const c of liveChapters) {
      const g = groups.find((x) => x.part.id === c.part_id) || loose
      g.chapters.push(c)
    }
    const all = [...(loose.chapters.length ? [loose] : []), ...groups]
    for (const g of all) g.chapters = g.chapters.map(decorate)
    return all
  }
  return [{ part: null, chapters: liveChapters.map(decorate) }]
}

export function chapterLabel(ch) {
  if (!ch) return ''
  if (ch.kind === 'prologue') return ch.title || 'פרולוג'
  if (ch.kind === 'epilogue') return ch.title || 'אפילוג'
  if (ch.number) return ch.title ? `פרק ${ch.number}: ${ch.title}` : `פרק ${ch.number}`
  return ch.title || 'פרק'
}

const EMPTY = { book: null, parts: [], chapters: [], scenes: [], notes: [], characters: [], eras: [], ideas: [], inspirations: [], research: [] }
// Books already loaded in this visit. Moving between screens shows them at once
// and refreshes from the server quietly, instead of a loading screen every time.
const cache = new Map()

export function useBook(bookId) {
  const [data, setData] = useState(() => cache.get(bookId) || EMPTY)
  const [loading, setLoading] = useState(() => !cache.has(bookId))
  const [error, setError] = useState(null)
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => { if (data.book && data.book.id === bookId) cache.set(bookId, data) }, [data, bookId])

  const load = useCallback(async () => {
    const cached = cache.get(bookId)
    if (cached) { setData(cached); setLoading(false) } else { setData(EMPTY); setLoading(true) }
    setError(null)
    try {
      await flush()
      const q = { book_id: bookId }
      const [book, parts, chapters, scenes, notes, characters, eras, ideas, inspirations, research] = await Promise.all([
        db.Book.get(bookId),
        db.Part.filter(q), db.Chapter.filter(q), db.Scene.filter(q), db.Note.filter(q),
        db.Character.filter(q), db.Era.filter(q), db.Idea.filter(q),
        db.Inspiration.filter(q).catch(() => []), db.ResearchNote.filter(q).catch(() => []),
      ])
      // Purge trash older than 30 days.
      const cutoff = Date.now() - TRASH_DAYS * 864e5
      const old = (r) => r.deleted && r.deleted_at && new Date(r.deleted_at).getTime() < cutoff
      for (const s of scenes.filter(old)) db.Scene.delete(s.id).catch(() => {})
      for (const c of chapters.filter(old)) db.Chapter.delete(c.id).catch(() => {})
      setData({
        book: overlay([book], 'Book')[0],
        parts: overlay(parts, 'Part'),
        chapters: overlay(chapters.filter((c) => !old(c)), 'Chapter'),
        scenes: overlay(scenes.filter((s) => !old(s)), 'Scene'),
        notes: overlay(notes, 'Note'),
        characters: overlay(characters, 'Character'),
        eras: overlay(eras, 'Era'),
        ideas: overlay(ideas, 'Idea'),
        inspirations: overlay(inspirations, 'Inspiration'),
        research: overlay(research, 'ResearchNote'),
      })
    } catch (e) {
      // With a copy on screen, a failed quiet refresh is not an error page.
      if (!cache.has(bookId)) setError(e)
    }
    setLoading(false)
  }, [bookId])

  useEffect(() => { load() }, [load])

  const patchLocal = (key, id, patch) =>
    setData((d) => ({ ...d, [key]: d[key].map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
  const addLocal = (key, recs) => setData((d) => ({ ...d, [key]: [...d[key], ...recs] }))
  const removeLocal = (key, id) => setData((d) => ({ ...d, [key]: d[key].filter((r) => r.id !== id) }))

  const ENT = { book: 'Book', parts: 'Part', chapters: 'Chapter', scenes: 'Scene', notes: 'Note', characters: 'Character', eras: 'Era', ideas: 'Idea', inspirations: 'Inspiration', research: 'ResearchNote' }

  const update = useCallback((key, id, patch, opts) => {
    if (key === 'book') setData((d) => ({ ...d, book: { ...d.book, ...patch } }))
    else patchLocal(key, id, patch)
    queueUpdate(ENT[key], id, patch, opts)
  }, [])

  /** Replace a scene's text from outside the editor (split, merge, restore, replace). */
  const setSceneContent = useCallback((id, html) => {
    const words = wordsInHtml(html)
    patchLocal('scenes', id, { content: html, word_count: words, _externalRev: Date.now() })
    queueUpdate('Scene', id, { content: html, word_count: words }, { delay: 100 })
  }, [])

  const reorder = (key, list) => {
    list.forEach((r, i) => {
      if (r.order !== i) update(key, r.id, { order: i }, { delay: 300 })
    })
  }

  const tree = useMemo(() => buildTree({ ...data, usesParts: !!data.book?.use_parts }), [data])
  const flatChapters = useMemo(() => tree.flatMap((g) => g.chapters), [tree])

  // ---------- Chapters ----------
  const addChapter = useCallback(async ({ afterId = null, partId = null, kind = 'chapter', title = '' } = {}) => {
    const d = dataRef.current
    const siblings = d.chapters.filter((c) => !c.deleted && (c.part_id || null) === (partId || null)).sort(byOrder)
    let idx = siblings.length
    if (afterId) idx = siblings.findIndex((c) => c.id === afterId) + 1
    if (kind === 'prologue') idx = 0
    const ch = await db.Chapter.create({ book_id: bookId, part_id: partId, title, kind, order: idx - 0.5, deleted: false })
    const sc = await db.Scene.create({ book_id: bookId, chapter_id: ch.id, title: '', content: '', word_count: 0, status: 'idea', order: 0, deleted: false })
    addLocal('chapters', [ch])
    addLocal('scenes', [sc])
    const next = [...siblings]
    next.splice(idx, 0, ch)
    reorder('chapters', next)
    return { chapter: ch, scene: sc }
  }, [bookId])

  const addScene = useCallback(async (chapterId, afterId = null, init = {}) => {
    const d = dataRef.current
    const siblings = d.scenes.filter((s) => !s.deleted && s.chapter_id === chapterId).sort(byOrder)
    const idx = afterId ? siblings.findIndex((s) => s.id === afterId) + 1 : siblings.length
    const sc = await db.Scene.create({ book_id: bookId, chapter_id: chapterId, title: '', content: '', word_count: 0, status: 'idea', order: idx - 0.5, deleted: false, ...init })
    addLocal('scenes', [sc])
    const next = [...siblings]
    next.splice(idx, 0, sc)
    reorder('scenes', next)
    return sc
  }, [bookId])

  // Undo for structural moves: remember every position before a move.
  const moveHistory = useRef([])
  const rememberPositions = () => {
    const d = dataRef.current
    moveHistory.current.push({
      chapters: d.chapters.map((c) => ({ id: c.id, order: c.order, part_id: c.part_id || null })),
      scenes: d.scenes.map((s) => ({ id: s.id, order: s.order, chapter_id: s.chapter_id })),
    })
    if (moveHistory.current.length > 50) moveHistory.current.shift()
  }
  const undoMove = useCallback(() => {
    const snap = moveHistory.current.pop()
    if (!snap) return false
    const d = dataRef.current
    for (const c of snap.chapters) {
      const now = d.chapters.find((x) => x.id === c.id)
      if (now && (now.order !== c.order || (now.part_id || null) !== c.part_id)) update('chapters', c.id, { order: c.order, part_id: c.part_id }, { delay: 300 })
    }
    for (const sc of snap.scenes) {
      const now = d.scenes.find((x) => x.id === sc.id)
      if (now && (now.order !== sc.order || now.chapter_id !== sc.chapter_id)) update('scenes', sc.id, { order: sc.order, chapter_id: sc.chapter_id }, { delay: 300 })
    }
    return true
  }, [])

  /** Move a chapter (with all its scenes) to a new position, optionally into another part. */
  const moveChapter = useCallback((chapterId, destIndex, destPartId = null) => {
    rememberPositions()
    const d = dataRef.current
    const ch = d.chapters.find((c) => c.id === chapterId)
    if (!ch) return
    const usesParts = !!d.book?.use_parts
    const dest = usesParts ? destPartId || null : null
    const partKey = (c) => (usesParts ? c.part_id || null : null)
    const target = d.chapters.filter((c) => !c.deleted && c.id !== chapterId && partKey(c) === dest).sort(byOrder)
    target.splice(destIndex, 0, ch)
    target.forEach((c, i) => {
      const patch = {}
      if (c.order !== i || c.id === chapterId) patch.order = i
      if (c.id === chapterId && usesParts && (c.part_id || null) !== dest) patch.part_id = dest
      if (Object.keys(patch).length) update('chapters', c.id, patch, { delay: 300 })
    })
  }, [update])

  /** Move a scene to a position in any chapter. */
  const moveScene = useCallback((sceneId, destChapterId, destIndex, { remember = true } = {}) => {
    if (remember) rememberPositions()
    const d = dataRef.current
    const sc = d.scenes.find((s) => s.id === sceneId)
    if (!sc) return
    const fromChapter = sc.chapter_id
    const target = d.scenes.filter((s) => !s.deleted && s.chapter_id === destChapterId && s.id !== sceneId).sort(byOrder)
    target.splice(destIndex, 0, { ...sc, chapter_id: destChapterId })
    const source = fromChapter !== destChapterId ? d.scenes.filter((s) => !s.deleted && s.chapter_id === fromChapter && s.id !== sceneId).sort(byOrder) : []
    setData((dd) => ({
      ...dd,
      scenes: dd.scenes.map((s) => {
        const i = target.findIndex((t) => t.id === s.id)
        if (i >= 0) return { ...s, chapter_id: destChapterId, order: i }
        const j = source.findIndex((t) => t.id === s.id)
        if (j >= 0) return { ...s, order: j }
        return s
      }),
    }))
    target.forEach((s, i) => {
      const patch = {}
      if (s.order !== i || s.id === sceneId) patch.order = i
      if (s.id === sceneId && fromChapter !== destChapterId) patch.chapter_id = destChapterId
      if (Object.keys(patch).length) queueUpdate('Scene', s.id, patch, { delay: 300 })
    })
    source.forEach((s, j) => { if (s.order !== j) queueUpdate('Scene', s.id, { order: j }, { delay: 300 }) })
  }, [])

  const trash = useCallback((key, id) => update(key, id, { deleted: true, deleted_at: new Date().toISOString() }, { delay: 200 }), [update])
  const restore = useCallback((key, id) => update(key, id, { deleted: false, deleted_at: null }, { delay: 200 }), [update])
  const purge = useCallback(async (key, id) => {
    removeLocal(key, id)
    await db[ENT[key]].delete(id).catch(() => {})
  }, [])

  const duplicateScene = useCallback(async (sceneId) => {
    const s = dataRef.current.scenes.find((x) => x.id === sceneId)
    if (!s) return null
    return addScene(s.chapter_id, s.id, { title: s.title ? `${s.title} (עותק)` : '', summary: s.summary || '', content: s.content || '', word_count: s.word_count || 0, status: s.status })
  }, [addScene])

  const duplicateChapter = useCallback(async (chapterId) => {
    const d = dataRef.current
    const ch = d.chapters.find((c) => c.id === chapterId)
    if (!ch) return null
    const { chapter, scene } = await addChapter({ afterId: ch.id, partId: ch.part_id || null, title: ch.title ? `${ch.title} (עותק)` : '' })
    const scenes = d.scenes.filter((s) => !s.deleted && s.chapter_id === chapterId).sort(byOrder)
    await purge('scenes', scene.id)
    const created = await db.Scene.bulkCreate(scenes.map((s, i) => ({ book_id: bookId, chapter_id: chapter.id, title: s.title || '', summary: s.summary || '', content: s.content || '', word_count: s.word_count || 0, status: s.status || 'draft', order: i, deleted: false })))
    addLocal('scenes', created)
    return chapter
  }, [addChapter, purge, bookId])

  /** Split a scene into two at the cursor. */
  const splitScene = useCallback(async (sceneId, beforeHtml, afterHtml) => {
    const s = dataRef.current.scenes.find((x) => x.id === sceneId)
    if (!s) return null
    setSceneContent(sceneId, beforeHtml)
    return addScene(s.chapter_id, s.id, { content: afterHtml, word_count: wordsInHtml(afterHtml), status: s.status })
  }, [setSceneContent, addScene])

  const mergeSceneWithPrevious = useCallback((sceneId) => {
    const d = dataRef.current
    const s = d.scenes.find((x) => x.id === sceneId)
    const siblings = d.scenes.filter((x) => !x.deleted && x.chapter_id === s.chapter_id).sort(byOrder)
    const i = siblings.findIndex((x) => x.id === sceneId)
    if (i <= 0) return false
    const prev = siblings[i - 1]
    const html = `${prev.content || ''}<hr>${s.content || ''}`
    setSceneContent(prev.id, html)
    // Notes follow the text into the merged scene.
    d.notes.filter((n) => n.scene_id === s.id).forEach((n) => update('notes', n.id, { scene_id: prev.id }))
    trash('scenes', sceneId)
    return prev.id
  }, [update, trash, setSceneContent])

  /** "Make this a chapter": the scene and every scene after it in the chapter move to a new chapter. */
  const sceneToChapter = useCallback(async (sceneId) => {
    const d = dataRef.current
    const s = d.scenes.find((x) => x.id === sceneId)
    const ch = d.chapters.find((c) => c.id === s.chapter_id)
    const siblings = d.scenes.filter((x) => !x.deleted && x.chapter_id === s.chapter_id).sort(byOrder)
    const i = siblings.findIndex((x) => x.id === sceneId)
    const moving = siblings.slice(i)
    const { chapter, scene } = await addChapter({ afterId: ch.id, partId: ch.part_id || null, title: s.title || '' })
    await purge('scenes', scene.id)
    moving.forEach((m, j) => update('scenes', m.id, { chapter_id: chapter.id, order: j }, { delay: 200 }))
    return chapter
  }, [addChapter, purge, update])

  const mergeChapterIntoPrevious = useCallback((chapterId) => {
    const d = dataRef.current
    const ch = d.chapters.find((c) => c.id === chapterId)
    const siblings = d.chapters.filter((c) => !c.deleted && (c.part_id || null) === (ch.part_id || null)).sort(byOrder)
    const i = siblings.findIndex((c) => c.id === chapterId)
    if (i <= 0) return false
    const prev = siblings[i - 1]
    const base = d.scenes.filter((x) => !x.deleted && x.chapter_id === prev.id).length
    d.scenes.filter((x) => !x.deleted && x.chapter_id === chapterId).sort(byOrder)
      .forEach((m, j) => update('scenes', m.id, { chapter_id: prev.id, order: base + j }, { delay: 200 }))
    trash('chapters', chapterId)
    return prev.id
  }, [update, trash])

  // ---------- Parts ----------
  const addPart = useCallback(async (title = '') => {
    const order = dataRef.current.parts.filter((p) => !p.deleted).length
    const p = await db.Part.create({ book_id: bookId, title, order, deleted: false })
    addLocal('parts', [p])
    return p
  }, [bookId])

  // ---------- Generic records (notes, ideas, characters, eras) ----------
  const createRecord = useCallback(async (key, rec) => {
    const r = await db[ENT[key]].create({ book_id: bookId, ...rec })
    addLocal(key, [r])
    return r
  }, [bookId])

  const removeRecord = useCallback(async (key, id) => {
    removeLocal(key, id)
    await db[ENT[key]].delete(id).catch(() => {})
  }, [])

  return {
    ...data, loading, error, reload: load, tree, flatChapters,
    update, setSceneContent, addChapter, addScene, moveChapter, moveScene, undoMove, rememberPositions, trash, restore, purge,
    duplicateScene, duplicateChapter, splitScene, mergeSceneWithPrevious, sceneToChapter, mergeChapterIntoPrevious,
    addPart, createRecord, removeRecord,
  }
}
