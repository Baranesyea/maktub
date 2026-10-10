// A name that does not fit: on hover over its row it glides to show the rest, back and forth,
// until the pointer leaves. Names that fit stay still.
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export default function Marquee({ children, className, rowSelector = '[role="treeitem"]' }) {
  const outer = useRef(null)
  const inner = useRef(null)
  useEffect(() => {
    const row = outer.current?.closest(rowSelector) || outer.current
    if (!row) return
    const on = () => {
      const o = outer.current, i = inner.current
      if (!o || !i) return
      const extra = i.scrollWidth - o.clientWidth
      if (extra <= 2) return
      o.style.setProperty('--marquee-shift', `${extra + 6}px`)
      o.style.setProperty('--marquee-time', `${Math.max(2.2, (extra + 6) / 75 + 1)}s`)
      o.classList.add('marquee-run')
    }
    const off = () => outer.current?.classList.remove('marquee-run')
    row.addEventListener('mouseenter', on)
    row.addEventListener('mouseleave', off)
    return () => { row.removeEventListener('mouseenter', on); row.removeEventListener('mouseleave', off) }
  }, [rowSelector])
  return (
    <span ref={outer} className={cn('marquee flex-1 min-w-0 overflow-hidden whitespace-nowrap', className)}>
      <span ref={inner} className="marquee-inner inline-block">{children}</span>
    </span>
  )
}
