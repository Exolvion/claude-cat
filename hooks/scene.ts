// The cat's poses and the pictures made from them: the room, and the cat on
// the prompt line with its thought bubble and bowl. Pure: no engine calls,
// so the drawings can be rendered and checked on their own.

import type { CatData, Look } from '../types'
import { FISH, HEART, HEART_S, YARN, YARN_S, bowl, draw, drawBig, drawMini, drawSitting, drawSmall, glyph, layer, setPx } from './sprites'
import type { CatPose, Layer } from './sprites'

export type Act = 'eating' | 'treat' | 'purring' | 'playing' | 'startled' | 'swat'
export type Kind = Act | 'idle' | 'watching' | 'asleep'
export type Need = 'hungry' | 'sleepy' | 'bored' | null
export type Pose = CatPose & {
  kind: Kind; shake?: number; hop?: number; yarnX?: number; hearts?: number
  zz?: boolean; bang?: boolean; nom?: boolean; front?: boolean; fish?: boolean
}

/* ---------- poses ---------- */

const YARN_PATH = [1, 4, 7, 10, 13, 16, 19, 22, 25, 22, 19, 16, 13, 10, 7, 4]

export function poseFor(k: Kind, f: number, t = 0): Pose {
  switch (k) {
    case 'watching': return { kind: k, eyes: 'open', look: (f >> 2) % 3 === 2 ? 0 : -1, tail: f % 8 < 4 ? 'low' : 'flick' }
    case 'eating': return { kind: k, eyes: 'happy', tail: 'low', dy: f % 2 ? 2 : 1, nom: f % 2 === 0, front: true }
    case 'treat': return { kind: k, eyes: 'happy', tail: f % 4 < 2 ? 'up' : 'flick', dy: f % 2 ? 2 : 1, nom: f % 2 === 0, fish: true, blush: true }
    case 'purring': return { kind: k, eyes: 'happy', tail: f % 4 < 2 ? 'up' : 'flick', blush: true, hearts: t }
    case 'playing': {
      const x = YARN_PATH[f % YARN_PATH.length] ?? 1
      return { kind: k, eyes: 'open', look: x < 10 ? -1 : x > 20 ? 1 : 0, tail: 'flick', hop: f % 4 === 1 ? 1 : 0, yarnX: x }
    }
    case 'startled': return { kind: k, eyes: 'wide', tail: 'puff', shake: f % 8 < 4 ? (f % 2 ? 1 : -1) : 0, bang: true }
    case 'swat': return { kind: k, eyes: 'wide', tail: 'low', shake: f % 2, bang: true }
    case 'asleep': return { kind: k, eyes: 'sleep', tail: 'low', dy: (f >> 2) % 2, zz: true }
    default: {
      const blink = f % 17 === 0 || f % 41 === 0
      return { kind: 'idle', eyes: blink ? 'blink' : 'open', tail: (f >> 1) % 7 === 3 ? 'flick' : 'up' }
    }
  }
}

/** What the cat wants, shown in its thought bubble while it is idle or watching. */
export function needOf(c: CatData, kind: Kind): Need {
  if (kind !== 'idle' && kind !== 'watching') return null
  if (c.hunger < 30) return 'hungry'
  if (c.energy < 25) return 'sleepy'
  if (c.mood < 35) return 'bored'
  return null
}

/* ---------- words ---------- */

export function moodWord(kind: Kind, need: Need): string {
  switch (kind) {
    case 'eating': return 'eating'
    case 'treat': return 'eating a treat'
    case 'purring': return 'purring'
    case 'playing': return 'playing'
    case 'startled': return 'startled'
    case 'swat': return 'grumpy'
    case 'asleep': return 'asleep'
    case 'watching': return need ?? 'watching Claude'
  }
  return need ?? 'loafing'
}

export function phrase(kind: string, c: CatData): string {
  switch (kind) {
    case 'eating': return 'is crunching kibble'
    case 'treat': return 'is eating a fish treat'
    case 'purring': return 'is purring'
    case 'playing': return 'is chasing the yarn'
    case 'startled': return 'jumped at that error'
    case 'swat': return 'swatted your cursor'
    case 'asleep': return 'is asleep. Send a prompt to wake it'
    case 'watching': return 'is watching Claude work'
  }
  if (c.hunger < 30) return c.bowl ? `is hungry. The bowl has ${c.bowl} kibble` : 'is hungry and the bowl is empty'
  if (c.energy < 25) return 'is getting sleepy'
  if (c.mood < 35) return 'is bored. Try playing'
  if (c.mood >= 75) return 'is loafing happily'
  return 'is loafing'
}

