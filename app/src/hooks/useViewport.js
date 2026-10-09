import { useEffect, useState } from 'react'

/** Width-based layout mode. The layout follows the window width, not the device type. */
export function useLayoutMode() {
  const get = () => {
    // The navigation rail takes 80px on screens from 640px up; count only the room the editor gets.
    const w = window.innerWidth - (window.innerWidth >= 640 ? 80 : 0)
    return w >= 1080 ? 'wide' : w >= 700 ? 'medium' : 'narrow'
  }
  const [mode, setMode] = useState(get)
  useEffect(() => {
    const fn = () => setMode(get())
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mode
}

/**
 * Detects the on-screen keyboard on iPad/iPhone. Safari overlays the keyboard and shrinks the
 * visual viewport, so we compare it with the layout viewport while a text field has focus.
 * Exposes the visible area so the writing surface can sit exactly above the keyboard.
 */
export function useOnScreenKeyboard() {
  const [state, setState] = useState({ open: false, top: 0, height: typeof window !== 'undefined' ? window.innerHeight : 800 })
  useEffect(() => {
    const vv = window.visualViewport
    const compute = () => {
      const forced = window.__maktubKeyboard // test hook: { height }
      const active = document.activeElement
      const editing = !!active && (active.isContentEditable || active.tagName === 'TEXTAREA')
      const h = forced ? window.innerHeight - forced.height : vv ? vv.height : window.innerHeight
      const top = forced ? 0 : vv ? vv.offsetTop : 0
      const covered = window.innerHeight - h
      const coarse = window.matchMedia?.('(pointer: coarse)').matches
      const open = !!forced || (editing && coarse && covered > 140)
      setState((s) => (s.open === open && s.top === top && s.height === h ? s : { open, top, height: h }))
    }
    compute()
    vv?.addEventListener('resize', compute)
    vv?.addEventListener('scroll', compute)
    window.addEventListener('focusin', compute)
    window.addEventListener('focusout', () => setTimeout(compute, 50))
    window.addEventListener('maktub-keyboard', compute)
    return () => {
      vv?.removeEventListener('resize', compute)
      vv?.removeEventListener('scroll', compute)
      window.removeEventListener('focusin', compute)
      window.removeEventListener('maktub-keyboard', compute)
    }
  }, [])
  return state
}

/** Keep the caret at a fixed height in the visible area (typewriter scrolling). */
export function keepCaretInView(editor, scroller, { ratio = 0.42, visibleTop = 0, visibleHeight } = {}) {
  if (!editor || !scroller) return
  try {
    const { from } = editor.state.selection
    const coords = editor.view.coordsAtPos(from)
    const box = scroller.getBoundingClientRect()
    const vh = visibleHeight ?? box.height
    const targetY = Math.max(box.top, visibleTop) + vh * ratio
    const delta = coords.top - targetY
    if (Math.abs(delta) > 8) scroller.scrollTop += delta
  } catch { /* position not rendered yet */ }
}

/** Width of an element, kept up to date. */
export function useWidth(ref) {
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return w
}
