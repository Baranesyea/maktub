import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, Cloud, CloudOff, ExternalLink, RefreshCw, LogOut } from 'lucide-react'
import { useSettings } from '@/lib/settings'
import { FONTS } from '@/lib/fonts'
import { connectDrive, disconnectDrive, isConnected, syncNow, clientId } from '@/lib/drive'
import { useAuth } from '@/lib/AuthContext'
import { Button, inputClass } from '@/components/ui'
import { startTour } from '@/components/Tour'
import { cn, isMock } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { db, ENTITIES } from '@/api/db'
import { downloadBlob } from '@/lib/download'

async function exportAll() {
  const out = { app: 'מכתוב', exported_at: new Date().toISOString() }
  for (const name of ENTITIES) out[name] = await db[name].list('-created_date', 5000).catch(() => [])
  downloadBlob(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }), `מכתוב-גיבוי-${new Date().toISOString().slice(0, 10)}.json`)
  toast('הגיבוי ירד למחשב')
}

export default function SettingsPage() {
  const { settings, update } = useSettings()
  const { logout } = useAuth()
  const location = useLocation()
  useEffect(() => {
    if (location.hash === '#drive') setTimeout(() => document.getElementById('drive')?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [location.hash])

  return (
    <div className="h-full overflow-y-auto">
      <header className="h-14 flex items-center gap-2 px-4 border-b border-line bg-surface">
        <Link to={settings.last_book_id ? `/book/${settings.last_book_id}` : '/'} className="hit inline-flex items-center gap-1 rounded-lg px-2 hover:bg-sunk"><ArrowRight size={17} />חזרה</Link>
        <span className="font-semibold">הגדרות</span>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">גופנים</h2>
          <p className="text-sm text-muted">שני תפריטים נפרדים: גופן המערכת לתפריטים, לעץ ולכפתורים, וגופן הכתיבה לטקסט של הספר.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted">גופן מערכת</span>
              <select className={inputClass} value={settings.ui_font} onChange={(e) => update({ ui_font: e.target.value })} data-testid="ui-font">
                <optgroup label="שלך">{FONTS.filter((f) => f.ui && f.mine).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>
                <optgroup label="חינמיים">{FONTS.filter((f) => f.ui && !f.mine).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted">גופן כתיבה</span>
              <select className={inputClass} value={settings.write_font} onChange={(e) => update({ write_font: e.target.value })} data-testid="write-font">
                <optgroup label="שלך">{FONTS.filter((f) => f.write && f.mine).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>
                <optgroup label="חינמיים">{FONTS.filter((f) => f.write && !f.mine).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>
              </select>
            </label>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="text-xs text-muted mb-2 font-ui">כך זה ייראה:</div>
            <p className="prose-write m-0">בקיץ ההוא, כשהמזגן במטבח עוד השמיע את הרעש הזה, אמא שלי החליטה שאנחנו עוברים דירה.</p>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">תצוגה</h2>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="ערכת צבע">
            {[['system', 'לפי המכשיר'], ['light', 'בהיר'], ['dark', 'כהה']].map(([k, l]) => (
              <button key={k} role="radio" aria-checked={settings.theme === k} onClick={() => update({ theme: k })} className={cn('h-9 px-3 rounded-lg border text-sm', settings.theme === k ? 'border-accent text-accent bg-accent-soft' : 'border-line')}>{l}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 items-center text-sm" role="radiogroup" aria-label="סגנון פסקה">
            <span className="text-muted me-1">פסקאות:</span>
            {[['indent', 'הזחה בשורה הראשונה (כמו ספר)'], ['spaced', 'רווח בין פסקאות']].map(([k, l]) => (
              <button key={k} role="radio" aria-checked={(settings.paragraph_style || 'indent') === k} onClick={() => update({ paragraph_style: k })} className={cn('h-9 px-3 rounded-lg border', (settings.paragraph_style || 'indent') === k ? 'border-accent text-accent bg-accent-soft' : 'border-line')}>{l}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.typewriter} onChange={(e) => update({ typewriter: e.target.checked })} />גלילת מכונת כתיבה במצב ריכוז (השורה הנוכחית תמיד באמצע)</label>
          <div><Button variant="ghost" onClick={() => startTour()}>הפעל שוב את הסיור המודרך</Button></div>
        </section>

        <DriveSection />

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">ייצוא כל המידע</h2>
          <p className="text-sm text-muted">קובץ אחד עם כל הספרים, הפרקים, הסצנות, הפתקים, הרעיונות והדמויות. כדי שהמידע שלך תמיד יהיה בידיים שלך.</p>
          <div><Button onClick={exportAll} data-testid="export-all">הורד גיבוי מלא</Button></div>
        </section>

        {!isMock && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">חשבון</h2>
            <div><Button variant="ghost" onClick={() => logout()}><LogOut size={16} />התנתקות</Button></div>
          </section>
        )}
      </main>
    </div>
  )
}

function DriveSection() {
  const { settings, update } = useSettings()
  const [cid, setCid] = useState(clientId())
  const [busy, setBusy] = useState(false)
  const connected = isConnected()
  const drive = settings.drive || {}
  const conflicts = Object.values(drive.books || {}).flatMap((b) => b.conflicts || [])

  const connect = async () => {
    setBusy(true)
    try {
      if (cid && cid !== clientId()) update({ drive: { ...drive, client_id: cid.trim() } })
      // Give the settings update a moment so the client id is in place.
      await new Promise((r) => setTimeout(r, 50))
      await connectDrive()
      toast('גוגל דרייב מחובר. הגיבוי הראשון מתחיל עכשיו.')
    } catch (e) { toast(e.message || 'החיבור נכשל') }
    setBusy(false)
  }

  return (
    <section id="drive" className="flex flex-col gap-3 scroll-mt-4" data-testid="drive-section">
      <h2 className="text-lg font-semibold flex items-center gap-2">{connected ? <Cloud size={20} className="text-ok" /> : <CloudOff size={20} className="text-warn" />}גיבוי לגוגל דרייב</h2>
      <p className="text-sm text-muted leading-6">
        מכתוב שומר עותק מסודר של כל ספר בדרייב שלך: תיקייה לכל ספר, מסמך גוגל לכל פרק, תוכן עניינים, ותיקיית "גרסאות" עם קובץ וורד יומי.
        בכל חצי דקה, אם היה שינוי, הפרקים שהשתנו מתעדכנים. מכתוב רואה רק את הקבצים שהוא עצמו יצר.
      </p>
      {connected ? (
        <div className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-3">
          <div className="text-ok font-medium">מחובר</div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={async () => { setBusy(true); if (settings.last_book_id) await syncNow(settings.last_book_id); setBusy(false) }} disabled={busy || !settings.last_book_id}><RefreshCw size={15} />סנכרן עכשיו</Button>
            {drive.root_folder_id && <a href={`https://drive.google.com/drive/folders/${drive.root_folder_id}`} target="_blank" rel="noreferrer"><Button><ExternalLink size={15} />פתח בדרייב</Button></a>}
            <Button variant="ghost" onClick={connect} disabled={busy}>חבר מחדש</Button>
            <Button variant="danger" onClick={disconnectDrive}>נתק</Button>
          </div>
          {conflicts.length > 0 && (
            <div className="text-sm">
              <div className="font-medium text-warn mb-1">פרקים שנערכו ישירות בגוגל דוקס (העותק נשמר):</div>
              {conflicts.slice(-10).map((c, i) => <div key={i} className="text-muted">{c.name}</div>)}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-3">
          <Button variant="primary" onClick={connect} disabled={busy || !cid} data-testid="drive-connect">חבר את גוגל דרייב</Button>
          <details className="text-sm" open={!cid}>
            <summary className="cursor-pointer text-muted">הגדרה חד־פעמית: מזהה לקוח של גוגל</summary>
            <ol className="list-decimal ps-5 mt-2 flex flex-col gap-1 leading-6">
              <li>נכנסים ל־Google Cloud Console ויוצרים פרויקט (חינמי).</li>
              <li>מפעילים את Google Drive API.</li>
              <li>במסך ההסכמה (OAuth consent screen) בוחרים External, ומוסיפים את עצמך כמשתמש בדיקה.</li>
              <li>יוצרים Credentials מסוג OAuth client ID, מסוג Web application, ומוסיפים את כתובת האפליקציה ל־Authorized JavaScript origins.</li>
              <li>מעתיקים את ה־Client ID ומדביקים כאן.</li>
            </ol>
            <input className={cn(inputClass, 'w-full mt-2')} dir="ltr" value={cid} onChange={(e) => setCid(e.target.value)} placeholder="xxxxxxxx.apps.googleusercontent.com" aria-label="מזהה לקוח של גוגל" data-testid="drive-client-id" />
          </details>
        </div>
      )}
    </section>
  )
}
