// Pixel art for the cat, and the packing of pixels into terminal cells.
// Two pixels share one cell: the cell holds the upper half block, its
// foreground paints the top pixel and its background the bottom one.

import type { Coat } from '../types'

export type Palette = Record<string, string>
export type Layer = { w: number; h: number; px: (string | null)[][]; glyphs: Map<string, { ch: string; fg: string }> }
export type Cell = { ch: string; fg: string | null; bg: string | null }
export type Eyes = 'open' | 'blink' | 'happy' | 'sleep' | 'wide'
export type Tail = 'up' | 'flick' | 'low' | 'puff'
export type CatPose = { eyes: Eyes; tail: Tail; look?: number; dy?: number; blush?: boolean }

// Lowercase keys follow the coat. Uppercase keys are fixed prop colours.
// `t` is the colour the line-art and one-line cats are written in.
export const COATS: Record<Coat, Palette & { label: string; t: string }> = {
  tabby: { label: 'Tabby', t: '#f3a252', o: '#4a2614', f: '#f3a252', s: '#d27a2e', l: '#fff0d9', p: '#f6a5b8', b: '#ff8fa3', e: '#2a1a12', w: '#ffffff', n: '#e9708c', k: '#4a2614' },
  smoke: { label: 'Smoke', t: '#b4bccc', o: '#363b4a', f: '#a3abbd', s: '#7f889c', l: '#eef1f6', p: '#f2a7ba', b: '#ff9db0', e: '#20232c', w: '#ffffff', n: '#e27c95', k: '#363b4a' },
  midnight: { label: 'Midnight', t: '#a6abc6', o: '#6a6f8a', f: '#2f3140', s: '#262836', l: '#3b3e50', p: '#d98aa0', b: '#c97a8f', e: '#f5c84c', w: '#fffbe0', n: '#d98aa0', k: '#9aa0bd' },
  tuxedo: { label: 'Tuxedo', t: '#c9ccd8', o: '#5f6478', f: '#2c2e3a', s: '#23252f', l: '#f4f4f6', p: '#f0a3b6', b: '#ff9db0', e: '#8fd16a', w: '#f3ffe8', n: '#e9708c', k: '#9aa0bd' },
  cream: { label: 'Cream', t: '#e9c9a0', o: '#7a5a3e', f: '#fbead2', s: '#efcfa6', l: '#ffffff', p: '#f7b2c2', b: '#ffa0b2', e: '#3a2a20', w: '#ffffff', n: '#ee8aa2', k: '#7a5a3e' },
}
export const PROPS: Palette = {
  H: '#ff5f87', h: '#ffd0dc',
  R: '#e85a6a', r: '#b83c4f', Y: '#ffb3bd',
  B: '#5b8def', D: '#3a62c4', K: '#a8663a', J: '#d89a5c',
  M: '#a7d8a0', G: '#5fae6b',
}

function mirror(rows: string[]): string[] {
  return rows.map(r => r + r.split('').reverse().join(''))
}
function put(rows: string[], x: number, y: number, patch: string[]): string[] {
  const out = rows.slice()
  patch.forEach((line, dy) => {
    const row = (out[y + dy] ?? '').split('')
    line.split('').forEach((ch, dx) => { if (ch !== ' ') row[x + dx] = ch })
    out[y + dy] = row.join('')
  })
  return out
}

/* Big cat, 18 wide core plus tail, 17 tall: the room. */
const BIG_BASE = mirror([
  '.o.......', '.oo......', '.opo.....', '.oppooooo', '.offffsfs', 'offfffffs', 'offffffff', 'offffffff',
  'offffffff', 'ofbbfflln', 'offffflkl', '.offffflk', '..offfffl', '...offfll', '...offfll', '...ofolll', '....ooooo',
])
const EYES: Record<Exclude<Eyes, 'open'>, { l: string[]; r: string[] }> = {
  blink: { l: ['fff', ' kk', 'fff'], r: ['fff', 'kk ', 'fff'] },
  happy: { l: ['fff', 'fkf', 'kfk'], r: ['fff', 'fkf', 'kfk'] },
  sleep: { l: ['fff', 'fff', 'kkk'], r: ['fff', 'fff', 'kkk'] },
  wide: { l: ['wee', 'eee', 'eee'], r: ['wee', 'eee', 'eee'] },
}
const TAILS: Record<Tail, { x: number; y: number; rows: string[] }> = {
  up: { x: 14, y: 9, rows: ['......oo.', '.....osfo', '.....ofso', '.....osfo', '.oooooffo', '.fsffsffo', '.ffsfffo.', 'ooooooo..'] },
  flick: { x: 14, y: 9, rows: ['.......oo', '......osf', '.....ofso', '.....osfo', '.oooooffo', '.fsffsffo', '.ffsfffo.', 'ooooooo..'] },
  low: { x: 14, y: 13, rows: ['.........', '.ooooooo.', '.fsfsfsfo', 'oooooooo.'] },
  puff: { x: 14, y: 6, rows: ['.....ooo.', '....osfso', '....offfo', '....osfso', '....offfo', '....osfso', '....offfo', '.ooooffo.', '.fsfffso.', '.ffsffo..', 'ooooooo..'] },
}

