/** Text made safe inside an SVG source, as an element's text or an attribute's value. */
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// SF at 11px, each printable ASCII character's advance, as Chromium on this Mac measures it (canvas
// measureText, 2026-10-19): a label's sum lands within a pixel of the drawn width.
const SF11 = ('3.2 3.5 5.3 7.0 7.0 10.2 7.9 3.3 4.3 4.3 5.2 7.0 3.3 5.2 3.3 3.4 7.0 5.2 6.7 7.0 7.1 6.9 7.1 6.3 7.1 7.1 3.3 3.3 ' +
  '7.0 7.0 7.0 5.7 10.2 7.5 7.3 7.9 8.1 6.6 6.4 8.3 8.2 3.0 6.0 7.3 6.3 9.7 8.2 8.6 7.0 8.6 7.2 7.1 7.0 8.2 7.5 10.7 7.5 7.3 ' +
  '7.3 4.3 3.4 4.3 7.0 6.5 5.6 6.1 6.8 6.2 6.8 6.3 4.0 6.8 6.5 2.8 2.8 6.0 2.9 9.6 6.5 6.6 6.8 6.8 4.2 5.8 4.1 6.5 6.0 8.6 5.8 ' +
  '6.0 6.0 4.3 2.9 4.3 7.0').split(' ').map(Number)
/** The width of `text` in SF at `size` px, from the table above; a character outside it counts as 7 at 11px. */
export const sfWidth = (text: string, size: number) => [...text].reduce((sum, c) => sum + (SF11[c.charCodeAt(0) - 32] ?? 7), 0) * (size / 11)
