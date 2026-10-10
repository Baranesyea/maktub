// Emails writers a copy of all their books and texts, laid out like a document:
// the book title, chapter headings, paragraphs, and a break between scenes.
// mode "me": the signed-in writer asks for a copy now.
// mode "weekly": the daily schedule; sends to every writer who turned the weekly email on,
// on the weekday they chose, at most once a day.
import { createClientFromRequest } from 'npm:@base44/sdk'

// Used only if the mail service refuses one big email.
const MAX_CHARS = 400_000
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const ALLOWED = new Set(['p', 'br', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 'blockquote', 'ul', 'ol', 'li', 'hr'])

const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const byOrder = (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)
const fullText = (r: any) => (r.content || '') + (Array.isArray(r.content_more) ? r.content_more.join('') : '')
const words = (html: string) => (html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').match(/\S+/g) || []).length

/** Keep the writing's own formatting (paragraphs, bold, quotes) and drop everything else, attributes included. */
function clean(html: string): string {
  return (html || '').replace(/<(\/?)([a-z0-9]+)\b[^>]*>/gi, (_m, slash, tag) => {
    const t = tag.toLowerCase()
    if (!ALLOWED.has(t)) return ''
    if (t === 'p' && !slash) return '<p style="margin:0 0 12px">'
    if (t === 'hr') return SCENE_BREAK
    return `<${slash}${t}>`
  })
}

const SCENE_BREAK = '<p style="text-align:center;color:#888;letter-spacing:6px;margin:24px 0">* * *</p>'
const H1 = 'font-size:26px;margin:0 0 4px;font-weight:900'
const H2 = 'font-size:20px;margin:36px 0 14px;font-weight:900'
const SMALL = 'color:#777;font-size:13px;margin:0 0 6px'

function chapterTitle(c: any, n: number | null) {
  if (c.kind === 'prologue') return c.title || 'פרולוג'
  if (c.kind === 'epilogue') return c.title || 'אפילוג'
  return n ? (c.title ? `פרק ${n}: ${c.title}` : `פרק ${n}`) : (c.title || 'פרק')
}

async function collect(entities: any, email: string) {
  const q = { created_by: email }
  const [books, parts, chapters, scenes, texts] = await Promise.all([
    entities.Book.filter(q), entities.Part.filter(q), entities.Chapter.filter(q), entities.Scene.filter(q),
    entities.LooseText.filter(q).catch(() => []),
  ])
  const blocks: string[] = []
  const liveBooks = books.filter((b: any) => !b.deleted)
  for (const book of liveBooks) {
    const bookParts = parts.filter((p: any) => p.book_id === book.id && !p.deleted).sort(byOrder)
    const bookChapters = chapters.filter((c: any) => c.book_id === book.id && !c.deleted).sort(byOrder)
    const groups = book.use_parts && bookParts.length
      ? [{ part: null, chapters: bookChapters.filter((c: any) => !bookParts.some((p: any) => p.id === c.part_id)) },
        ...bookParts.map((p: any) => ({ part: p, chapters: bookChapters.filter((c: any) => c.part_id === p.id) }))]
      : [{ part: null, chapters: bookChapters }]
    let n = 0
    let total = 0
    const body: string[] = []
    for (const g of groups) {
      if (g.part) body.push(`<p style="text-align:center;font-size:18px;font-weight:900;margin:40px 0 0">${esc(g.part.title || 'חלק')}</p>`)
      for (const c of g.chapters) {
        const numbered = !c.kind || c.kind === 'chapter'
        if (numbered && !c.unused) n += 1
        const sc = scenes.filter((s: any) => s.chapter_id === c.id && !s.deleted).sort(byOrder)
        const parts: string[] = [`<h2 style="${H2}">${esc(chapterTitle(c, numbered && !c.unused ? n : null))}${c.unused ? ' <span style="color:#999;font-size:14px">(לא בשימוש)</span>' : ''}</h2>`]
        sc.forEach((s: any, i: number) => {
          const html = fullText(s)
          if (!c.unused && !s.unused) total += words(html)
          if (i > 0) parts.push(SCENE_BREAK)
          if (s.title && sc.length > 1) parts.push(`<p style="${SMALL}">${esc(s.title)}</p>`)
          parts.push(clean(html) || '<p style="color:#999">(ריקה)</p>')
        })
        body.push(parts.join(''))
      }
    }
    blocks.push(`<h1 style="${H1}">${esc(book.title || 'ספר')}</h1><p style="${SMALL}">${total.toLocaleString('he-IL')} מילים</p>`)
    blocks.push(...body)
    blocks.push('<hr style="border:0;border-top:2px solid #222;margin:48px 0">')
  }
  const liveTexts = texts.filter((t: any) => !t.deleted)
  if (liveTexts.length) {
    blocks.push(`<h1 style="${H1}">טקסטים</h1><p style="${SMALL}">מה שנכתב מחוץ לספרים</p>`)
    for (const t of liveTexts) {
      blocks.push(`<h2 style="${H2}">${esc(t.title || 'בלי כותרת')}</h2>${t.description ? `<p style="${SMALL}">${esc(t.description)}</p>` : ''}${clean(fullText(t)) || '<p style="color:#999">(ריק)</p>'}`)
    }
  }
  return { blocks, books: liveBooks, texts: liveTexts.length }
}

function wrap(inner: string) {
  return `<div dir="rtl" style="direction:rtl;text-align:right;font-family:Arial,'Segoe UI',sans-serif;font-size:16px;line-height:1.75;color:#141518;max-width:720px">${inner}</div>`
}

function chunks(blocks: string[]): string[] {
  const out: string[] = []
  let cur = ''
  for (const b of blocks) {
    if (cur && cur.length + b.length > MAX_CHARS) { out.push(cur); cur = '' }
    cur += b
  }
  if (cur) out.push(cur)
  return out
}

async function sendTo(base44: any, entities: any, email: string) {
  const { blocks, books, texts } = await collect(entities, email)
  if (!blocks.length) return 0
  const date = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'long', year: 'numeric' })
  const what = books.length === 1 ? `"${esc(books[0].title || 'הספר')}"` : books.length > 1 ? `${books.length} הספרים שלך` : ''
  const intro = `<p style="color:#555;margin:0 0 28px">זה הגיבוי של ${what}${what && texts ? ' ו' : ''}${texts ? 'הטקסטים שלך' : ''} ממכתוב, נכון ל־${date}. אפשר להעתיק את כל המייל לוורד או לגוגל דוקס, והעיצוב נשמר.</p>`
  const subject = books.length === 1 ? `גיבוי: ${books[0].title || 'הספר'} · ${date}` : `גיבוי מכתוב · ${date}`
  const send = (subj: string, html: string) => base44.asServiceRole.integrations.Core.SendEmail({ to: email, subject: subj, body: wrap(html), from_name: 'מכתוב' })
  // One email with everything. Only if the mail service refuses it as too large, send it in parts.
  try {
    await send(subject, intro + blocks.join(''))
    return 1
  } catch (e) {
    if (!/size|large|limit|too long|413/i.test(String((e as Error)?.message || e))) throw e
    const parts = chunks(blocks)
    for (let i = 0; i < parts.length; i++) {
      await send(`${subject} (חלק ${i + 1} מתוך ${parts.length})`, (i === 0 ? intro : '') + parts[i])
    }
    return parts.length
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
