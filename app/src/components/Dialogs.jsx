import { useEffect, useMemo, useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Dialog, Button, inputClass } from '@/components/ui'
import { db } from '@/api/db'
import { chapterLabel } from '@/hooks/useBook'
import { formatNumber, htmlToText, wordsInHtml } from '@/lib/text'
import { toast } from '@/lib/toast'
import { copiesOf } from '@/lib/journal'
import { cn } from '@/lib/utils'

/** Previous versions of a scene: view and restore. Restoring saves the current text as a version first. */
export function VersionsDialog({ bk, scene, open, onClose }) {
  const [list, setList] = useState([])
  const [sel, setSel] = useState(null)
  const [source, setSource] = useState('server')
  useEffect(() => {
    if (!open || !scene) return
    if (source === 'device') {
      copiesOf(scene.id).then((r) => {
        const rows = r.slice(0, 200).map((c) => ({ id: `d${c.key}`, created_date: new Date(c.at).toISOString(), content: c.html, word_count: c.words, reason: 'device' }))
        setList(rows); setSel(rows[0] || null)
      })
    } else {
      db.Snapshot.filter({ scene_id: scene.id }, '-created_date', 100).then((r) => { setList(r); setSel(r[0] || null) }).catch(() => setList([]))
    }
  }, [open, scene?.id, source])
  if (!scene) return null
  const saveNow = async () => {
    const s = await db.Snapshot.create({ book_id: bk.book.id, scene_id: scene.id, content: scene.content || '', word_count: scene.word_count || 0, reason: 'manual' })
    setList((l) => [s, ...l]); setSel(s); toast('הגרסה נשמרה')
  }
  const restore = async (snap) => {
    await db.Snapshot.create({ book_id: bk.book.id, scene_id: scene.id, content: scene.content || '', word_count: scene.word_count || 0, reason: 'before-restore' })
    bk.setSceneContent(scene.id, snap.content || '')
    toast('הגרסה שוחזרה. הגרסה שהייתה לפני כן נשמרה ברשימה.')
    onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={`גרסאות: ${scene.title || 'סצנה'}`} wide>
      <div className="flex flex-col md:flex-row gap-4 min-h-[50vh]">
        <div className="md:w-60 flex flex-col gap-1 md:max-h-[65vh] md:overflow-y-auto">
          <div className="flex rounded-lg border border-line bg-raised p-0.5 text-[13px] mb-1" role="group" aria-label="מאיפה">
            {[['server', 'בשרת'], ['device', 'במכשיר הזה']].map(([k, l]) => (
              <button key={k} className={cn('flex-1 h-8 rounded-md', source === k ? 'bg-surface shadow-[var(--shadow-sm)] font-black' : 'text-muted')} onClick={() => setSource(k)} aria-pressed={source === k} data-testid={`versions-${k}`}>{l}</button>
            ))}
          </div>
          {source === 'server' && <Button onClick={saveNow}>שמור גרסה עכשיו</Button>}
          {list.length === 0 && <p className="text-sm text-muted p-2">{source === 'device' ? 'עוד אין עותקים במכשיר הזה. בזמן כתיבה נשמר כאן עותק כל דקה, למשך שבוע.' : 'עוד אין גרסאות. בזמן כתיבה מכתוב שומר גרסה כל 5 דקות.'}</p>}
          {list.map((s) => (
            <button key={s.id} onClick={() => setSel(s)} className={cn('text-start rounded-lg px-3 py-2 text-sm', sel?.id === s.id ? 'bg-accent-soft font-black' : 'hover:bg-sunk')} data-testid="version-row">
              <div>{new Date(s.created_date).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'medium' })}</div>
              <div className="text-xs text-muted">{formatNumber(s.word_count || 0)} מילים · {s.reason === 'manual' ? 'נשמרה ידנית' : s.reason === 'before-restore' ? 'לפני שחזור' : s.reason === 'import' ? 'לפני ייבוא' : s.reason === 'device' ? 'עותק במכשיר' : s.reason === 'rolling' ? 'תוך כדי כתיבה' : 'אוטומטית'}</div>
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {sel ? (
            <>
              <div className="flex-1 overflow-auto rounded-xl border border-line p-4 prose-write" style={{ fontSize: 16 }} dangerouslySetInnerHTML={{ __html: sel.content || '<p>(ריקה)</p>' }} />
              <Button variant="primary" onClick={() => restore(sel)}><RotateCcw size={16} />שחזר את הגרסה הזאת</Button>
            </>
          ) : <div className="text-muted text-sm">בחרו גרסה מהרשימה.</div>}
        </div>
      </div>
    </Dialog>
  )
}

/** Deleted chapters and scenes stay here for 30 days. */
export function TrashDialog({ bk, open, onClose }) {
  const chapters = bk.chapters.filter((c) => c.deleted)
  const scenes = bk.scenes.filter((s) => s.deleted && !chapters.some((c) => c.id === s.chapter_id))
  const days = (r) => Math.max(0, 30 - Math.floor((Date.now() - new Date(r.deleted_at || Date.now()).getTime()) / 864e5))
  const Row = ({ label, r, kind }) => (
    <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="truncate">{label}</div>
        <div className="text-xs text-muted">יימחק לצמיתות בעוד {days(r)} ימים</div>
      </div>
      <Button size="sm" onClick={() => { bk.restore(kind, r.id); toast('שוחזר') }}><RotateCcw size={14} />שחזר</Button>
      <Button size="sm" variant="danger" onClick={() => bk.purge(kind, r.id)} aria-label="מחק לצמיתות"><Trash2 size={14} /></Button>
    </div>
  )
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="סל מחזור">
      <div className="flex flex-col gap-2">
        {!chapters.length && !scenes.length && <p className="text-sm text-muted">הסל ריק.</p>}
        {chapters.map((c) => <Row key={c.id} r={c} kind="chapters" label={`פרק: ${c.title || 'ללא שם'}`} />)}
        {scenes.map((s) => <Row key={s.id} r={s} kind="scenes" label={`סצנה: ${s.title || htmlToText(s.content).slice(0, 40) || 'ריקה'}`} />)}
      </div>
    </Dialog>
  )
}

