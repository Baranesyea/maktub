// Builds a sample manuscript like the writer's Google Doc: a title, Heading 1 per chapter, plain text.
import fs from 'node:fs'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, FootnoteReferenceRun } from 'docx'
const P = (t) => new Paragraph({ bidirectional: true, children: [new TextRun({ text: t, rightToLeft: true })] })
const H = (t) => new Paragraph({ bidirectional: true, heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, rightToLeft: true })] })
const doc = new Document({
  footnotes: { 1: { children: [P('זה קרה באמת ב־1998')] } },
  sections: [{ children: [
    new Paragraph({ bidirectional: true, heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'הספר שלי', rightToLeft: true })] }),
    H('הבית'),
    new Paragraph({ bidirectional: true, children: [new TextRun({ text: 'הבית עמד בקצה הרחוב.', rightToLeft: true }), new FootnoteReferenceRun(1)] }),
    P('בחצר היה עץ תאנה.'),
    P('* * *'),
    P('בלילה שמעו את הים.'),
    H('הדרך'),
    P('נסענו צפונה בלי לדבר.'),
    H('הים'),
    P('הגלים היו גבוהים.'),
  ] }],
})
fs.writeFileSync(process.argv[2], await Packer.toBuffer(doc))