/* ---------- shared marks ---------- */

type Marks = { z: string; bang: string; nom: string }
type Spots = { small?: boolean; heartX: number; heartY: number; zz: [number, number][]; bang: [number, number]; nom: [number, number] }
const DAY_MARKS: Marks = { z: '#5d6db0', bang: '#d98a00', nom: '#8b5e3c' }
const NIGHT_MARKS: Marks = { z: '#c7cff9', bang: '#ffd23f', nom: '#e8d6bf' }
const BAND_MARKS: Marks = { z: '#8fa0e8', bang: '#f2b13a', nom: '#d9925a' }

function extras(L: Layer, p: Pose, f: number, at: Spots, m: Marks): void {
  if (p.hearts !== undefined) {
    const t0 = p.hearts
    ;[0, 700].forEach((lag, i) => {
      const t = t0 - lag
      if (t < 0) return
      const y = at.heartY - Math.floor(t / 220)
      if (y > -6) draw(L, at.small ? HEART_S : HEART, at.heartX + i * 3, y)
    })
  }
  if (p.zz) at.zz.slice(0, (f >> 1) % 4).forEach(([x, y], i) => glyph(L, x, y, i === 2 ? 'Z' : 'z', m.z))
  if (p.bang) glyph(L, at.bang[0], at.bang[1], '!', m.bang)
  if (p.nom) 'nom'.split('').forEach((ch, i) => glyph(L, at.nom[0] + i, at.nom[1], ch, m.nom))
}

/* ---------- the room ---------- */

export const ROOM_COLS = 38
export const ROOM_ROWS = 10
const DAY = {
  wall: '#f1e0c6', dot: '#e6cfac', base: '#d6b98f', floor: '#c88d5b', seam: '#ab7443', frame: '#8b5e3c',
  sky: '#9fd8f6', cloud: '#ffffff', sun: '#ffd66b', cush: '#8fb0e6', cushD: '#6f8fd0',
}
const NIGHT = {
  wall: '#2d2a49', dot: '#37335b', base: '#24213b', floor: '#4a3848', seam: '#3a2c39', frame: '#4f4268',
  sky: '#121a3c', star: '#ffe9a8', moon: '#fff2bd', cush: '#4f5f9e', cushD: '#3f4d85',
}

export function isNight(hour = new Date().getHours()): boolean {
  return hour < 7 || hour >= 19
}

export function roomLayer(p: Pose, f: number, cat: CatData, night = isNight()): Layer {
  const W = ROOM_COLS, H = ROOM_ROWS * 2, L = layer(W, H)
  const C = night ? NIGHT : DAY
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c: string
      if (y < 14) c = (x % 6 === 3 && y % 6 === 1) || (x % 6 === 0 && y % 6 === 4) ? C.dot : C.wall
      else if (y === 14) c = C.base
      else if (y === 17) c = C.seam
      else if (y < 17) c = x === 8 || x === 21 || x === 33 ? C.seam : C.floor
      else c = x === 3 || x === 15 || x === 27 ? C.seam : C.floor
      setPx(L, x, y, c)
    }
  }
  for (let y = 2; y <= 10; y++) {
    for (let x = 1; x <= 9; x++) setPx(L, x, y, y === 2 || y === 10 || x === 1 || x === 9 || x === 5 || y === 6 ? C.frame : C.sky)
  }
  if (night) {
    for (const [x, y] of [[7, 3], [8, 3], [8, 4]] as const) setPx(L, x, y, NIGHT.moon)
    for (const [x, y, k] of [[2, 4, 0], [3, 8, 2], [7, 8, 4], [6, 4, 1]] as const) if ((f + k) % 6 < 4) setPx(L, x, y, NIGHT.star)
  } else {
    for (const [x, y] of [[2, 4], [3, 4], [4, 4], [3, 3]] as const) setPx(L, x, y, DAY.cloud)
    for (const [x, y] of [[7, 3], [8, 3], [7, 4], [8, 4]] as const) setPx(L, x, y, DAY.sun)
  }
  for (let x = 12; x <= 25; x++) setPx(L, x, 17, C.cush)
  for (let x = 10; x <= 27; x++) setPx(L, x, 18, C.cush)
  for (let x = 11; x <= 26; x++) setPx(L, x, 19, C.cushD)
  if (p.yarnX === undefined) draw(L, YARN, 2, 15)
  drawBig(L, 9 + (p.shake ?? 0), 2 - (p.hop ?? 0), cat.coat, p)
  if (p.yarnX !== undefined) draw(L, YARN, p.yarnX, 15)
  draw(L, bowl(cat.bowl), p.front ? 14 : 30, 16)
  if (p.fish) draw(L, FISH, 16, 16)
  extras(L, p, f, { heartX: 28, heartY: 9, zz: [[28, 3], [30, 2], [32, 1]], bang: [29, 1], nom: [2, 6] }, night ? NIGHT_MARKS : DAY_MARKS)
  return L
}

