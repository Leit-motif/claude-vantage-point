// The pictures an ask embeds, for the item card (issue 87). The card's body is a
// Client, which draws no bitmap, and `![alt](url)` in its text read as "!alt", so
// a ruling on something visual reached the person without the thing itself. The
// card now draws an item's pictures in a plain Svg under its text, the palette's
// one route for a bitmap (docs/palette.md, Svg). This module says which pictures
// an item holds, how the mod fetches each through the person's own `gh` login,
// and how one fits the pane. Pure: hooks/pictures.ts does the I/O.

export type Picture = { alt: string; url: string }

/** How one picture is fetched: by `gh api` for a repository file, by curl with the gh token for an upload, or from disk. */
export type Fetch =
  | { kind: 'contents'; repo: string; tries: { ref: string; path: string }[] }
  | { kind: 'attachment'; url: string }
  | { kind: 'web'; url: string }
  | { kind: 'file'; path: string }

const MARKDOWN = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g
const HTML = /<img\b[^>]*>/gi
const ATTRIBUTE = (name: string) => new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')

function attribute(tag: string, name: string): string {
  const found = ATTRIBUTE(name).exec(tag)
  return found === null ? '' : (found[2] ?? found[3] ?? '')
}

/** Every picture `markdown` embeds, `![alt](url)` and `<img src alt>`, in order, each url once. */
export function picturesOf(markdown: string): Picture[] {
  const found: { at: number; picture: Picture }[] = []
  for (const m of markdown.matchAll(MARKDOWN)) found.push({ at: m.index, picture: { alt: m[1]!.trim(), url: m[2]! } })
  for (const m of markdown.matchAll(HTML)) {
    const url = attribute(m[0], 'src')
    if (url !== '') found.push({ at: m.index, picture: { alt: attribute(m[0], 'alt').trim(), url } })
  }
  const seen = new Set<string>()
  return found
    .sort((a, b) => a.at - b.at)
    .map(one => one.picture)
    .filter(one => !seen.has(one.url) && seen.add(one.url))
}

/** `markdown` with its pictures taken out, for the text the card's body draws; a line left empty goes too. */
export function withoutPictures(markdown: string): string {
  return markdown
    .replace(MARKDOWN, '')
    .replace(HTML, '')
    .split('\n')
    .filter((line, i, lines) => line.trim() !== '' || (lines[i - 1] ?? '').trim() !== '')
    .join('\n')
    .trim()
}

/**
 * How to fetch `url`. A github.com blob or raw link becomes a contents read, which
 * works on a private repository where the web link answers 404; an upload under
 * github.com/user-attachments takes the gh token; any other https link is fetched
 * plainly. A path is read from disk, relative to `root` (the project) unless absolute.
 * Null for anything else.
 */
