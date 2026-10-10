import { Link } from 'react-router-dom'
import { LogOut, Check, Compass, ShieldCheck } from 'lucide-react'
import { useSettings, THEMES } from '@/lib/settings'
import { FONTS } from '@/lib/fonts'
import { useAuth } from '@/lib/AuthContext'
import { Page, Panel } from '@/components/AppShell'
import { Button, inputClass } from '@/components/ui'
import { startTour } from '@/components/Tour'
import { cn, isMock } from '@/lib/utils'


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
        <Row label="עובי הטקסט בממשק" hint="תפריטים, כפתורים ועץ הספר.">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="עובי הטקסט בממשק">
            <Choice checked={(settings.ui_weight || 300) === 300} onClick={() => update({ ui_weight: 300 })} data-testid="ui-weight-light">דק</Choice>
            <Choice checked={settings.ui_weight === 500} onClick={() => update({ ui_weight: 500 })}>רגיל</Choice>
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

      <Panel title="גיבוי" description="שמירה מיידית, עותק במכשיר, גרסאות, גיבוי שבועי במייל וגוגל דרייב.">
        <Link to="/backup"><Button><ShieldCheck size={16} />לעמוד הגיבוי</Button></Link>
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