/* ---------- the prompt line ---------- */

// Left to right with the cat on the right side: thought bubble, cat, bowl.
// On the left side the order flips, so the bubble stays on the open side.
export const BAND_COLS = 26
export const bandRows = (look: Look): number => ({ big: 4, sit: 5, tall: 6 } as Partial<Record<Look, number>>)[look] ?? 3

const BUBBLE = ['.VVVVV.', 'VWWWWWV', 'VWWWWWV', 'VWWWWWV', '.VVVVV.']
const BUBBLE_INK = { V: '#9aa0b5', W: '#f7f7fb', F: '#2f6fd6' }

function miniBowl(n: number): string[] {
  let top = ''
  for (let i = 0; i < 5; i++) top += i < n ? (i % 2 ? 'J' : 'K') : '.'
  return [top, 'BBBBB', '.DDD.']
}

export function bandLayer(p: Pose, f: number, cat: CatData, need: Need): Layer {
  const rows = bandRows(cat.look)
  const H = rows * 2
  const L = layer(BAND_COLS, H)
  const right = cat.side === 'right'
  const bubbleX = right ? 0 : 19
  const catX = right ? 7 : 6
  const bowlX = right ? 21 : 0
  const x = catX + (p.shake ?? 0)
  if (cat.look === 'sit' || cat.look === 'tall') drawSitting(L, x, 0, cat.coat, p, cat.look)
  else (cat.look === 'big' ? drawSmall : drawMini)(L, x, 0, cat.coat, p)
  draw(L, miniBowl(cat.bowl), bowlX, H - 3)
  if (need) {
    draw(L, BUBBLE, bubbleX, 0, BUBBLE_INK)
    if (need === 'hungry') '><>'.split('').forEach((ch, i) => glyph(L, bubbleX + 2 + i, 1, ch, BUBBLE_INK.F))
    else if (need === 'bored') draw(L, YARN_S, bubbleX + 2, 1)
    else { glyph(L, bubbleX + 2, 1, 'z', BAND_MARKS.z); glyph(L, bubbleX + 4, 1, 'Z', BAND_MARKS.z) }
  }
  if (p.yarnX !== undefined) draw(L, YARN_S, bubbleX + Math.min(4, Math.round(p.yarnX / 6)), H - 3)
  extras(L, p, f, {
    small: true, heartX: bubbleX + 1, heartY: H - 3,
    zz: [[bubbleX + 1, rows - 2], [bubbleX + 3, Math.max(0, rows - 3)], [bubbleX + 5, Math.max(0, rows - 4)]],
    bang: [right ? bubbleX + 6 : bubbleX, 0], nom: [bubbleX + 1, rows - 2],
  }, BAND_MARKS)
  return L
}

// The text looks: three lines of line art, or a one-line face.
const TEXT_EYES: Record<CatPose['eyes'], string> = { open: '•ω•', blink: '-ω-', happy: '^ω^', sleep: '-ω-', wide: '°ω°' }
const NEED_TEXT: Record<Exclude<Need, null>, string> = { hungry: '><>', sleepy: 'z', bored: 'o?' }

export function asciiCat(p: Pose, need: Need): string[] {
  const e = TEXT_EYES[p.eyes]
  const face = p.look === -1 ? `(${e}  )` : p.look === 1 ? `(  ${e})` : `( ${e} )`
  const tail = p.tail === 'up' ? '~' : p.tail === 'flick' ? 'S' : p.tail === 'puff' ? '#' : '_'
  const top = p.zz ? '  z Z' : p.bang ? '   !' : p.hearts !== undefined ? '   ♡' : need ? `  ${NEED_TEXT[need]}` : ''
  return [` /\\_/\\${top}`, `${face}${p.nom ? ' nom' : ''}`, `(")_(")${tail}`]
}

export function faceCat(p: Pose, need: Need): string {
  const end = p.zz ? ' zz' : p.bang ? '!' : p.hearts !== undefined ? ' ♡' : p.nom ? ' nom' : p.yarnX !== undefined ? ' o' : need ? ` ${NEED_TEXT[need]}` : ''
  return `(=${TEXT_EYES[p.eyes]}=)${end}`
}
