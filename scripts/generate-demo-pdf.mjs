/**
 * Generates the local demo document used by the notes viewer.
 *
 * The viewer always asks the content service for a document reference.
 * Until the Django backend issues short-lived signed URLs, the mock
 * service answers with this bundled file so the viewer is genuinely
 * exercisable offline. No production PDF URL exists in the codebase.
 *
 *   node scripts/generate-demo-pdf.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '..', 'public', 'samples', 'real-numbers-notes.pdf')

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 56

/** Escapes a string for a PDF literal-string object. */
const esc = (value) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

/**
 * Lays out a block of text on one page and returns its content stream.
 * Lines are wrapped at `maxWidth` using an approximate Helvetica advance.
 */
function wrap(text, maxWidth, charWidth = 4.62) {
  const perLine = Math.max(1, Math.floor(maxWidth / charWidth))
  const words = text.split(/\s+/)
  const lines = []
  let line = ''

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length <= perLine) {
      line = candidate
    } else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

function contentStream(blocks) {
  let y = PAGE_H - MARGIN
  const parts = []

  const write = (text, { font = 'F1', size = 11, colour = [0.12, 0.16, 0.24], gap = 0 } = {}) => {
    y -= gap
    parts.push(
      `BT /${font} ${size} Tf ${colour[0]} ${colour[1]} ${colour[2]} rg 1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm (${esc(text)}) Tj ET`,
    )
    y -= size * 1.45
  }

  const rule = (colour = [0.88, 0.91, 0.96], gap = 6, thickness = 1) => {
    y -= gap
    parts.push(
      `${colour[0]} ${colour[1]} ${colour[2]} rg ${MARGIN} ${y.toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${y.toFixed(2)} l ${thickness} w S`,
    )
    y -= 4
  }

  const rect = (colour, height) => {
    parts.push(
      `${colour[0]} ${colour[1]} ${colour[2]} rg ${MARGIN} ${y.toFixed(2)} ${PAGE_W - MARGIN * 2} ${height} re f`,
    )
  }

  for (const block of blocks) {
    if (block.spacer) {
      y -= block.spacer
      continue
    }

    if (block.rule) {
      rule(block.ruleColour ?? [0.88, 0.91, 0.96], block.ruleGap ?? 8, block.ruleWeight ?? 1)
      continue
    }

    if (block.box) {
      rect(block.boxColour ?? [0.96, 0.97, 1], block.boxHeight ?? 20)
      y -= 12
    }

    if (block.title) {
      write(block.title, { font: 'F2', size: block.titleSize ?? 20, colour: [0.06, 0.11, 0.23], gap: block.titleGap ?? 4 })
    }

    if (block.subtitle) {
      write(block.subtitle, { font: 'F1', size: 12, colour: [0.35, 0.4, 0.52] })
    }

    if (block.heading) {
      write(block.heading, {
        font: 'F2',
        size: 13,
        colour: [0.05, 0.16, 0.51],
        gap: block.headingGap ?? 6,
      })
    }

    if (block.body) {
      for (const line of wrap(block.body, PAGE_W - MARGIN * 2)) write(line)
    }

    if (block.bullets) {
      for (const bullet of block.bullets) {
        // Written as a real U+2013; Buffer.from(...,'latin1') maps it to 0x96,
        // which is the WinAnsiEncoding code point for an en dash.
        parts.push(
          `BT /F2 11 Tf 0.05 0.39 0.9 rg 1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm (\u2013) Tj ET`,
        )
        y -= 15.9
        for (const line of wrap(bullet, PAGE_W - MARGIN * 2 - 14, 4.5)) {
          parts.push(
            `BT /F1 11 Tf 0.12 0.16 0.24 rg 1 0 0 1 ${MARGIN + 14} ${y.toFixed(2)} Tm (${esc(line)}) Tj ET`,
          )
          y -= 15.9
        }
      }
    }

    if (block.spacerAfter) y -= block.spacerAfter
  }

  return parts.join('\n')
}

/* ---------------------------------------------------------------------
   Content — mirrors the reference page ("Real Numbers")
   ------------------------------------------------------------------ */

