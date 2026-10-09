import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '@/api/db'
import { queueUpdate } from '@/lib/outbox'
import { fontById, DEFAULT_UI_FONT, DEFAULT_WRITE_FONT } from '@/lib/fonts'

const DEFAULTS = {
  ui_font: DEFAULT_UI_FONT,
  write_font: DEFAULT_WRITE_FONT,
  write_size: 19,
  read_size: 22,
  ipad_size: 17,
  theme: 'system',
  reading_theme: 'paper',
  typewriter: true,
  paragraph_style: 'indent',
  kb_tip_seen: false,
  tour_done: false,
  note_to_self: null,
  last_book_id: null,
  drive: null,
  words_per_hour: null,
}

const LOCAL_KEY = 'maktub_settings_cache'
const SettingsContext = createContext(null)

function applyToDocument(s) {
  const root = document.documentElement
  root.style.setProperty('--ui-font', fontById(s.ui_font).css)
  root.style.setProperty('--write-font', fontById(s.write_font).css)
  root.style.setProperty('--write-size', `${s.write_size}px`)
  root.style.setProperty('--read-size', `${s.read_size}px`)
  const dark = s.theme === 'dark' || (s.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', !!dark)
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') } } catch { return DEFAULTS }
  })
  const [loaded, setLoaded] = useState(false)
  const recordId = useRef(null)

  useEffect(() => { applyToDocument(settings) }, [settings])
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const fn = () => applyToDocument(settings)
    mq?.addEventListener?.('change', fn)
    return () => mq?.removeEventListener?.('change', fn)
  }, [settings])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await db.UserSettings.list('-updated_date', 1)
        let rec = rows[0]
        if (!rec) rec = await db.UserSettings.create({ ...DEFAULTS })
        recordId.current = rec.id
        if (alive) {
          const merged = { ...DEFAULTS, ...rec }
          setSettings(merged)
          localStorage.setItem(LOCAL_KEY, JSON.stringify(merged))
        }
      } catch { /* offline: keep cached settings */ }
      if (alive) setLoaded(true)
    })()
    return () => { alive = false }
  }, [])

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
    if (recordId.current) queueUpdate('UserSettings', recordId.current, patch, { delay: 600 })
  }, [])

  const value = useMemo(() => ({ settings, update, loaded }), [settings, update, loaded])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings outside provider')
  return ctx
}
