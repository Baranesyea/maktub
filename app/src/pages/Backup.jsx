// Backup: what protects the writing right now, and the extra copies outside Maktub.
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Check, Cloud, CloudOff, ExternalLink, RefreshCw, Download, Mail, HardDrive, History, Zap } from 'lucide-react'
import { useSettings } from '@/lib/settings'
import { connectDrive, disconnectDrive, isConnected, syncNow, driveAvailable } from '@/lib/drive'
import { subscribeSave } from '@/lib/outbox'
import { journalStats } from '@/lib/journal'
import { sendBackupNow, WEEKDAY_NAMES } from '@/lib/backup'
import { Page, Panel } from '@/components/AppShell'
import { Button, inputClass } from '@/components/ui'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { db, ENTITIES } from '@/api/db'
import { downloadBlob } from '@/lib/download'

async function exportAll() {
  const out = { app: 'מכתוב', exported_at: new Date().toISOString() }
  for (const name of ENTITIES) out[name] = await db[name].list('-created_date', 5000).catch(() => [])
  downloadBlob(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }), `מכתוב-גיבוי-${new Date().toISOString().slice(0, 10)}.json`)
  toast('הגיבוי ירד למחשב')
}

const fmtTime = (d) => d ? new Date(d).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

function Layer({ icon: Icon, title, text, on, children, testid, id }) {
  return (
    <div id={id} className="flex gap-4 py-4 first:pt-0 last:pb-0 border-b border-line last:border-b-0 scroll-mt-4" data-testid={testid}>
      <span className={cn('w-9 h-9 shrink-0 rounded-lg border flex items-center justify-center', on ? 'border-fg bg-fg text-bg' : 'border-line text-faint')}><Icon size={17} /></span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 font-black text-[15px]">{title}{on && <Check size={15} className="text-[var(--saved)]" />}</div>
        <div className="text-[13px] text-muted mt-0.5 leading-6">{text}</div>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  )
}

