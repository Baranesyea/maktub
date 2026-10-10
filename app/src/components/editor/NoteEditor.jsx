import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import { Bold, Italic, Heading2, List, Quote, Highlighter } from 'lucide-react'
import { IconButton } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Free writing about a picture or a research topic. Not part of the book.
 * Remount it (key) when switching to another item; it only reads `value` on mount.
 */
export default function NoteEditor({ value, onChange, placeholder = 'מה זה מעורר בך? מה חשוב לזכור?', compact = false, className, testid }) {
  const cb = useRef(onChange)
  cb.current = onChange
  const [, force] = useState(0)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false, code: false, underline: false, link: { openOnClick: true, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } } }),
      Placeholder.configure({ placeholder }),
      Highlight,
    ],
    content: value || '',
    editorProps: { attributes: { dir: 'rtl', lang: 'he', spellcheck: 'true', class: 'ProseMirror', 'aria-label': 'הערות', ...(testid ? { 'data-testid': testid } : {}) } },
    onUpdate: ({ editor: e }) => cb.current?.(e.isEmpty ? '' : e.getHTML()),
  })
  useEffect(() => {
    if (!editor) return
    const fn = () => force((x) => x + 1)
    editor.on('selectionUpdate', fn); editor.on('transaction', fn)
    return () => { editor.off('selectionUpdate', fn); editor.off('transaction', fn) }
  }, [editor])
  const run = (fn) => () => editor && fn(editor.chain().focus()).run()
  const on = (n, a) => !!editor?.isActive(n, a)
  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-center gap-0.5 -ms-1 mb-1 text-muted" role="toolbar" aria-label="עיצוב הערות" onMouseDown={(e) => { if (e.target.closest('button')) e.preventDefault() }}>
        <IconButton label="מודגש" active={on('bold')} onClick={run((c) => c.toggleBold())}><Bold size={15} /></IconButton>
        <IconButton label="נטוי" active={on('italic')} onClick={run((c) => c.toggleItalic())}><Italic size={15} /></IconButton>
        <IconButton label="מרקר" active={on('highlight')} onClick={run((c) => c.toggleHighlight())}><Highlighter size={15} /></IconButton>
        <IconButton label="כותרת" active={on('heading', { level: 2 })} onClick={run((c) => c.toggleHeading({ level: 2 }))}><Heading2 size={15} /></IconButton>
        <IconButton label="רשימה" active={on('bulletList')} onClick={run((c) => c.toggleBulletList())}><List size={15} /></IconButton>
        <IconButton label="ציטוט" active={on('blockquote')} onClick={run((c) => c.toggleBlockquote())}><Quote size={15} /></IconButton>
      </div>
      <EditorContent editor={editor} className={cn('prose-write prose-note', compact && 'prose-note-compact')} />
    </div>
  )
}
