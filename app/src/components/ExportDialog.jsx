import { useEffect, useState } from 'react'
import { FileDown, Printer } from 'lucide-react'
import { Dialog, Button, Select } from '@/components/ui'
import { chapterLabel } from '@/hooks/useBook'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

export default function ExportDialog({ bk, open, onClose, initialChapters }) {
  const [scope, setScope] = useState('all')
  const [picked, setPicked] = useState([])
  const [format, setFormat] = useState('manuscript')
  const [font, setFont] = useState('david')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (initialChapters?.length) { setScope(initialChapters.length === 1 ? 'one' : 'some'); setPicked(initialChapters) }
    else { setScope('all'); setPicked([]) }
  }, [open, initialChapters])

  const ids = scope === 'all' ? null : picked
  const ready = scope === 'all' || picked.length > 0
  const toggle = (id) => setPicked((p) => scope === 'one' ? [id] : p.includes(id) ? p.filter((x) => x !== id) : [...p, id])

  const toWord = async () => {
    setBusy(true)
    try {
      const { buildDocx, downloadBlob, exportFileName } = await import('@/lib/exporter')
      const blob = await buildDocx(bk, { chapterIds: ids, format, fontKey: font })
      downloadBlob(blob, exportFileName(bk, ids, 'docx'))
      toast('קובץ הוורד ירד למחשב')
      onClose()
    } catch (e) { toast('הייצוא נכשל: ' + (e.message || 'שגיאה')) }
    setBusy(false)
  }
  const toPdf = async () => {
    // Open the window inside the click so pop-up blockers allow it, then fill it.
    const w = window.open('', '_blank')
    if (!w) { toast('הדפדפן חסם חלון חדש. אשרו חלונות קופצים ונסו שוב.'); return }
    const { buildPrintHtml } = await import('@/lib/exporter')
    w.document.open(); w.document.write(buildPrintHtml(bk, { chapterIds: ids, fontKey: font === 'david' ? 'david' : 'frank' })); w.document.close()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="ייצוא" wide>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="מה לייצא">
          {[['all', 'כל הספר'], ['some', 'פרקים נבחרים'], ['one', 'פרק אחד']].map(([k, l]) => (
            <button key={k} role="radio" aria-checked={scope === k} onClick={() => { setScope(k); if (k === 'one') setPicked((p) => p.slice(0, 1)) }} className={cn('h-9 px-3 rounded-lg border text-sm', scope === k ? 'border-accent text-accent bg-accent-soft' : 'border-line')}>{l}</button>
          ))}
        </div>
        {scope !== 'all' && (
          <div className="max-h-56 overflow-auto rounded-xl border border-line p-1">
            {bk.flatChapters.filter((c) => !c.unused).map((c) => (
              <label key={c.id} className="flex items-center gap-2 hit px-2 rounded-lg hover:bg-sunk cursor-pointer">
                <input type={scope === 'one' ? 'radio' : 'checkbox'} name="exp-ch" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
                <span>{chapterLabel(c)}</span>
              </label>
            ))}
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="flex flex-col gap-1.5">
            <span className="text-muted">עיצוב (וורד)</span>
            <Select value={format} onChange={setFormat} aria-label="עיצוב" className="w-full"
              options={[{ value: 'manuscript', label: 'כתב יד להגשה: 12, רווח כפול, הזחה' }, { value: 'book', label: 'לקריאה: רווח רגיל' }]} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-muted">גופן</span>
            <Select value={font} onChange={setFont} aria-label="גופן ייצוא" className="w-full"
              options={[{ value: 'david', label: 'דוד', style: { fontFamily: "'David Libre', David, serif" } }, { value: 'frank', label: 'פרנק רוהל', style: { fontFamily: "'Frank Ruhl Libre', serif" } }, { value: 'arial', label: 'אריאל', style: { fontFamily: 'Arial, sans-serif' } }]} />
          </div>
        </div>
        <p className="text-xs text-muted">סצנות ופרקים שסומנו "לא בשימוש" לא מיוצאים. פתקים לא מופיעים בקובץ.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={toWord} disabled={!ready || busy} data-testid="export-word"><FileDown size={16} />{busy ? 'מכין…' : 'הורד קובץ וורד'}</Button>
          <Button onClick={toPdf} disabled={!ready} data-testid="export-pdf"><Printer size={16} />פי די אף (דרך חלון ההדפסה)</Button>
        </div>
      </div>
    </Dialog>
  )
}