export default function BackupPage() {
  const { settings, update } = useSettings()
  const location = useLocation()
  const [save, setSave] = useState({ status: 'saved' })
  const [journal, setJournal] = useState({ count: 0, newest: null })
  const [sending, setSending] = useState(false)
  useEffect(() => subscribeSave(setSave), [])
  useEffect(() => { journalStats().then(setJournal) }, [])
  useEffect(() => {
    if (location.hash === '#drive') setTimeout(() => document.getElementById('drive')?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [location.hash])

  const mail = settings.backup_email || {}
  const setMail = (patch) => update({ backup_email: { day: 5, ...mail, ...patch } })
  const sendNow = async () => {
    setSending(true)
    try {
      const r = await sendBackupNow()
      if (r?.ok === false) throw new Error(r.error || 'failed')
      setMail({ last_sent_at: new Date().toISOString() })
      toast('הגיבוי נשלח למייל שלך')
    } catch (e) { toast('השליחה נכשלה. נסו שוב בעוד רגע.') }
    setSending(false)
  }

  const serverText = {
    saved: `הכול בשרת${save.lastSavedAt ? `, נשמר לאחרונה ב־${fmtTime(save.lastSavedAt)}` : ''}.`,
    saving: 'שומר עכשיו…',
    offline: `אין אינטרנט. ${save.pending || ''} שינויים שמורים במכשיר ויישלחו כשהחיבור יחזור.`,
    error: 'השרת לא עונה כרגע. השינויים שמורים במכשיר, ומכתוב מנסה שוב.',
  }[save.status]

  return (
    <Page title="גיבוי" subtitle="איך כל מילה שכתבת שמורה, ואיפה יש עוד עותק." width="max-w-[920px]" testid="backup">
      <Panel title="מה שומר על הכתיבה, כל הזמן" description="פועל לבד, בלי להדליק כלום.">
        <Layer icon={Zap} on title="שמירה מיידית" testid="layer-instant"
          text={`כל הקשה נשמרת מיד במכשיר, ומגיעה לשרת תוך שנייה אחרי שמפסיקים להקליד. ${serverText}`} />
        <Layer icon={HardDrive} on title="עותק במכשיר הזה" testid="layer-device"
          text={`בזמן כתיבה נשמר כאן עותק של הסצנה כל דקה, ונשאר שבוע. הוא שורד סגירת חלון, קריסה, ואפילו תקלה בשרת.${journal.count ? ` כרגע שמורים ${journal.count} עותקים, האחרון ב־${fmtTime(journal.newest)}.` : ''}`} />
        <Layer icon={History} on title="גרסאות תוך כדי כתיבה" testid="layer-versions"
          text="כל 5 דקות של כתיבה נשמרת גרסה בשרת. אם משהו נמחק בטעות: בעורך, בתפריט ⋮ שלמעלה, ״גרסאות של הסצנה״." />
      </Panel>

      <Panel title="עותק מחוץ למכתוב" description="למקרה שתרצה את הספר גם במקום אחר.">
        <Layer icon={Mail} on={!!mail.enabled} title="גיבוי שבועי במייל" testid="layer-email"
          text="פעם בשבוע נשלח אליך מייל עם כל הטקסט של הספרים שלך, מסודר לפי פרקים. נשאר אצלך, גם בלי מכתוב.">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="w-4 h-4" checked={!!mail.enabled} onChange={(e) => setMail({ enabled: e.target.checked })} data-testid="backup-email-toggle" />
              {mail.enabled ? 'פעיל' : 'כבוי'}
            </label>
            {mail.enabled && (
              <label className="inline-flex items-center gap-2 text-sm">
                ביום
                <select className={cn(inputClass, 'h-9')} value={mail.day ?? 5} onChange={(e) => setMail({ day: +e.target.value })} aria-label="יום בשבוע" data-testid="backup-email-day">
                  {WEEKDAY_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
                </select>
                בבוקר
              </label>
            )}
            <Button size="sm" onClick={sendNow} disabled={sending} data-testid="backup-email-now"><Mail size={15} />{sending ? 'שולח…' : 'שלחו לי עכשיו'}</Button>
            {mail.last_sent_at && <span className="text-[13px] text-muted">נשלח לאחרונה ב־{fmtTime(mail.last_sent_at)}</span>}
          </div>
        </Layer>
        <DriveLayer />
        <Layer icon={Download} title="הורדה למחשב" text="קובץ אחד עם כל הספרים, הפרקים, הסצנות, הפתקים, הרעיונות והדמויות. מתוך ספר אפשר גם לייצא לוורד.">
          <Button size="sm" onClick={exportAll} data-testid="export-all"><Download size={15} />הורד גיבוי מלא</Button>
        </Layer>
      </Panel>
    </Page>
  )
}

function DriveLayer() {
  const { settings } = useSettings()
  const [busy, setBusy] = useState(false)
  const connected = isConnected()
  const drive = settings.drive || {}
  const conflicts = Object.values(drive.books || {}).flatMap((b) => b.conflicts || [])
  const available = driveAvailable()

  const connect = async () => {
    setBusy(true)
    try {
      await connectDrive()
      toast('גוגל דרייב מחובר. הגיבוי הראשון מתחיל עכשיו.')
    } catch (e) { toast(e.message || 'החיבור נכשל') }
    setBusy(false)
  }

  return (
      <Layer id="drive" testid="drive-section" icon={connected ? Cloud : CloudOff} on={connected} title="גוגל דרייב"
        text={connected ? 'עותק מסודר בדרייב שלך: תיקייה לכל ספר ומסמך לכל פרק. מתעדכן לבד כל חצי דקה כשיש שינוי.' : available ? 'עותק מסודר בדרייב שלך, מתעדכן לבד כל חצי דקה. לחיצה אחת, ואישור בחלון של גוגל.' : 'עותק מסודר בדרייב שלך, מתעדכן לבד כל חצי דקה. יופעל בקרוב.'}>
        {connected ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={async () => { setBusy(true); if (settings.last_book_id) await syncNow(settings.last_book_id); setBusy(false) }} disabled={busy || !settings.last_book_id}><RefreshCw size={15} />סנכרן עכשיו</Button>
              {drive.root_folder_id && <a href={`https://drive.google.com/drive/folders/${drive.root_folder_id}`} target="_blank" rel="noreferrer"><Button size="sm"><ExternalLink size={15} />פתח בדרייב</Button></a>}
              <Button size="sm" variant="danger" onClick={disconnectDrive}>נתק</Button>
            </div>
            {conflicts.length > 0 && (
              <div className="text-sm">
                <div className="font-black text-warn mb-1">פרקים שנערכו ישירות בגוגל דוקס (העותק נשמר):</div>
                {conflicts.slice(-10).map((c, i) => <div key={i} className="text-muted">{c.name}</div>)}
              </div>
            )}
          </div>
        ) : (
          <Button size="sm" onClick={connect} disabled={busy || !available} data-testid="drive-connect">חיבור לגוגל דרייב</Button>
        )}
      </Layer>
  )
}
