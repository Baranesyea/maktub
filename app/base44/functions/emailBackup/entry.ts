// Emails writers a plain-text copy of all their books.
// mode "me": the signed-in writer asks for a copy now.
// mode "weekly": the daily schedule; sends to every writer who turned the weekly email on,
// on the weekday they chose, at most once a day.
import { createClientFromRequest } from 'npm:@base44/sdk'

// Used only if the mail service refuses one big email.
const MAX_CHARS = 400_000
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const ENTITY_MAP: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

function htmlToText(html: string): string {
  return (html || '')
    .replace(/<hr\s*\/?>/gi, '\n* * *\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITY_MAP[m] || m)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const byOrder = (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)
const words = (t: string) => (t.match(/\S+/g) || []).length

function chapterTitle(c: any, n: number | null) {
  if (c.kind === 'prologue') return c.title || 'פרולוג'
  if (c.kind === 'epilogue') return c.title || 'אפילוג'
  return n ? (c.title ? `פרק ${n}: ${c.title}` : `פרק ${n}`) : (c.title || 'פרק')
}

async function bookText(entities: any, email: string) {
  const q = { created_by: email }
  const [books, parts, chapters, scenes] = await Promise.all([
    entities.Book.filter(q), entities.Part.filter(q), entities.Chapter.filter(q), entities.Scene.filter(q),
  ])
  const out: string[] = []
  for (const book of books.filter((b: any) => !b.deleted)) {
    const bookParts = parts.filter((p: any) => p.book_id === book.id && !p.deleted).sort(byOrder)
    const bookChapters = chapters.filter((c: any) => c.book_id === book.id && !c.deleted).sort(byOrder)
    const groups = book.use_parts && bookParts.length
      ? [{ part: null, chapters: bookChapters.filter((c: any) => !bookParts.some((p: any) => p.id === c.part_id)) },
        ...bookParts.map((p: any) => ({ part: p, chapters: bookChapters.filter((c: any) => c.part_id === p.id) }))]
      : [{ part: null, chapters: bookChapters }]
    let n = 0
    const lines: string[] = []
    let total = 0
    for (const g of groups) {
      if (g.part) lines.push('', `━━━ ${g.part.title || 'חלק'} ━━━`)
      for (const c of g.chapters) {
        const numbered = !c.kind || c.kind === 'chapter'
        if (numbered && !c.unused) n += 1
        lines.push('', '', `■ ${chapterTitle(c, numbered && !c.unused ? n : null)}${c.unused ? ' (לא בשימוש)' : ''}`, '')
        const sc = scenes.filter((s: any) => s.chapter_id === c.id && !s.deleted).sort(byOrder)
        sc.forEach((s: any, i: number) => {
          if (i > 0) lines.push('', '* * *', '')
          if (s.title && sc.length > 1) lines.push(`[${s.title}]`)
          const t = htmlToText((s.content || '') + (Array.isArray(s.content_more) ? s.content_more.join('') : ''))
          total += words(t)
          lines.push(t || '(ריקה)')
        })
      }
    }
    out.push(`════════ ${book.title || 'ספר'} ════════\n${total.toLocaleString('he-IL')} מילים${lines.join('\n')}`)
  }
  // Texts written outside any book.
  const texts = (await entities.LooseText.filter(q).catch(() => [])).filter((t: any) => !t.deleted)
  if (texts.length) {
    const parts = texts.map((t: any) => {
      const body = htmlToText((t.content || '') + (Array.isArray(t.content_more) ? t.content_more.join('') : ''))
      return `■ ${t.title || 'בלי כותרת'}${t.description ? `\n${t.description}` : ''}\n\n${body || '(ריק)'}`
    })
    out.push(`════════ טקסטים ════════\n\n${parts.join('\n\n* * *\n\n')}`)
  }
  return out.join('\n\n\n')
}

function split(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text]
  const parts: string[] = []
  let rest = text
  while (rest.length > MAX_CHARS) {
    let cut = rest.lastIndexOf('\n', MAX_CHARS)
    if (cut < MAX_CHARS / 2) cut = MAX_CHARS
    parts.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  parts.push(rest)
  return parts
}

async function sendTo(base44: any, entities: any, email: string) {
  const text = await bookText(entities, email)
  if (!text.trim()) return 0
  const date = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'long', year: 'numeric' })
  const intro = `שלום,\nזה הגיבוי של הספרים שלך ממכתוב, נכון ל־${date}.\nכל הטקסט נמצא במייל הזה, מסודר לפי פרקים. אם תוכנת המייל מקצרת אותו, לוחצים על ״הצגת ההודעה המלאה״ בתחתית.\n\n`
  const send = (subject: string, body: string) => base44.asServiceRole.integrations.Core.SendEmail({ to: email, subject, body, from_name: 'מכתוב' })
  // One email with everything. Only if the mail service refuses it as too large, send it in parts.
  try {
    await send(`גיבוי מכתוב · ${date}`, intro + text)
    return 1
  } catch (e) {
    if (!/size|large|limit|too long|413/i.test(String((e as Error)?.message || e))) throw e
    const chunks = split(text)
    for (let i = 0; i < chunks.length; i++) {
      await send(`גיבוי מכתוב · ${date} (חלק ${i + 1} מתוך ${chunks.length})`, (i === 0 ? intro : '') + chunks[i])
    }
    return chunks.length
  }
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req)
    const body = await req.json().catch(() => ({}))
    const mode = body?.mode || 'me'
    const user = await base44.auth.me().catch(() => null)

    if (mode === 'me') {
      if (!user?.email) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 })
      const sent = await sendTo(base44, base44.asServiceRole.entities, user.email)
      return Response.json({ ok: true, sent })
    }

    if (mode === 'weekly') {
      // Only the schedule (no user) or an admin may run the weekly round.
      if (user && user.role !== 'admin') return Response.json({ ok: false, error: 'forbidden' }, { status: 403 })
      const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })).getDay()
      const all = await base44.asServiceRole.entities.UserSettings.list('-updated_date', 5000)
      let sent = 0
      for (const s of all) {
        const mail = s.backup_email || {}
        if (!mail.enabled || (mail.day ?? 5) !== today || !s.created_by) continue
        if (mail.last_sent_at && Date.now() - new Date(mail.last_sent_at).getTime() < 20 * 3600 * 1000) continue
        try {
          if (await sendTo(base44, base44.asServiceRole.entities, s.created_by)) {
            await base44.asServiceRole.entities.UserSettings.update(s.id, { backup_email: { ...mail, last_sent_at: new Date().toISOString() } })
            sent++
          }
        } catch (e) { console.error('backup email failed for a writer', String(e)) }
      }
      return Response.json({ ok: true, sent, day: DAY_NAMES[today] })
    }

    return Response.json({ ok: false, error: 'unknown mode' }, { status: 400 })
  } catch (error) {
    return Response.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 })
  }
}
