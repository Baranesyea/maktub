import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Cloud, CloudOff, ExternalLink, RefreshCw, LogOut, Check, Download, Compass } from 'lucide-react'
import { useSettings, THEMES } from '@/lib/settings'
import { FONTS } from '@/lib/fonts'
import { connectDrive, disconnectDrive, isConnected, syncNow, driveAvailable } from '@/lib/drive'
import { useAuth } from '@/lib/AuthContext'
import { Page, Panel } from '@/components/AppShell'
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

function Choice({ checked, onClick, children, className, ...rest }) {
  return (
    <button role="radio" aria-checked={checked} onClick={onClick}
      className={cn('h-10 px-3.5 rounded-lg border text-sm transition-colors', checked ? 'border-fg bg-raised font-black' : 'border-line hover:bg-raised', className)} {...rest}>{children}</button>
  )
}

function Row({ label, hint, children }) {
  return (
    <div className="grid sm:grid-cols-[220px_1fr] gap-x-6 gap-y-2 py-4 first:pt-0 last:pb-0 border-b border-line last:border-b-0">
      <div>
        <div className="text-[14px] font-black">{label}</div>
        {hint && <div className="text-[13px] text-muted mt-0.5">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const { settings, update } = useSettings()
  const { user, logout } = useAuth()
  const location = useLocation()
  useEffect(() => {
    if (location.hash === '#drive') setTimeout(() => document.getElementById('drive')?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [location.hash])
  const para = settings.paragraph_style || 'indent'

  return (
    <Page title="הגדרות" subtitle="המראה, הגופן, הגיבוי והמידע שלך. כל בחירה נשמרת בחשבון שלך." width="max-w-[920px]" testid="settings">
      <Panel title="מראה">
        <Row label="ערכת צבע" hint="אפשר להחליף בכל רגע.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5" role="radiogroup" aria-label="ערכת צבע">
            {THEMES.map((t) => {
              const on = (settings.theme || 'light') === t.id
              return (
                <button key={t.id} role="radio" aria-checked={on} onClick={() => update({ theme: t.id })} data-testid={`theme-${t.id}`}
                  className={cn('rounded-xl border p-2 text-start transition-colors', on ? 'border-fg ring-1 ring-fg' : 'border-line hover:border-line-strong')}>
                  <div className="h-16 rounded-lg overflow-hidden flex border border-black/10" style={{ background: t.swatch[1] }} aria-hidden>
                    <div className="w-4" style={{ background: t.id === 'dark' ? '#0b0c0f' : '#0f1013' }} />
                    <div className="flex-1 p-2 flex flex-col gap-1.5">
                      <div className="h-2 w-2/3 rounded-sm" style={{ background: t.swatch[2], opacity: 0.85 }} />
                      <div className="flex-1 rounded-md" style={{ background: t.swatch[0] }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 px-0.5 text-sm">{on && <Check size={14} />}<span className={on ? 'font-black' : ''}>{t.name}</span></div>
                </button>
              )
            })}
          </div>
        </Row>
        <Row label="עובי הטקסט בעורך" hint="דק נעים לקריאה ארוכה.">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="עובי הטקסט">
            <Choice checked={(settings.write_weight || 300) === 300} onClick={() => update({ write_weight: 300 })}>דק</Choice>
            <Choice checked={settings.write_weight === 500} onClick={() => update({ write_weight: 500 })}>רגיל</Choice>
          </div>
        </Row>
      </Panel>

      <Panel title="גופן">
        <Row label="גופן מערכת" hint="תפריטים, עץ הספר וכפתורים.">
          <select className={cn(inputClass, 'w-full max-w-xs')} value={settings.ui_font} onChange={(e) => update({ ui_font: e.target.value })} data-testid="ui-font">
            <optgroup label="שלך">{FONTS.filter((f) => f.ui && f.mine).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>
            <optgroup label="חינמיים">{FONTS.filter((f) => f.ui && !f.mine).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>
          </select>
        </Row>
        <Row label="גופן כתיבה" hint="הטקסט של הספר.">
          <select className={cn(inputClass, 'w-full max-w-xs')} value={settings.write_font} onChange={(e) => update({ write_font: e.target.value })} data-testid="write-font">
            <optgroup label="שלך">{FONTS.filter((f) => f.write && f.mine).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>
            <optgroup label="חינמיים">{FONTS.filter((f) => f.write && !f.mine).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>
          </select>
          <div className="rounded-lg border border-line bg-raised p-4 mt-3">
            <p className="prose-write m-0">בקיץ ההוא, כשהמזגן במטבח עוד השמיע את הרעש הזה, אמא שלי החליטה שאנחנו עוברים דירה.</p>
          </div>
        </Row>
      </Panel>

      <Panel title="כתיבה">
        <Row label="פסקאות">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="סגנון פסקה">
            <Choice checked={para === 'indent'} onClick={() => update({ paragraph_style: 'indent' })}>הזחה בשורה הראשונה, כמו בספר</Choice>
            <Choice checked={para === 'spaced'} onClick={() => update({ paragraph_style: 'spaced' })}>רווח בין פסקאות</Choice>
          </div>
        </Row>
        <Row label="מצב ריכוז">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.typewriter} onChange={(e) => update({ typewriter: e.target.checked })} />גלילת מכונת כתיבה: השורה הנוכחית תמיד באמצע המסך</label>
        </Row>
        <Row label="סיור מודרך" hint="הסבר קצר על כל חלקי המסך.">
          <Button onClick={() => startTour()}><Compass size={16} />הפעל שוב את הסיור</Button>
        </Row>
      </Panel>

      <DriveSection />

      <Panel title="המידע שלך" description="קובץ אחד עם כל הספרים, הפרקים, הסצנות, הפתקים, הרעיונות והדמויות.">
        <Button onClick={exportAll} data-testid="export-all"><Download size={16} />הורד גיבוי מלא</Button>
      </Panel>

      {!isMock && (
        <Panel title="חשבון">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted flex-1" dir="ltr" style={{ textAlign: 'right' }}>{user?.email}</span>
            <Button variant="ghost" onClick={() => logout()}><LogOut size={16} />התנתקות</Button>
          </div>
        </Panel>
      )}
    </Page>
  )
}

function DriveSection() {
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
    <Panel id="drive" className="scroll-mt-4" data-testid="drive-section"
      title={<span className="flex items-center gap-2">{connected ? <Cloud size={18} className="text-ok" /> : <CloudOff size={18} className="text-warn" />}גיבוי לגוגל דרייב</span>}
      description="עותק מסודר של כל ספר בדרייב שלך: תיקייה לכל ספר ומסמך לכל פרק. מתעדכן לבד כל חצי דקה כשיש שינוי.">
      {connected ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-ok font-black"><Check size={16} />מחובר{drive.connected_at ? ` מאז ${new Date(drive.connected_at).toLocaleDateString('he-IL')}` : ''}</div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={async () => { setBusy(true); if (settings.last_book_id) await syncNow(settings.last_book_id); setBusy(false) }} disabled={busy || !settings.last_book_id}><RefreshCw size={15} />סנכרן עכשיו</Button>
            {drive.root_folder_id && <a href={`https://drive.google.com/drive/folders/${drive.root_folder_id}`} target="_blank" rel="noreferrer"><Button><ExternalLink size={15} />פתח בדרייב</Button></a>}
            <Button variant="danger" onClick={disconnectDrive}>נתק</Button>
          </div>
          {conflicts.length > 0 && (
            <div className="text-sm">
              <div className="font-black text-warn mb-1">פרקים שנערכו ישירות בגוגל דוקס (העותק נשמר):</div>
              {conflicts.slice(-10).map((c, i) => <div key={i} className="text-muted">{c.name}</div>)}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" onClick={connect} disabled={busy || !available} data-testid="drive-connect">
            <svg width="18" height="18" viewBox="0 0 87.3 78" aria-hidden><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/><path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/><path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/><path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/><path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/></svg>
            חיבור לגוגל דרייב
          </Button>
          <span className="text-[13px] text-muted">{available ? 'לחיצה אחת, ואישור בחלון של גוגל. מכתוב רואה רק את הקבצים שהוא עצמו יוצר.' : 'החיבור לדרייב יופעל בקרוב.'}</span>
        </div>
      )}
    </Panel>
  )
}
