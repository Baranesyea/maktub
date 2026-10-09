import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import { NoteAnchor } from './extensions'
import { countWords } from '@/lib/text'
import { recordTyping } from '@/lib/stats'

/**
 * One scene's text. Saves through onChange (the caller queues it in the outbox).
 * Counts typed words for the daily goal; pasted text changes the book count only.
 */
export default function SceneEditor({ scene, paragraphStyle = 'indent', editable = true, onChange, onFocus, onReady, onAnchorClick, onFirstEdit, onContextMenu, placeholder = 'כאן כותבים…' }) {
  const pastedAt = useRef(0)
  const wordsRef = useRef(scene.word_count || 0)
  const firstEditDone = useRef(false)
  const cbs = useRef({})
  cbs.current = { onChange, onFocus, onAnchorClick, onFirstEdit, onContextMenu }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false, code: false, link: false, underline: false }),
      Placeholder.configure({ placeholder }),
      Highlight,
      NoteAnchor,
    ],
    content: scene.content || '',
    editable,
    editorProps: {
      attributes: { dir: 'rtl', lang: 'he', spellcheck: 'true', class: 'ProseMirror', 'data-scene-id': scene.id, 'aria-label': 'טקסט הסצנה' },
      handlePaste: () => { pastedAt.current = Date.now(); return false },
      handleDrop: () => { pastedAt.current = Date.now(); return false },
      // Right click on a selection, or on text that already has a note: our own menu.
      // Anywhere else the browser's menu stays, with its spelling suggestions.
      handleDOMEvents: {
        contextmenu: (view, event) => {
          const onAnchor = event.target?.closest?.('[data-note-id]')?.getAttribute('data-note-id') || null
          const { from, to } = view.state.selection
          if (!onAnchor && from === to) return false
          event.preventDefault()
          cbs.current.onContextMenu?.({ sceneId: scene.id, x: event.clientX, y: event.clientY, noteId: onAnchor, hasSelection: from !== to })
          return true
        },
      },
      handleClickOn: (view, pos, node, nodePos, event) => {
        const el = event.target?.closest?.('[data-note-id]')
        if (el) cbs.current.onAnchorClick?.(el.getAttribute('data-note-id'), scene.id)
        return false
      },
    },
    onFocus: ({ editor: ed }) => cbs.current.onFocus?.(scene.id, ed),
    onUpdate: ({ editor: ed, transaction }) => {
      if (!transaction.docChanged) return
      const html = ed.getHTML()
      const words = countWords(ed.getText({ blockSeparator: '\n' }))
      const delta = words - wordsRef.current
      wordsRef.current = words
      const pasted = Date.now() - pastedAt.current < 300 || transaction.getMeta('paste') || transaction.getMeta('uiEvent') === 'paste'
      if (transaction.getMeta('addToHistory') !== false && !transaction.getMeta('maktubSilent')) recordTyping(delta, { pasted })
      if (!firstEditDone.current) { firstEditDone.current = true; cbs.current.onFirstEdit?.(scene.id) }
      cbs.current.onChange?.(scene.id, html, words)
    },
  }, [scene.id])

  useEffect(() => { if (editor) onReady?.(scene.id, editor) }, [editor, scene.id])
  useEffect(() => { if (editor && editor.isEditable !== editable) editor.setEditable(editable) }, [editor, editable])
  useEffect(() => () => onReady?.(scene.id, null), [scene.id])

  // Content replaced from outside (version restore, merge, find & replace).
  useEffect(() => {
    if (!editor || !scene._externalRev) return
    if ((scene.content || '') !== editor.getHTML()) {
      editor.commands.setContent(scene.content || '', { emitUpdate: false })
      wordsRef.current = scene.word_count || 0
    }
  }, [editor, scene._externalRev])

  return <EditorContent editor={editor} className={`prose-write ${paragraphStyle === 'spaced' ? 'para-spaced' : 'indent-first'}`} />
}