export function fetchOf(url: string, root: string): Fetch | null {
  const blob =
    /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(?:blob|raw)\/([^?#]+)/.exec(url) ??
    /^https:\/\/raw\.githubusercontent\.com\/([\w.-]+\/[\w.-]+)\/([^?#]+)/.exec(url)
  if (blob !== null) {
    // The link cannot say where a ref with slashes ends and the path begins, so each split is a try.
    const parts = decodeURIComponent(blob[2]!).split('/')
    const tries = parts.slice(1).map((_, i) => ({ ref: parts.slice(0, i + 1).join('/'), path: parts.slice(i + 1).join('/') }))
    return tries.length === 0 ? null : { kind: 'contents', repo: blob[1]!, tries }
  }
  if (/^https:\/\/github\.com\/user-attachments\/assets\/[\w-]+$/.test(url)) return { kind: 'attachment', url }
  if (/^https:\/\//.test(url)) return { kind: 'web', url }
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null
  const path = decodeURIComponent(url.replace(/^file:\/\//, ''))
  return { kind: 'file', path: path.startsWith('/') ? path : `${root.replace(/\/$/, '')}/${path}` }
}

/** The size a `width` by `height` picture draws at to fit `room` across and `tall` down, never past its own size. */
export function fit(width: number, height: number, room: number, tall: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  const scale = Math.min(room / width, tall / height, 1)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * The least share of the room's width a picture keeps when fitting its height would
 * shrink it further. Under it a tall mock's text goes unreadable (#124: three stacked
 * mocks drew 218pt wide on the card, their 11pt type at 4pt), so it draws across the
 * room instead, and the page scrolls by a picture's height, which earns it (ADR 0033).
 */
export const LEGIBLE = 0.6

/** `fit`, unless that shrinks the picture under LEGIBLE of the room's width: then the room's width, however tall. */
export function legible(width: number, height: number, room: number, tall: number): { width: number; height: number } {
  const fitted = fit(width, height, room, tall)
  const across = fit(width, height, room, Infinity)
  return fitted.width < across.width * LEGIBLE ? across : fitted
}

/**
 * The longest Svg source the desktop takes. One character more and it refuses the
 * pane's whole tree and draws its own "has not drawn" in its place (spell-hotbar-ng#12).
 */
export const SVG_MAX = 131_072

/**
 * The most base64 one picture's copy holds. The desktop also refuses a whole tree
 * whose pictures pass about 256 KiB (measured, #124: three Svgs of 256,176 base64
 * characters in all drew, four of 288,744 froze the pane on its last tree), and a
 * card draws at most two pictures, so each gets half of it, in one Svg.
 */
export const PICTURE_MAX = 120_000

/**
 * A plain Svg holding one PNG, JPEG or AVIF as a data URI, at `width` by `height`,
 * or null when it would pass SVG_MAX, since the desktop would then draw nothing in
 * the pane. One `href` only: the desktop draws it (docs/palette.md), and a second
 * copy in `xlink:href` halved what a picture could hold.
 */
export function pictureSvg(base64: string, width: number, height: number): string | null {
  // An AVIF opens with a box size, then `ftypavif`, which base64 spells from the sixth character on.
  const type = base64.startsWith('/9j/') ? 'jpeg' : base64.slice(5, 16) === 'GZ0eXBhdmlm' ? 'avif' : 'png'
  const uri = `data:image/${type};base64,${base64}`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<image width="${width}" height="${height}" preserveAspectRatio="none" href="${uri}"/>` +
    '</svg>'
  return svg.length > SVG_MAX ? null : svg
}

/** The cache file's name for `url`: FNV-1a over its UTF-16 units, so the same link is fetched once. */
export function nameOf(url: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < url.length; i++) hash = Math.imul(hash ^ url.charCodeAt(i), 0x01000193) >>> 0
  return `${hash.toString(16).padStart(8, '0')}-${url.length}`
}

/** The arguments FETCH_SCRIPT takes for one picture, after the cache name: its kind, then a contents read's endpoints or the one link or path. */
export function fetchArgs(fetch: Fetch): string[] {
  if (fetch.kind === 'contents') {
    return ['contents', ...fetch.tries.map(one => `repos/${fetch.repo}/contents/${one.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(one.ref)}`)]
  }
  return [fetch.kind, fetch.kind === 'file' ? fetch.path : fetch.url]
}

/**
 * Fetches one picture into the cache once, as a PNG at most 1280px wide (a pane at
 * 2x needs about 1200) and 4000px tall, and prints its file, width, height and the
 * base64 of the card's copy on four lines. The copy is the first that fits
 * PICTURE_MAX: the PNG, then AVIF at quality 85, 70 and 50, which keep a mock's
 * text clean where a JPEG rang (#124: #123's 1224 by 2020 mock is 117k characters
 * at 85); past them, the same ladder on a copy three quarters as wide. `$1` is the
 * cache name, `$2` the kind, the rest its arguments. The gh token stays inside the shell.
 */
export const FETCH_SCRIPT = `set -u
dir="$HOME/Library/Caches/vantage-point/pictures"
name=$1; kind=$2; shift 2
out="$dir/$name.wide.png"
view="$dir/$name.copy"
mkdir -p "$dir" || exit 3
size() { sips -g pixelWidth -g pixelHeight "$1" | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{print w, h}'; }
if [ ! -s "$out" ]; then
  rm -f "$view"
  tmp=$(mktemp "$dir/.fetch.XXXXXX") || exit 3
  ok=1
  case $kind in
    contents) for ep in "$@"; do gh api -H 'Accept: application/vnd.github.raw' "$ep" > "$tmp" 2>/dev/null && { ok=0; break; }; done ;;
    attachment) curl -fsSL --max-time 20 -H "Authorization: token $(gh auth token)" -o "$tmp" "$1" && ok=0 ;;
    web) curl -fsSL --max-time 20 -o "$tmp" "$1" && ok=0 ;;
    file) cp "$1" "$tmp" && ok=0 ;;
  esac
  if [ $ok -ne 0 ] || ! sips -s format png "$tmp" --out "$out" >/dev/null 2>&1; then rm -f "$tmp" "$out"; exit 4; fi
  rm -f "$tmp"
  set -- $(size "$out")
  if [ "$1" -gt 1280 ]; then sips --resampleWidth 1280 "$out" >/dev/null 2>&1; fi
  set -- $(size "$out")
  if [ "$2" -gt 4000 ]; then sips -Z 4000 "$out" >/dev/null 2>&1; fi
fi
set -- $(size "$out"); w=$1; h=$2
if [ ! -s "$view" ]; then
  most=${(PICTURE_MAX * 3) / 4}
  src="$dir/.copy.$$.png"; try="$dir/.copy.$$.try"
  cp "$out" "$src" || exit 3
  cw=$w; found=1
  while [ $cw -ge 200 ]; do
    if [ "$(wc -c < "$src")" -le $most ]; then cp "$src" "$view"; found=0; break; fi
    for q in 85 70 50; do
      sips -s format avif -s formatOptions $q "$src" --out "$try" >/dev/null 2>&1 || break
      if [ "$(wc -c < "$try")" -le $most ]; then mv "$try" "$view"; found=0; break; fi
    done
    [ $found -eq 0 ] && break
    cw=$((cw * 3 / 4))
    sips --resampleWidth $cw "$out" --out "$src" >/dev/null 2>&1 || break
  done
  rm -f "$src" "$try"
  [ $found -eq 0 ] || exit 5
fi
echo "$out"
echo "$w"
echo "$h"
base64 -i "$view" | tr -d '\\n'
`

export type Loaded = { file: string; width: number; height: number; base64: string }

/** FETCH_SCRIPT's output as a picture, or null when it is not four good lines. */
export function loadedOf(stdout: string): Loaded | null {
  const [file, width, height, base64] = stdout.split('\n')
  const w = Number(width)
  const h = Number(height)
  if (file === undefined || file === '' || !(w > 0) || !(h > 0) || base64 === undefined || !/^[A-Za-z0-9+/]+=*$/.test(base64)) return null
  return { file, width: w, height: h, base64 }
}