/** Find and replace across the whole book. Replaces inside text only, never inside markup. */
export function FindReplaceDialog({ bk, open, onClose, onOpenScene }) {
  const [q, setQ] = useState('')
  const [r, setR] = useState('')
  const results = useMemo(() => {
    if (!q.trim()) return []
    const out = []
    for (const ch of bk.flatChapters) for (const s of ch.scenes) {
      const text = htmlToText(s.content)
      let i = text.indexOf(q)
      let count = 0
      while (i >= 0 && count < 50) {
        out.push({ ch, s, before: text.slice(Math.max(0, i - 30), i), after: text.slice(i + q.length, i + q.length + 30) })
        i = text.indexOf(q, i + q.length); count++
      }
    }
    return out
  }, [q, bk.flatChapters])
  const replaceAll = () => {
    let n = 0
    const touched = new Set(results.map((x) => x.s.id))
    for (const id of touched) {
      const s = bk.scenes.find((x) => x.id === id)
      const doc = new DOMParser().parseFromString(`<body>${s.content || ''}</body>`, 'text/html')
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.nodeValue.includes(q)) { n += node.nodeValue.split(q).length - 1; node.nodeValue = node.nodeValue.split(q).join(r) }
      }
      bk.setSceneContent(id, doc.body.innerHTML)
    }
    toast(`הוחלפו ${n} מופעים`)
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="חיפוש והחלפה בכל הספר" wide>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <input className={cn(inputClass, 'flex-1')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="חפש" autoFocus aria-label="חפש" data-testid="find-input" />
          <input className={cn(inputClass, 'flex-1')} value={r} onChange={(e) => setR(e.target.value)} placeholder="החלף ב־" aria-label="החלף ב" data-testid="replace-input" />
          <Button variant="primary" onClick={replaceAll} disabled={!results.length} data-testid="replace-all">החלף הכול</Button>
        </div>
        <div className="text-sm text-muted">{q ? `${results.length} תוצאות` : 'הקלידו מילה או שם, למשל שם של דמות.'}</div>
        <div className="flex flex-col gap-1 max-h-[50vh] overflow-auto">
          {results.map((x, i) => (
            <button key={i} className="text-start rounded-lg px-3 py-2 hover:bg-sunk text-sm" onClick={() => { onOpenScene(x.s.id); onClose() }}>
              <div className="text-xs text-muted">{chapterLabel(x.ch)}</div>
              <div className="truncate">…{x.before}<mark className="search-hit">{q}</mark>{x.after}…</div>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  )
}

export const wordsOf = wordsInHtml
