// Login, sign-up (with an emailed code), forgot password and reset password, in Hebrew.
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button, inputClass } from '@/components/ui'
import { cn } from '@/lib/utils'

const sdk = async () => (await import('@/api/base44Client')).base44

export function safeReturnTo() {
  const raw = new URLSearchParams(window.location.search).get('returnTo')
  if (!raw) return '/'
  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin !== window.location.origin) return '/'
    for (const p of ['access_token', 'clear_access_token', 'app_id', 'app_base_url', 'functions_version', 'from_url']) url.searchParams.delete(p)
    const path = url.pathname + url.search
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '/'
    return path
  } catch { return '/' }
}

function Layout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-full flex items-center justify-center px-4 py-10" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent text-white text-3xl font-write mb-3" aria-hidden>מ</div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="text-muted mt-1">{subtitle}</p>}
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 flex flex-col gap-4">{children}</div>
        {footer && <p className="text-center text-sm text-muted mt-5">{footer}</p>}
      </div>
    </div>
  )
}

const ErrorBox = ({ text }) => text ? <div className="rounded-lg bg-danger/10 text-danger text-sm p-3">{text}</div> : null
const he = (msg, fallback) => {
  const m = String(msg || '')
  if (/invalid|incorrect|wrong/i.test(m)) return 'האימייל או הסיסמה לא נכונים'
  if (/exist/i.test(m)) return 'כבר יש חשבון עם האימייל הזה'
  if (/network|fetch/i.test(m)) return 'אין חיבור לאינטרנט'
  return fallback
}

function GoogleButton({ returnTo }) {
  return (
    <Button className="w-full h-12" onClick={async () => (await sdk()).auth.loginWithProvider('google', returnTo)}>
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      המשך עם גוגל
    </Button>
  )
}

const Or = () => <div className="flex items-center gap-3 text-xs text-muted"><span className="flex-1 h-px bg-line" />או<span className="flex-1 h-px bg-line" /></div>

export function Login() {
  const returnTo = safeReturnTo()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try { await (await sdk()).auth.loginViaEmailPassword(email, password); window.location.href = returnTo }
    catch (err) { setError(he(err.message, 'ההתחברות נכשלה')) }
    setLoading(false)
  }
  return (
    <Layout title="ברוכים השבים" subtitle="התחברו כדי להמשיך לכתוב" footer={<>אין לך חשבון? <Link className="text-accent font-medium" to={'/register' + (returnTo !== '/' ? '?returnTo=' + encodeURIComponent(returnTo) : '')}>הרשמה</Link></>}>
      <GoogleButton returnTo={returnTo} />
      <Or />
      <ErrorBox text={error} />
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input className={cn(inputClass, 'h-12')} type="email" dir="ltr" autoComplete="email" placeholder="אימייל" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="אימייל" />
        <input className={cn(inputClass, 'h-12')} type="password" dir="ltr" autoComplete="current-password" placeholder="סיסמה" value={password} onChange={(e) => setPassword(e.target.value)} required aria-label="סיסמה" />
        <Link to="/forgot-password" className="text-xs text-accent self-start">שכחתי סיסמה</Link>
        <Button variant="primary" className="h-12" type="submit" disabled={loading}>{loading ? <Loader2 size={16} className="animate-spin" /> : 'התחברות'}</Button>
      </form>
    </Layout>
  )
}

