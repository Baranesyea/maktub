import { useEffect, useState } from 'react'

let items = []
const listeners = new Set()
const emit = () => listeners.forEach((fn) => fn(items))

/** Show a short message at the bottom of the screen, with an optional action like "בטל". */
export function toast(text, { action, ms = 4000 } = {}) {
  const id = Math.random().toString(36).slice(2)
  items = [...items, { id, text, action: action && { ...action, run: () => { action.run(); dismiss(id) } } }]
  emit()
  setTimeout(() => dismiss(id), ms)
  return id
}
export function dismiss(id) { items = items.filter((t) => t.id !== id); emit() }
export function useToasts() {
  const [list, setList] = useState(items)
  useEffect(() => { listeners.add(setList); return () => listeners.delete(setList) }, [])
  return list
}
