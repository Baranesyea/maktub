import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countWords, htmlToText, parseHebrewNumeral, toHebrewNumeral, normalizeHebrew, parseOrdinal } from '../../src/lib/text.js'

test('counts Hebrew words like Word does', () => {
  assert.equal(countWords('וכשהלכתי הביתה, ראיתי אותה.'), 4)
  assert.equal(countWords('  — ... '), 0)
  assert.equal(countWords('ב־2016 חזרתי'), 2)
  assert.equal(countWords('שָׁלוֹם עוֹלָם'), 2)
})
test('html to text keeps paragraph breaks', () => {
  assert.equal(countWords(htmlToText('<p>אחת שתיים</p><p>שלוש</p>')), 3)
  assert.equal(htmlToText('<p>a&amp;b</p>').trim(), 'a&b')
})
test('hebrew numerals', () => {
  assert.equal(parseHebrewNumeral('א׳'), 1)
  assert.equal(parseHebrewNumeral('י״א'), 11)
  assert.equal(parseHebrewNumeral('ט"ו'), 15)
  assert.equal(parseHebrewNumeral('ט״ז'), 16)
  assert.equal(parseHebrewNumeral('כ״ג'), 23)
  assert.equal(parseHebrewNumeral('שלום'), null)
  assert.equal(toHebrewNumeral(1), 'א׳')
  assert.equal(toHebrewNumeral(15), 'ט״ו')
  assert.equal(toHebrewNumeral(16), 'ט״ז')
  assert.equal(toHebrewNumeral(23), 'כ״ג')
  assert.equal(parseOrdinal('שלישי'), 3)
  assert.equal(parseOrdinal('ראשונה'), 1)
})
test('normalize hebrew punctuation', () => {
  assert.equal(normalizeHebrew('פרק י"א'), 'פרק י״א')
  assert.equal(normalizeHebrew('‏שלום‎'), 'שלום')
})