export function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('form')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setError('')
    if (password !== confirm) { setError('הסיסמאות לא תואמות'); return }
    setLoading(true)
    try { await (await sdk()).auth.register({ email, password }); setStep('otp') }
    catch (err) { setError(he(err.message, 'ההרשמה נכשלה')) }
    setLoading(false)
  }
  const verify = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const base44 = await sdk()
      const r = await base44.auth.verifyOtp({ email, otpCode: otp.trim() })
      if (r?.access_token) base44.auth.setToken(r.access_token)
      window.location.href = safeReturnTo()
    } catch (err) { setError(he(err.message, 'הקוד לא נכון')) }
    setLoading(false)
  }
  if (step === 'otp') {
    return (
      <Layout title="אימות האימייל" subtitle={`שלחנו קוד אל ${email}`}>
        <ErrorBox text={error} />
        {info && <div className="text-sm text-ok">{info}</div>}
        <form onSubmit={verify} className="flex flex-col gap-3">
          <input className={cn(inputClass, 'h-12 text-center tracking-[0.5em] text-lg')} dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="000000" aria-label="קוד אימות" />
          <Button variant="primary" className="h-12" type="submit" disabled={loading || otp.trim().length < 6}>אימות</Button>
          <button type="button" className="text-sm text-accent" onClick={async () => { try { await (await sdk()).auth.resendOtp(email); setInfo('נשלח קוד חדש') } catch (err) { setError('השליחה נכשלה') } }}>שלחו לי קוד חדש</button>
        </form>
      </Layout>
    )
  }
  return (
    <Layout title="הרשמה למכתוב" footer={<>כבר יש לך חשבון? <Link className="text-accent font-medium" to="/login">התחברות</Link></>}>
      <GoogleButton returnTo={safeReturnTo()} />
      <Or />
      <ErrorBox text={error} />
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input className={cn(inputClass, 'h-12')} type="email" dir="ltr" autoComplete="email" placeholder="אימייל" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="אימייל" />
        <input className={cn(inputClass, 'h-12')} type="password" dir="ltr" autoComplete="new-password" placeholder="סיסמה" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} aria-label="סיסמה" />
        <input className={cn(inputClass, 'h-12')} type="password" dir="ltr" autoComplete="new-password" placeholder="הסיסמה שוב" value={confirm} onChange={(e) => setConfirm(e.target.value)} required aria-label="אימות סיסמה" />
        <Button variant="primary" className="h-12" type="submit" disabled={loading}>{loading ? <Loader2 size={16} className="animate-spin" /> : 'יצירת חשבון'}</Button>
      </form>
    </Layout>
  )
}

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault(); setError('')
    try { await (await sdk()).auth.resetPasswordRequest(email); setSent(true) }
    catch (err) { setError(he(err.message, 'השליחה נכשלה')) }
  }
  return (
    <Layout title="שכחתי סיסמה" footer={<Link className="text-accent" to="/login">חזרה להתחברות</Link>}>
      {sent ? <p className="text-sm">אם יש חשבון עם האימייל הזה, נשלח אליו קישור לאיפוס הסיסמה.</p> : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <ErrorBox text={error} />
          <input className={cn(inputClass, 'h-12')} type="email" dir="ltr" placeholder="אימייל" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="אימייל" />
          <Button variant="primary" className="h-12" type="submit">שלחו לי קישור</Button>
        </form>
      )}
    </Layout>
  )
}

export function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  if (!token) return <Layout title="הקישור לא תקין" footer={<Link className="text-accent" to="/forgot-password">בקשו קישור חדש</Link>}><p className="text-sm">הקישור חסר או פג תוקף.</p></Layout>
  const submit = async (e) => {
    e.preventDefault(); setError('')
    if (pw !== pw2) { setError('הסיסמאות לא תואמות'); return }
    try { await (await sdk()).auth.resetPassword({ resetToken: token, newPassword: pw }); window.location.href = '/login' }
    catch (err) { setError(he(err.message, 'האיפוס נכשל')) }
  }
  return (
    <Layout title="סיסמה חדשה">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <ErrorBox text={error} />
        <input className={cn(inputClass, 'h-12')} type="password" dir="ltr" autoComplete="new-password" placeholder="סיסמה חדשה" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} aria-label="סיסמה חדשה" />
        <input className={cn(inputClass, 'h-12')} type="password" dir="ltr" autoComplete="new-password" placeholder="הסיסמה שוב" value={pw2} onChange={(e) => setPw2(e.target.value)} required aria-label="אימות סיסמה" />
        <Button variant="primary" className="h-12" type="submit">שמירה</Button>
      </form>
    </Layout>
  )
}
