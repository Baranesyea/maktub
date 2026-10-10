import { db } from '@/api/db'

export async function createBook(title, extra = {}) {
  const book = await db.Book.create({ title: title || 'ספר חדש', use_parts: false, archived: false, deleted: false, ...extra })
  const ch = await db.Chapter.create({ book_id: book.id, title: '', kind: 'chapter', order: 0, deleted: false })
  await db.Scene.create({ book_id: book.id, chapter_id: ch.id, title: '', content: '', word_count: 0, status: 'idea', order: 0, deleted: false })
  return book
}

/** Copy a whole book: parts, chapters, scenes, characters, eras. Notes and history stay with the original. */
export async function duplicateBook(bookId) {
  const src = await db.Book.get(bookId)
  const q = { book_id: bookId }
  const [parts, chapters, scenes, characters, eras] = await Promise.all([db.Part.filter(q), db.Chapter.filter(q), db.Scene.filter(q), db.Character.filter(q), db.Era.filter(q)])
  const strip = ({ id, created_date, updated_date, created_by, created_by_id, ...rest }) => rest
  const book = await db.Book.create({ ...strip(src), title: `${src.title} (עותק)`, plan: null })
  const partMap = {}
  for (const p of parts.filter((x) => !x.deleted)) partMap[p.id] = (await db.Part.create({ ...strip(p), book_id: book.id })).id
  const chMap = {}
  for (const c of chapters.filter((x) => !x.deleted)) chMap[c.id] = (await db.Chapter.create({ ...strip(c), book_id: book.id, part_id: c.part_id ? partMap[c.part_id] || null : null })).id
  const live = scenes.filter((s) => !s.deleted && chMap[s.chapter_id])
  const plain = (html) => String(html || '').replace(/<span class="note-anchor"[^>]*>(.*?)<\/span>/g, '$1')
  if (live.length) await db.Scene.bulkCreate(live.map((s) => ({ ...strip(s), book_id: book.id, chapter_id: chMap[s.chapter_id], content: plain(s.content) })))
  if (characters.length) await db.Character.bulkCreate(characters.map((c) => ({ ...strip(c), book_id: book.id })))
  if (eras.length) await db.Era.bulkCreate(eras.map((e) => ({ ...strip(e), book_id: book.id })))
  return book
}

export async function listBooks() {
  const books = await db.Book.list('-updated_date', 200)
  return books.filter((b) => !b.deleted)
}

export async function bookWordCounts(bookIds) {
  const out = {}
  for (const id of bookIds) {
    const scenes = await db.Scene.filter({ book_id: id })
    const chapters = await db.Chapter.filter({ book_id: id })
    const unusedCh = new Set(chapters.filter((c) => c.deleted || c.unused).map((c) => c.id))
    out[id] = scenes.filter((s) => !s.deleted && !s.unused && !unusedCh.has(s.chapter_id)).reduce((n, s) => n + (s.word_count || 0), 0)
  }
  return out
}
