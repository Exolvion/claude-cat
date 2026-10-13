#!/usr/bin/env node
// Renders the cat's drawings to PNG so art changes can be checked by eye
// without a terminal. It compiles hooks/sprites.ts and hooks/scene.ts with
// TypeScript, then paints their cells the way the terminal does: each cell is
// two pixels, the upper half block's foreground on top and background below.
//
// Usage: node tools/render.mjs            writes tools/out/*.png
//        node tools/render.mjs --docs     also refreshes docs/images/*.png

import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'tools', 'out')
mkdirSync(out, { recursive: true })

/* ---------- compile the drawing modules ---------- */

const build = mkdtempSync(join(tmpdir(), 'claude-cat-render-'))
const fwd = p => p.replaceAll('\\', '/')
writeFileSync(join(build, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'es2023', lib: ['es2023'], types: [], module: 'commonjs', moduleResolution: 'node',
    strict: true, skipLibCheck: true, outDir: fwd(join(build, 'js')), rootDir: fwd(root),
  },
  files: ['hooks/sprites.ts', 'hooks/scene.ts', 'types/index.d.ts'].map(f => fwd(join(root, f))),
}))
execSync(`npx -y -p typescript@5.6.3 tsc -p "${join(build, 'tsconfig.json')}"`, { stdio: 'inherit' })
const require = createRequire(import.meta.url)
const S = require(join(build, 'js', 'hooks', 'scene.js'))
const P = require(join(build, 'js', 'hooks', 'sprites.js'))

/* ---------- paint cells to a PNG ---------- */

// A 3x5 bitmap for the few text glyphs the drawings put in cells.
const FONT = {
  z: ['###', '..#', '.#.', '#..', '###'], Z: ['###', '..#', '.#.', '#..', '###'], '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  n: ['...', '##.', '#.#', '#.#', '#.#'], o: ['...', '.#.', '#.#', '#.#', '.#.'], m: ['...', '##.', '###', '#.#', '#.#'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'], '<': ['..#', '.#.', '#..', '.#.', '..#'],
}
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))

function sheet(panels, perRow, file, cw = 10, ch = 20) {
  const cols = Math.max(...panels.map(p => p.cells[0].length)), rows = Math.max(...panels.map(p => p.cells.length)), gap = 8
  const pw = cols * cw, ph = rows * ch
  const W = Math.min(perRow, panels.length) * (pw + gap) + gap, H = Math.ceil(panels.length / perRow) * (ph + gap) + gap
  const buf = Buffer.alloc(W * H * 3, 0x80)
  panels.forEach((p, i) => {
    const ox = gap + (i % perRow) * (pw + gap), oy = gap + Math.floor(i / perRow) * (ph + gap), bg = hex(p.bg)
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      const o = ((oy + y) * W + ox + x) * 3
      buf[o] = bg[0]; buf[o + 1] = bg[1]; buf[o + 2] = bg[2]
    }
    p.cells.forEach((line, cy) => line.forEach((c, cx) => {
      for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
        let col = c.bg ? hex(c.bg) : bg
        if (c.ch === '▀' && yy < ch / 2) col = hex(c.fg)
        if (c.ch === '▄' && yy >= ch / 2) col = hex(c.fg)
        const g = FONT[c.ch]
        if (g) {
          const fx = Math.floor((xx - 2) / 2), fy = Math.floor((yy - 2) / 3)
          if (fx >= 0 && fx < 3 && fy >= 0 && fy < 5 && g[fy][fx] === '#') col = hex(c.fg)
        }
        const o = ((oy + cy * ch + yy) * W + ox + cx * cw + xx) * 3
        buf[o] = col[0]; buf[o + 1] = col[1]; buf[o + 2] = col[2]
      }
    }))
  })
  const raw = Buffer.alloc((W * 3 + 1) * H)
  for (let y = 0; y < H; y++) buf.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3)
  const T = []
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0 }
  const crc = b => { let c = ~0; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0 }
  const chunk = (t, d) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(d.length)
    const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
    return Buffer.concat([l, td, c])
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2
  writeFileSync(join(out, file), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
  console.log('wrote', join('tools', 'out', file))
}

/* ---------- what to draw ---------- */

const DARK = '#0f1117', LIGHT = '#fafafa'
const cat = (patch = {}) => ({
  name: 'Mochi', coat: 'tabby', hunger: 70, mood: 80, energy: 70, bowl: 3, treats: 3, treatsDay: '', born: 0, savedAt: 0,
  hidden: false, look: 'small', spot: 'over', side: 'right', caption: 'mood', log: [], ...patch,
})
const cells = L => P.toCells(L)

// The room in each mood, by day and by night.
const moods = [['idle', 2], ['watching', 4], ['eating', 1], ['purring', 2], ['playing', 5], ['startled', 1], ['asleep', 6]]
const room = []
for (const night of [false, true]) {
  for (const [kind, f] of moods) room.push({ cells: cells(S.roomLayer(S.poseFor(kind, f, 500), f, cat({ bowl: 4 }), night)), bg: DARK })
}
sheet(room, 7, 'room.png', 6, 12)

// The prompt-line cat: each state, both pixel sizes, dark and light terminals.
const states = [['idle', {}], ['idle', { hunger: 20 }], ['idle', { energy: 15 }], ['idle', { mood: 20 }], ['purring', {}], ['eating', {}], ['asleep', {}]]
const band = []
for (const look of ['small', 'big']) {
  for (const bg of [DARK, LIGHT]) {
    for (const [kind, patch] of states) {
      const c = cat({ ...patch, look })
      const f = kind === 'asleep' ? 6 : 2
      const p = S.poseFor(kind, f, 500)
      const grid = cells(S.bandLayer(p, f, c, S.needOf(c, kind)))
      while (grid.length < 4) grid.unshift(grid[0].map(() => ({ ch: ' ', fg: null, bg: null })))
      band.push({ cells: grid, bg })
    }
  }
}
sheet(band, 7, 'band.png')

// Every coat, in the room pose and on the prompt line.
const coats = []
for (const coat of Object.keys(P.COATS)) {
  for (const bg of [DARK, LIGHT]) {
    const L = P.layer(24, 20)
    P.drawBig(L, 1, 2, coat, { eyes: 'open', tail: 'up' })
    coats.push({ cells: cells(L), bg })
  }
}
sheet(coats, 10, 'coats.png', 6, 12)

if (process.argv.includes('--docs')) {
  const docs = join(root, 'docs', 'images')
  mkdirSync(docs, { recursive: true })
  for (const f of ['room.png', 'band.png', 'coats.png']) copyFileSync(join(out, f), join(docs, f))
  console.log('copied to docs/images')
}
