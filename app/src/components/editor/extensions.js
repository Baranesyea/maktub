import { Mark, mergeAttributes, getHTMLFromFragment } from '@tiptap/react'

/** A sticky note anchored to a range of text. The note itself lives in the Note entity. */
export const NoteAnchor = Mark.create({
  name: 'noteAnchor',
  inclusive: false,
  excludes: '',
  addAttributes() {
    return {
      noteId: { default: null, parseHTML: (el) => el.getAttribute('data-note-id'), renderHTML: (a) => ({ 'data-note-id': a.noteId }) },
      noteType: { default: 'fix', parseHTML: (el) => el.getAttribute('data-note-type') || 'fix', renderHTML: (a) => ({ 'data-note-type': a.noteType }) },
    }
  },
  parseHTML() { return [{ tag: 'span[data-note-id]' }] },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { class: 'note-anchor' }), 0] },
})

/** Remove every anchor of one note from the document. */
export function removeNoteAnchor(editor, noteId) {
  const type = editor.schema.marks.noteAnchor
  const { tr, doc } = editor.state
  let changed = false
  doc.descendants((node, pos) => {
    node.marks.forEach((m) => {
      if (m.type === type && m.attrs.noteId === noteId) {
        tr.removeMark(pos, pos + node.nodeSize, m)
        changed = true
      }
    })
  })
  if (changed) editor.view.dispatch(tr)
  return changed
}

/** Change the type (color) of a note's anchor in the document. */
export function retypeNoteAnchor(editor, noteId, noteType) {
  const type = editor.schema.marks.noteAnchor
  const { tr, doc } = editor.state
  doc.descendants((node, pos) => {
    node.marks.forEach((m) => {
      if (m.type === type && m.attrs.noteId === noteId) {
        tr.removeMark(pos, pos + node.nodeSize, m)
        tr.addMark(pos, pos + node.nodeSize, type.create({ noteId, noteType }))
      }
    })
  })
  editor.view.dispatch(tr)
}

/** HTML before and after the cursor, used to split a scene in two. */
export function splitAtCursor(editor) {
  const { doc, selection } = editor.state
  const pos = selection.from
  const before = doc.cut(0, pos)
  const after = doc.cut(pos)
  return {
    before: getHTMLFromFragment(before.content, editor.schema),
    after: getHTMLFromFragment(after.content, editor.schema),
  }
}

/** If nothing is selected, select the word under the cursor. Returns the selected text. */
export function ensureWordSelection(editor) {
  const { state } = editor
  const { from, to, empty, $from } = state.selection
  if (!empty) return state.doc.textBetween(from, to, ' ')
  const text = $from.parent.textContent
  const offset = $from.parentOffset
  let s = offset, e = offset
  while (s > 0 && /[\p{L}\p{N}׳״'"-]/u.test(text[s - 1])) s--
  while (e < text.length && /[\p{L}\p{N}׳״'"-]/u.test(text[e])) e++
  if (s === e) return ''
  const start = $from.start() + s
  const end = $from.start() + e
  editor.commands.setTextSelection({ from: start, to: end })
  return text.slice(s, e)
}