/* Small cat, 13 wide, 8 tall: the prompt line. */
const SMALL_BASE = [
  '.o......o....', 'opoooooopo...', 'offfssfffo...', 'offffffffo...',
  'obffnnffbo...', 'offllllffo...', '.offllffo....', '..oooooo.....',
]
type Dot = [number, number, string]
const SMALL_EYES: Record<Exclude<Eyes, 'open'>, Dot[]> = {
  blink: [[2, 4, 'k'], [7, 4, 'k']],
  happy: [[2, 3, 'k'], [1, 4, 'k'], [3, 4, 'k'], [7, 3, 'k'], [6, 4, 'k'], [8, 4, 'k']],
  sleep: [[2, 4, 'k'], [3, 4, 'k'], [6, 4, 'k'], [7, 4, 'k']],
  wide: [[2, 3, 'e'], [3, 3, 'e'], [2, 4, 'e'], [3, 4, 'e'], [6, 3, 'e'], [7, 3, 'e'], [6, 4, 'e'], [7, 4, 'e']],
}
const SMALL_TAILS: Record<Tail, Dot[]> = {
  up: [[9, 6, 'o'], [10, 6, 'o'], [9, 5, 'f'], [10, 5, 'f'], [11, 5, 'o'], [10, 4, 'o'], [11, 4, 's'], [12, 4, 'o'], [10, 3, 'o'], [11, 3, 'f'], [12, 3, 'o'], [11, 2, 'o'], [8, 7, 'o']],
  flick: [[9, 6, 'o'], [10, 6, 'o'], [9, 5, 'f'], [10, 5, 'f'], [11, 5, 'o'], [10, 4, 'o'], [11, 4, 's'], [12, 4, 'o'], [11, 3, 'o'], [12, 3, 'f'], [12, 2, 'o'], [8, 7, 'o']],
  low: [[9, 6, 'o'], [10, 6, 'o'], [11, 6, 'o'], [12, 6, 'o'], [9, 7, 'f'], [10, 7, 's'], [11, 7, 'f'], [12, 7, 'o'], [8, 7, 'o']],
  puff: [[9, 6, 'o'], [9, 5, 'f'], [10, 5, 'o'], [9, 4, 's'], [10, 4, 'o'], [9, 3, 'f'], [10, 3, 'o'], [9, 2, 's'], [10, 2, 'o'], [9, 1, 'o'], [8, 7, 'o']],
}

/* Sitting cats: the small cat's head on a body, 13 wide, 10 or 12 tall: the
   prompt line in five or six rows. The tail curls up beside the body. */
const SIT_BODY = {
  sit: { head: 6, rows: ['offfllfffo', 'offfssfffo', 'offlfflffo', '.oooooooooo'] },
  tall: { head: 7, rows: ['offffffffo', 'offfssfffo', 'offffffffo', 'offlfflffo', '.oooooooooo'] },
}
// Rows counted up from the bottom one (0).
const SIT_TAILS: Record<Tail, Dot[]> = {
  up: [[11, -3, 'o'], [11, -2, 'f'], [10, -1, 'o'], [11, -1, 'f'], [10, 0, 'o']],
  flick: [[12, -3, 'o'], [11, -2, 'o'], [12, -2, 'f'], [10, -1, 'o'], [11, -1, 'f'], [10, 0, 'o']],
  low: [[10, 0, 'o'], [11, -1, 'o'], [12, -1, 'o'], [11, 0, 'f'], [12, 0, 's'], [13, 0, 'o']],
  puff: [[11, -4, 'o'], [12, -4, 'o'], [11, -3, 'f'], [12, -3, 's'], [11, -2, 's'], [12, -2, 'f'], [10, -1, 'o'], [11, -1, 'f'], [12, -1, 'o'], [10, 0, 'o']],
}

