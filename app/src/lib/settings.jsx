import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '@/api/db'
import { queueUpdate } from '@/lib/outbox'
import { fontById, DEFAULT_UI_FONT, DEFAULT_WRITE_FONT } from '@/lib/fonts'

const DEFAULTS = {
  ui_font: DEFAULT_UI_FONT,
  write_font: DEFAULT_WRITE_FONT,
  write_size: 19,
  write_weight: 300,
  read_size: 22,
  ipad_size: 17,
  theme: 'light',
  prefs_version: 2,
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

export const THEMES = [
  { id: 'light', name: 'בהיר', swatch: ['#ffffff', '#f3f4f6', '#1f2b4d'] },
  { id: 'warm', name: 'שמנת', swatch: ['#fffcf5', '#f4efe4', '#2f2a22'] },
  { id: 'gray', name: 'אפור', swatch: ['#f6f7f8', '#e6e8eb', '#1d2533'] },
  { id: 'dark', name: 'כהה', swatch: ['#1a1d23', '#121418', '#e7e9ee'] },
]

const LOCAL_KEY = 'maktub_settings_cache'
const SettingsContext = createContext(null)

function applyToDocument(s) {
  const root = document.documentElement
  root.style.setProperty('--ui-font', fontById(s.ui_font).css)
  root.style.setProperty('--write-font', fontById(s.write_font).css)
  root.style.setProperty('--write-size', `${s.write_size}px`)
  root.style.setProperty('--write-weight', String(s.write_weight || 300))
  root.style.setProperty('--read-size', `${s.read_size}px`)
  const theme = THEMES.some((t) => t.id === s.theme) ? s.theme : 'light'
  root.dataset.theme = theme
  root.classList.toggle('dark', theme === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#f3f4f6')
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') } } catch { return DEFAULTS }
  })
  const [loaded, setLoaded] = useState(false)
  const recordId = useRef(null)

  useEffect(() => { applyToDocument(settings) }, [settings])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await db.UserSettings.list('-updated_date', 1)
        let rec = rows[0]
        if (!rec) rec = await db.UserSettings.create({ ...DEFAULTS })
        recordId.current = rec.id
        if (alive) {
          let merged = { ...DEFAULTS, ...rec }
          // Version 2: one font (גופן סאנס) for the system and the writing, and the light theme
          // unless the writer picked another one. Earlier versions defaulted to a serif and to the device theme.
          if ((rec.prefs_version || 0) < 2) {
            const patch = { ui_font: 'gofan', write_font: 'gofan', theme: rec.theme === 'dark' || rec.theme === 'system' || !rec.theme ? 'light' : rec.theme, prefs_version: 2 }
            merged = { ...merged, ...patch }
            queueUpdate('UserSettings', rec.id, patch, { delay: 300 })
          }
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
