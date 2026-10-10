// The entrance: a black screen where the Maktub wordmark is typed out in white, letter by letter,
// with a blinking caret. Shown once per browser session, when a signed-in writer enters the app.
import { useEffect, useState } from 'react'
import { Logo } from '@/components/Logo'
import { isMock } from '@/lib/utils'

const SEEN_KEY = 'maktub_splash_seen'
// Where each letter of the wordmark starts, from the right (the logo's viewBox runs -45..3458).
// After each step everything right of this x is visible: מ, כ, ת, ו, ב.
const VIEW_LEFT = -45
const VIEW_WIDTH = 3503
const STEPS = [3458, 2600, 1880, 1100, 810, VIEW_LEFT]
const hiddenPct = (x) => ((x - VIEW_LEFT) / VIEW_WIDTH) * 100

function seen() { try { return sessionStorage.getItem(SEEN_KEY) === '1' } catch { return true } }
function markSeen() { try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* private mode */ } }

/** True when this visit will most likely land signed in, so the splash can cover the sign-in check too. */
export function splashLikely() {
  if (seen()) return false
  if (isMock) return true
  try {
    const p = new URLSearchParams(window.location.search)
    return !!(localStorage.getItem('base44_access_token') || p.get('access_token') || p.get('ott'))
  } catch { return false }
}

export function shouldSplash() { return !seen() }

export default function Splash({ onDone }) {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const [step, setStep] = useState(reduce ? STEPS.length - 1 : 0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (reduce) { const t = setTimeout(() => setLeaving(true), 700); return () => clearTimeout(t) }
    const timers = []
    let at = 380 // a beat of blinking before the first letter
    for (let i = 1; i < STEPS.length; i++) {
      at += 150 + ((i * 53) % 90) // uneven, like a hand on keys
      timers.push(setTimeout(() => setStep(i), at))
    }
    timers.push(setTimeout(() => setLeaving(true), at + 750))
    return () => timers.forEach(clearTimeout)
  }, [reduce])

  useEffect(() => {
    if (!leaving) return
    markSeen()
    const t = setTimeout(onDone, 450)
    return () => clearTimeout(t)
  }, [leaving, onDone])

  const skip = () => setLeaving(true)
  useEffect(() => {
    window.addEventListener('keydown', skip)
    return () => window.removeEventListener('keydown', skip)
  }, [])

  const cut = hiddenPct(STEPS[step])
  return (
    <div
      className={`fixed inset-0 z-[200] bg-black text-white flex items-center justify-center transition-opacity duration-[450ms] ${leaving ? 'opacity-0' : 'opacity-100'}`}
      onClick={skip}
      role="presentation"
      data-testid="splash"
    >
      <div className="relative" dir="ltr" style={{ width: 'min(62vw, 340px)' }}>
        <div style={{ clipPath: `inset(-10% 0 -10% ${cut}%)` }}>
          <Logo height={98} className="w-full h-auto" title="מכתוב" />
        </div>
        <span
          className="splash-caret absolute top-[7%] bottom-[36%] w-[3px] bg-white"
          style={{ left: `calc(${cut}% - 16px)` }}
          aria-hidden
        />
      </div>
    </div>
  )
}