/* Mini cat, 13 wide, 6 tall: the prompt line in three rows. No outline, bigger eyes. */
const MINI_BASE = ['.f......f.', 'fpf....fpf', 'ffffssffff', 'ffffffffff', 'fbffnnffbf', '.ffllllff.']
const MINI_EYES: Record<Exclude<Eyes, 'open'>, Dot[]> = {
  blink: [[2, 3, 'k'], [3, 3, 'k'], [6, 3, 'k'], [7, 3, 'k']],
  happy: [[2, 2, 'k'], [3, 2, 'k'], [1, 3, 'k'], [4, 3, 'k'], [6, 2, 'k'], [7, 2, 'k'], [5, 3, 'k'], [8, 3, 'k']],
  sleep: [[2, 3, 'k'], [3, 3, 'k'], [6, 3, 'k'], [7, 3, 'k']],
  wide: [[2, 2, 'w'], [3, 2, 'e'], [2, 3, 'e'], [3, 3, 'e'], [6, 2, 'w'], [7, 2, 'e'], [6, 3, 'e'], [7, 3, 'e'], [1, 2, 'e'], [8, 2, 'e']],
}
const MINI_TAILS: Record<Tail, Dot[]> = {
  up: [[10, 4, 'f'], [11, 3, 'f'], [11, 2, 's'], [11, 1, 'f'], [9, 5, 'f'], [10, 5, 'f']],
  flick: [[10, 4, 'f'], [11, 3, 'f'], [12, 2, 's'], [12, 1, 'f'], [9, 5, 'f'], [10, 5, 'f']],
  low: [[9, 5, 'f'], [10, 5, 's'], [11, 5, 'f'], [12, 4, 'f']],
  puff: [[10, 5, 'f'], [10, 4, 's'], [10, 3, 'f'], [10, 2, 's'], [10, 1, 'f'], [11, 4, 'f'], [11, 3, 'f'], [11, 2, 'f']],
}

/* Props. */
export const HEART = ['.H.H.', 'HhHHH', 'HHHHH', '.HHH.', '..H..']
export const HEART_S = ['H.H', 'HHH', '.H.']
export const YARN = ['.RRR.', 'RYRRr', 'RRYRr', 'RRRrr', '.rrr.']
export const YARN_S = ['.RR', 'RYr', 'rr.']
export const FISH = ['.M..M', 'MGMMM', '.M..M']
export function bowl(n: number): string[] {
  const top = n > 0 ? '.' + 'KJKJKJ'.slice(0, Math.min(6, n + 1)).padEnd(6, '.') + '.' : '........'
  return [top, 'BBBBBBBB', '.BBBBBB.', '..DDDD..']
}

/* Layers. */
export function layer(w: number, h: number): Layer {
  const px: (string | null)[][] = []
  for (let y = 0; y < h; y++) px.push(new Array<string | null>(w).fill(null))
  return { w, h, px, glyphs: new Map() }
}
export function setPx(L: Layer, x: number, y: number, c: string | undefined): void {
  const row = L.px[y]
  if (c && row && x >= 0 && x < L.w) row[x] = c
}
export function draw(L: Layer, rows: string[], x: number, y: number, pal: Palette = {}): void {
  rows.forEach((line, dy) => {
    for (let dx = 0; dx < line.length; dx++) {
      const ch = line[dx] ?? '.'
      if (ch === '.' || ch === ' ') continue
      setPx(L, x + dx, y + dy, pal[ch] ?? PROPS[ch])
    }
  })
}
function dots(L: Layer, list: Dot[], x: number, y: number, pal: Palette): void {
  for (const [dx, dy, k] of list) setPx(L, x + dx, y + dy, pal[k] ?? PROPS[k])
}
export function glyph(L: Layer, cx: number, cy: number, ch: string, fg: string): void {
  L.glyphs.set(cx + ',' + cy, { ch, fg })
}