const CHAPTER_BLOCKS = [
  [
    {
      box: true,
      boxColour: [0.93, 0.96, 1],
      boxHeight: 96,
      title: 'Chapter 1',
      titleSize: 15,
      titleGap: 2,
      subtitle: 'Real Numbers',
      spacerAfter: 16,
    },
    {
      heading: '1.1  Introduction',
      headingGap: 2,
      body: 'The chapter Real Numbers deals with the set of numbers which are commonly used in our day-to-day life. It also tries to explain the different types of numbers and the properties that govern them.',
      spacerAfter: 4,
    },
    {
      heading: 'Important Points',
      bullets: [
        'Real numbers include all rational and irrational numbers.',
        'Rational numbers can be written in the form p/q, where p is an integer and q is a non-zero natural number.',
        'Irrational numbers cannot be written in the form p/q.',
        'There exist rational numbers which are not natural numbers, and natural numbers which are not rational numbers.',
        'Examples: sqrt(2), pi, 3, and 0 are all real numbers.',
      ],
      spacerAfter: 10,
    },
    {
      heading: '1.2  Rational Numbers',
      body: 'A number which can be written in the form p/q, where p is an integer, q is a natural number and q is not equal to zero, is called a rational number. The set of rational numbers is denoted by the symbol Q.',
      spacerAfter: 4,
    },
    {
      bullets: [
        'Examples of rational numbers: 0.333..., 2/3, -7/5, 0, 5, -2, 0.2',
        'Every integer is rational, because it can be written as p/1.',
        'A rational number can be terminating or non-terminating in its decimal form.',
      ],
      spacerAfter: 8,
    },
    {
      heading: '1.3  Irrational Numbers',
      body: 'Another important class of numbers is the set of irrational numbers. If x is not a rational number, then it is irrational. The set of irrational numbers is usually denoted by I.',
      spacerAfter: 4,
    },
    {
      bullets: [
        'sqrt(2), sqrt(5), sqrt(3) are all irrational.',
        'The decimal expansion of an irrational number is non-terminating and non-repeating.',
        'There is no general way of knowing whether a given number is irrational.',
      ],
    },
  ],
  [
    {
      heading: '1.6  Worked Examples',
      headingGap: 4,
      body: 'Example 1. Express 0.333... in the form p/q, where p is an integer and q is a natural number.',
      spacerAfter: 2,
    },
    {
      bullets: [
        'Let x = 0.333...',
        '10x = 3.333...',
        'Subtracting, 10x - x = 3.333... - 0.333...',
        'Therefore 9x = 3 and x = 3/9 = 1/3.',
      ],
      spacerAfter: 8,
    },
    {
      body: 'Example 2. Prove that sqrt(5) is irrational.',
      spacerAfter: 2,
    },
    {
      bullets: [
        'Assume, to the contrary, that sqrt(5) is rational.',
        'Then sqrt(5) = a/b, where a and b are coprime integers and b is not 0.',
        'Squaring, 5 = a^2 / b^2, so a^2 = 5b^2.',
        'This forces 5 to divide a^2, hence 5 divides a, so a = 5c.',
        'Then 25c^2 = 5b^2, giving b^2 = 5c^2, so 5 divides b as well.',
        'This contradicts the assumption that a and b are coprime.',
        'Therefore sqrt(5) is irrational.',
      ],
      spacerAfter: 10,
    },
    {
      rule: true,
      ruleGap: 10,
    },
    {
      heading: '1.7  Practice Set',
      bullets: [
        'State whether each of the following is rational or irrational: 7/9, 0.121212..., sqrt(11), 2.6456756..., 0.',
        'Find three rational and three irrational numbers between 1 and 2.',
        'Prove that sqrt(3) is irrational.',
        'Express 0.101010... in the form p/q.',
        'Is every natural number a rational number? Justify your answer.',
        'Show that 5 + 3sqrt(2) is irrational.',
      ],
    },
  ],
  [
    {
      title: 'Chapter 1 — Quick Revision',
      titleSize: 20,
      titleGap: 6,
      subtitle: 'Formula and definition sheet',
      spacerAfter: 14,
    },
    {
      box: true,
      boxColour: [0.96, 0.98, 0.95],
      boxHeight: 150,
      heading: 'Important Formulas',
      headingGap: 2,
      bullets: [
        'p/q, where p is an integer and q is a non-zero natural number, defines a rational number.',
        'A decimal that terminates is rational; a non-terminating repeating decimal is rational.',
        'A non-terminating, non-repeating decimal is irrational.',
        'n is a perfect square if n = m^2 for some integer m; then sqrt(n) is rational.',
        'If n is not a perfect square, sqrt(n) is irrational.',
        'The square root of a negative number is not real.',
      ],
      spacerAfter: 8,
    },
    {
      heading: 'Key Definitions',
      bullets: [
        'Rational number Q: numbers of the form p/q.',
        'Irrational number: any real number that is not rational.',
        'Real number R: Q together with the irrationals.',
        'Number line: an infinite line with a point for every real number.',
        'Positive and negative: every non-zero real number is either greater than or less than zero.',
      ],
      spacerAfter: 8,
    },
    {
      rule: true,
      ruleGap: 8,
    },
    {
      heading: 'Exam Tip',
      body: 'When a question asks you to prove a number is irrational, always begin with a contradiction and finish by showing two coprime integers share a factor.',
    },
  ],
  [
    {
      title: 'NCERT Solutions',
      titleSize: 20,
      titleGap: 6,
      subtitle: 'Step-by-step solutions to the exercise questions',
      spacerAfter: 14,
    },
    {
      heading: 'Exercise 1.1 — Question 1',
      body: 'Express each number in the form p/q, where p is an integer and q is a natural number and q is not equal to zero.',
      spacerAfter: 2,
    },
    {
      bullets: [
        '0.333... : Let x = 0.333..., then 10x = 3.333..., so 9x = 3 and x = 1/3.',
        '0.272727... : Let x = 0.2727..., then 100x = 27.2727..., so 99x = 27 and x = 3/11.',
        '0.454545... : Let x = 0.4545..., then 10x = 4.5454..., so 9x = 4 and x = 4/9.',
        '0.818181... : Let x = 0.8181..., then 100x = 81.8181..., so 99x = 81 and x = 9/11.',
      ],
      spacerAfter: 10,
    },
    {
      heading: 'Exercise 1.1 — Question 2',
      body: 'Classify the following numbers as rational or irrational.',
      spacerAfter: 2,
    },
    {
      bullets: [
        'sqrt(2), sqrt(5), sqrt(11), sqrt(15), sqrt(21) are all irrational (none is a perfect square).',
        '2/3, 7/2, 0.5, 0.444..., 0.2727... are all rational.',
        'pi is irrational because its decimal expansion never terminates and never repeats.',
      ],
      spacerAfter: 10,
    },
    {
      rule: true,
      ruleGap: 8,
    },
    {
      body: 'Always state the substitution clearly. Marks are awarded for the setup, the linear equation and the final simplification — write all three.',
    },
  ],
  [
    {
      title: 'Extra Practice Questions',
      titleSize: 20,
      titleGap: 6,
      subtitle: 'With answer key',
      spacerAfter: 14,
    },
    {
      heading: 'Section A — One mark',
      bullets: [
        'Define a rational number.',
        'Give one example of an irrational number.',
        'Is 0 a rational number? Why?',
        'Write three rational numbers between 0 and 1.',
      ],
      spacerAfter: 8,
    },
    {
      heading: 'Section B — Two marks',
      bullets: [
        'Express 0.666... in the form p/q.',
        'Show that 2 + 5sqrt(3) is irrational.',
        'Find five rational numbers between 2 and 3.',
        'Find the smallest natural number n such that n + 1/2 is rational.',
      ],
      spacerAfter: 8,
    },
    {
      heading: 'Section C — Three marks',
      bullets: [
        'Prove that sqrt(6) is irrational.',
        'Find rational numbers between sqrt(2) and sqrt(3), giving reasons.',
        'Express 0.370370... in the form p/q and verify your answer.',
      ],
      spacerAfter: 8,
    },
    {
      box: true,
      boxColour: [0.97, 0.96, 1],
      boxHeight: 92,
      heading: 'Answer Key',
      headingGap: 2,
      bullets: [
        '0.666... = 2/3',
        '2 + 5sqrt(3) is irrational',
        'Rational examples between 2 and 3: 5/2, 11/4, 8/3, 21/8, 13/5',
        'sqrt(6) is irrational (6 is not a perfect square)',
        '0.370370... = 10/27',
      ],
    },
  ],
]

/* ---------------------------------------------------------------------
   Minimal PDF writer
   ------------------------------------------------------------------ */

function buildPdf(pages) {
  const objects = []
  const push = (body) => {
    objects.push(body)
    return objects.length // 1-based object number
  }

  // Reserve object 1 (catalog) and 2 (page tree); fill them in later.
  push(null)
  push(null)

  const fontRegular = push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  const fontBold = push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')

  const pageIds = []

  for (const blocks of pages) {
    const stream = contentStream(blocks)
    const contentId = push(
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    )

    const pageId = push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> ` +
        `/Contents ${contentId} 0 R >>`,
    )
    pageIds.push(pageId)
  }

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

  // Serialise with a byte-accurate xref table.
  let pdf = '%PDF-1.4\n'
  const offsets = [0]

  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })

  const xrefOffset = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(pdf, 'latin1')
}

/* ---------------------------------------------------------------------
   Run
   ------------------------------------------------------------------ */

const pdf = buildPdf(CHAPTER_BLOCKS)
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, pdf)

console.log(`Wrote ${OUT} (${CHAPTER_BLOCKS.length} pages, ${pdf.length} bytes)`)
