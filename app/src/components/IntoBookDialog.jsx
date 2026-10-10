// Put a free text into a book: as a new chapter at the end, or as a new scene in a chapter.
import { useEffect, useState } from 'react'
import { Dialog, Button, Select } from '@/components/ui'
import { db } from '@/api/db'
import { buildTree, chapterLabel, forgetBook } from '@/hooks/useBook'
import { cn } from '@/lib/utils'

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0)

export default function IntoBookDialog({ text, open, onClose, onDone }) {
  const [books, setBooks] = useState(null)
  const [bookId, setBookId] = useState('')
  const [chapters, setChapters] = useState([])
  const [where, setWhere] = useState('chapter') // 'chapter' (new chapter at the end) or a chapter id (new scene in it)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    db.Book.list('-updated_date', 200).then((rows) => {
      const live = rows.filter((b) => !b.deleted)
      setBooks(live)
      setBookId((id) => id || live[0]?.id || '')
    }).catch(() => setBooks([]))
  }, [open])
  useEffect(() => {
    if (!bookId) return
    setWhere('chapter')
    const book = books?.find((b) => b.id === bookId)
    Promise.all([db.Chapter.filter({ book_id: bookId }), db.Part.filter({ book_id: bookId })]).then(([chs, parts]) => {
      setChapters(buildTree({ parts, chapters: chs, scenes: [], usesParts: !!book?.use_parts }).flatMap((g) => g.chapters))
    }).catch(() => setChapters([]))
  }, [bookId, books])

  const put = async () => {
    if (!bookId) return
    setBusy(true)
    try {
      const content = text.content || ''
      const words = text.word_count || 0
      let chapterId = where
      let createdChapter = null
      if (where === 'chapter') {
        const last = [...chapters].sort(byOrder).pop()
        createdChapter = await db.Chapter.create({ book_id: bookId, part_id: last?.part_id || '', title: text.title || '', kind: 'chapter', order: (last?.order ?? -1) + 1, deleted: false })
        chapterId = createdChapter.id
      }
      const siblings = (await db.Scene.filter({ book_id: bookId, chapter_id: chapterId })).filter((s) => !s.deleted)
      const scene = await db.Scene.create({
        book_id: bookId, chapter_id: chapterId, title: where === 'chapter' ? '' : (text.title || ''), content, word_count: words,
        status: 'draft', order: siblings.length ? Math.max(...siblings.map((s) => s.order ?? 0)) + 1 : 0, deleted: false,
      })
      forgetBook(bookId)
      onDone({ bookId, sceneId: scene.id, chapter: createdChapter, scene })
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="הכנסה לספר">
      {books === null ? <p className="text-muted">טוען…</p> : !books.length ? <p className="text-muted">עוד אין ספרים.</p> : (
        <div className="flex flex-col gap-4" data-testid="into-book">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">לאיזה ספר</span>
            <Select value={bookId} onChange={setBookId} options={books.map((b) => ({ value: b.id, label: b.title || 'ספר' }))} aria-label="ספר" data-testid="into-book-book" className="w-full" />
          </label>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">איפה</span>
            <button className={cn('text-start rounded-lg border px-3 py-2.5', where === 'chapter' ? 'border-fg' : 'border-line hover:bg-sunk')} onClick={() => setWhere('chapter')} data-testid="into-book-new-chapter">
              פרק חדש בסוף הספר{text.title ? <span className="text-muted">, בשם "{text.title}"</span> : null}
            </button>
            {chapters.length > 0 && (
              <div className={cn('rounded-lg border px-3 py-2.5 flex flex-col gap-2', where !== 'chapter' ? 'border-fg' : 'border-line')}>
                <span>סצנה חדשה בסוף פרק קיים</span>
                <Select value={where === 'chapter' ? '' : where} onChange={setWhere} placeholder="בחרו פרק" aria-label="פרק" data-testid="into-book-chapter" className="w-full"
                  options={chapters.map((c) => ({ value: c.id, label: chapterLabel(c) }))} />
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>ביטול</Button>
            <Button variant="primary" onClick={put} disabled={busy || !bookId} data-testid="into-book-go">הכנסה לספר</Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