export function drawBig(L: Layer, x: number, y: number, coat: Coat, p: CatPose): void {
  const pal = COATS[coat]
  const t = TAILS[p.tail]
  draw(L, t.rows, x + t.x, y + t.y, pal)
  let rows = BIG_BASE
  const look = p.look ?? 0
  if (p.eyes === 'open') {
    rows = put(rows, 4 + look, 6, ['we', 'ee', 'ee'])
    rows = put(rows, 12 + look, 6, ['we', 'ee', 'ee'])
  } else {
    rows = put(rows, 3, 6, EYES[p.eyes].l)
    rows = put(rows, 12, 6, EYES[p.eyes].r)
  }
  if (p.blush) { rows = put(rows, 1, 9, ['bbb']); rows = put(rows, 14, 9, ['bbb']) }
  if (p.dy) {
    draw(L, rows.slice(12), x, y + 12, pal)
    draw(L, rows.slice(0, 12), x, y + p.dy, pal)
  } else {
    draw(L, rows, x, y, pal)
  }
}

export function drawSmall(L: Layer, x: number, y: number, coat: Coat, p: CatPose): void {
  const pal = COATS[coat]
  draw(L, SMALL_BASE, x, y, pal)
  dots(L, SMALL_TAILS[p.tail], x, y, pal)
  const look = p.look ?? 0
  if (p.eyes === 'open') dots(L, [[2 + look, 3, 'e'], [2 + look, 4, 'e'], [7 + look, 3, 'e'], [7 + look, 4, 'e']], x, y, pal)
  else dots(L, SMALL_EYES[p.eyes], x, y, pal)
}

export function drawSitting(L: Layer, x: number, y: number, coat: Coat, p: CatPose, size: 'sit' | 'tall'): void {
  const pal = COATS[coat]
  const body = SIT_BODY[size]
  draw(L, [...SMALL_BASE.slice(0, body.head), ...body.rows], x, y, pal)
  const bottom = y + body.head + body.rows.length - 1
  for (const [dx, dy, k] of SIT_TAILS[p.tail]) setPx(L, x + dx, bottom + dy, pal[k])
  const look = p.look ?? 0
  if (p.eyes === 'open') dots(L, [[2 + look, 3, 'e'], [2 + look, 4, 'e'], [7 + look, 3, 'e'], [7 + look, 4, 'e']], x, y, pal)
  else dots(L, SMALL_EYES[p.eyes], x, y, pal)
}

export function drawMini(L: Layer, x: number, y: number, coat: Coat, p: CatPose): void {
  const pal = COATS[coat]
  draw(L, MINI_BASE, x, y, pal)
  dots(L, MINI_TAILS[p.tail], x, y, pal)
  const k = p.look ?? 0
  if (p.eyes === 'open') {
    dots(L, [[2 + k, 2, 'w'], [3 + k, 2, 'e'], [2 + k, 3, 'e'], [3 + k, 3, 'e'], [6 + k, 2, 'w'], [7 + k, 2, 'e'], [6 + k, 3, 'e'], [7 + k, 3, 'e']], x, y, pal)
  } else {
    dots(L, MINI_EYES[p.eyes], x, y, pal)
  }
}

/* Layer to cells, and cells to a Raster's packed form. */
export function toCells(L: Layer): Cell[][] {
  const out: Cell[][] = []
  for (let cy = 0; cy < Math.ceil(L.h / 2); cy++) {
    const line: Cell[] = []
    for (let cx = 0; cx < L.w; cx++) {
      const top = L.px[cy * 2]?.[cx] ?? null
      const bot = L.px[cy * 2 + 1]?.[cx] ?? null
      const g = L.glyphs.get(cx + ',' + cy)
      if (g) line.push({ ch: g.ch, fg: g.fg, bg: bot ?? top })
      else if (top && bot) line.push({ ch: '▀', fg: top, bg: bot })
      else if (top) line.push({ ch: '▀', fg: top, bg: null })
      else if (bot) line.push({ ch: '▄', fg: bot, bg: null })
      else line.push({ ch: ' ', fg: null, bg: null })
    }
    out.push(line)
  }
  return out
}

const DEFAULT_COLOR = 0x01000000
function rgb(hex: string | null): number {
  return hex ? parseInt(hex.slice(1), 16) : DEFAULT_COLOR
}
/** Packs a layer as RasterProps.cells: base64 of u32 [codePoint, fg, bg] per cell. */
export function encode(L: Layer): string {
  const cells = toCells(L)
  const words = new Uint32Array(L.w * cells.length * 3)
  let i = 0
  for (const line of cells) {
    for (const c of line) {
      words[i++] = c.ch.codePointAt(0) ?? 32
      words[i++] = rgb(c.fg)
      words[i++] = rgb(c.bg)
    }
  }
  return base64(new Uint8Array(words.buffer))
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0, b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}
