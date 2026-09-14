/**
 * The two pure pieces of laying text onto a PDF page.
 *
 * They live here, free of any DOM or library import, for the same reason the
 * fingerprints do: a claim that only holds inside a React component is a claim
 * nothing can check. `tests/run-tool-tests.mjs` compiles this file on its own
 * and proves both properties against real font metrics.
 */

/** Anything that can measure text — pdf-lib's fonts satisfy this. */
export type Measurable = { widthOfTextAtSize: (text: string, size: number) => number };

/**
 * Make text safe for a standard PDF font.
 *
 * pdf-lib's built-in fonts encode WinAnsi and THROW on anything outside it —
 * an em dash typed in Word is fine, a Chinese character is an exception. A
 * crash on one stray character, after somebody waited through a conversion on
 * a slow phone, is the worst outcome available. So the common typographic
 * substitutes are mapped to their plain equivalents and anything still
 * unencodable becomes a question mark: visible, and fixable by hand.
 *
 * The alternative — embedding a full Unicode font — adds roughly a megabyte to
 * the download for every visitor in order to serve the rare document. On a 3G
 * connection that trade goes the other way.
 */
export function toWinAnsi(text: string): string {
  const mapped = text
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2028\u2029]/g, " ");

  // Latin-1, plus the named characters WinAnsi adds in 0x80-0x9F. Everything
  // else has to go, and it has to go visibly.
  return mapped.replace(
    /[^\u0020-\u007E\u00A1-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/g,
    "?",
  );
}

/**
 * Greedy word wrap against the real font metrics rather than an estimate.
 *
 * A word longer than the line — a URL, a long reference number — is allowed to
 * overflow rather than being dropped or silently truncated. Losing part of a
 * reference number without saying so would be worse than a line that runs into
 * the margin, which the reader can at least see.
 */
export function wrapText(
  text: string,
  font: Measurable,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  return lines;
}

/**
 * Turn pdf.js text fragments into paragraphs.
 *
 * pdf.js reports where the renderer moved to a new line, never where a
 * paragraph ends. A blank line is the only paragraph signal a PDF really
 * gives, so consecutive lines are joined and a blank one starts a new
 * paragraph — which is what a person reading it aloud would do.
 */
export function paragraphsFromLines(raw: string): string[] {
  return raw
    .replace(/[ \t]+\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((block) => block.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim())
    .filter((block) => block.length > 0);
}
