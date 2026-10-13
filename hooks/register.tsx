import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Caption, CatData, CatView, Coat, Look, Side, Spot } from '../types'
import { COATS, encode } from './sprites'
import {
  BAND_COLS, ROOM_COLS, ROOM_ROWS, asciiCat, bandLayer, bandRows, faceCat, moodWord, needOf, phrase, poseFor, roomLayer,
} from './scene'
import type { Act, Kind, Pose } from './scene'

type Engine = EngineInterface
type Care = 'feed' | 'play' | 'cuddle' | 'treat'

const PANE = 'cat-room'
const SETTINGS = 'cat-settings'
const MIN = 60_000
const HOUR = 60 * MIN
const SLEEP_AFTER = 10 * MIN
const FRAME_MS = 333
const CARE: Care[] = ['feed', 'play', 'cuddle', 'treat']

const LOOKS: Look[] = ['big', 'small', 'ascii', 'face']
const SPOTS: Spot[] = ['over', 'rows']
const SIDES: Side[] = ['right', 'left']
const CAPTIONS: Caption[] = ['mood', 'news', 'off']

const FRESH: CatData = {
  name: 'Mochi', coat: 'tabby', hunger: 75, mood: 80, energy: 80, bowl: 2, treats: 3,
  treatsDay: '', born: 0, savedAt: 0, hidden: false,
  look: 'small', spot: 'over', side: 'right', caption: 'mood', log: [],
}
const NO_VIEW: CatView = { kind: 'idle', note: '', flash: '', isRoomOpen: false }
const catState = atom({ plugin: 'pixel-cat', key: 'cat' } as const, FRESH)
const viewState = atom({ plugin: 'pixel-cat', key: 'view' } as const, NO_VIEW)

// What the animation reads between draws. A reload starts it over, which is fine:
// the cat itself lives in $.state and $.store.
const live = {
  cat: { ...FRESH },
  loaded: false,
  started: false,
  act: null as Act | null,
  actStart: 0,
  actUntil: 0,
  turns: new Set<string>(),
  lastPrompt: Date.now(),
  asleep: false,
  frame: 0,
  // No pose has this kind, so the first tick always writes the real one.
  kind: '' as Kind | '',
  bandId: '',
  bandShown: false,
  roomShown: false,
  lastBand: '',
  lastRoom: '',
  cuddles: [] as number[],
  noteId: 0,
  flashId: 0,
}

/* ---------- the cat's numbers ---------- */

const clamp = (v: number): number => Math.max(0, Math.min(100, v))
const dayKey = (t: number): string => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }
const hhmm = (t: number): string => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const pick = <T extends string>(list: readonly T[], v: unknown, d: T): T => (list.includes(v as T) ? (v as T) : d)

function sanitize(raw: unknown, now: number): CatData {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof CatData | 'style', unknown>>
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const log = Array.isArray(s.log)
    ? s.log.filter((d): d is { t: number; text: string } => !!d && typeof d.t === 'number' && typeof d.text === 'string').slice(0, 12)
    : []
  return {
    name: typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 12) : FRESH.name,
    coat: typeof s.coat === 'string' && s.coat in COATS ? (s.coat as Coat) : 'tabby',
    hunger: clamp(num(s.hunger, FRESH.hunger)),
    mood: clamp(num(s.mood, FRESH.mood)),
    energy: clamp(num(s.energy, FRESH.energy)),
    bowl: Math.max(0, Math.min(5, Math.round(num(s.bowl, FRESH.bowl)))),
    treats: Math.max(0, Math.min(3, Math.round(num(s.treats, 3)))),
    treatsDay: typeof s.treatsDay === 'string' ? s.treatsDay : '',
    born: num(s.born, now) || now,
    savedAt: num(s.savedAt, now) || now,
    hidden: s.hidden === true,
    // Older saves called the one-line face "tiny" and had a "style" in place of the caption.
    look: s.look === 'tiny' ? 'face' : pick(LOOKS, s.look, FRESH.look),
    spot: pick(SPOTS, s.spot, FRESH.spot),
    side: pick(SIDES, s.side, FRESH.side),
    caption: s.caption === undefined && s.style === 'cat' ? 'off' : pick(CAPTIONS, s.caption, FRESH.caption),
    log,
  }
}

// A full belly lasts about a day. Energy drains while the cat is awake and
// comes back while it sleeps, which includes the time Claude Code is closed.
function decay(c: CatData, now: number, asleep: boolean): CatData {
  const hours = Math.max(0, Math.min(now - (c.savedAt || now), 7 * 24 * HOUR)) / HOUR
  const hunger = clamp(c.hunger - (hours * 100) / 24)
  const mood = clamp(c.mood - hours * (hunger < 30 ? 6 : 2.5))
  const energy = clamp(asleep ? c.energy + hours * 25 : c.energy - hours * 8)
  const day = dayKey(now)
  return { ...c, hunger, mood, energy, savedAt: now, treatsDay: day, treats: c.treatsDay === day ? c.treats : 3 }
}

function withLog(c: CatData, text: string, t = Date.now()): CatData {
  return { ...c, log: [{ t, text }, ...c.log].slice(0, 12) }
}

async function saveCat($: Engine, change: (c: CatData) => CatData): Promise<CatData> {
  const next = await update($, catState, c => change(c))
  live.cat = next
  await $.store.set('cat', next)
  return next
}

async function setView($: Engine, patch: Partial<CatView>): Promise<void> {
  await update($, viewState, v => ({ ...v, ...patch }))
}

async function note($: Engine, text: string): Promise<void> {
  const id = ++live.noteId
  await setView($, { note: text })
  $.clock.after(5000, () => { if (live.noteId === id) void setView($, { note: '' }) })
}

async function flash($: Engine, text: string): Promise<void> {
  const id = ++live.flashId
  await setView($, { flash: text })
  $.clock.after(4000, () => { if (live.flashId === id) void setView($, { flash: '' }) })
}

function startAct(a: Act, ms: number, now = Date.now()): void {
  live.act = a
  live.actStart = now
  live.actUntil = now + ms
}

async function wake($: Engine, why: string): Promise<void> {
  live.lastPrompt = Date.now()
  if (!live.asleep) return
  live.asleep = false
  await saveCat($, c => withLog(c, why))
}

function currentPose(now = Date.now(), f = live.frame): Pose {
  if (live.act && now < live.actUntil) return poseFor(live.act, f, now - live.actStart)
  if (live.asleep) return poseFor('asleep', f)
  if (live.turns.size > 0) return poseFor('watching', f)
  return poseFor('idle', f)
}

/* ---------- care ---------- */

async function care($: Engine, kind: Care): Promise<string> {
  await wake($, 'Woke up and stretched')
  const now = Date.now()
  const c = live.cat
  let msg: string
  if (kind === 'feed') {
    if (c.bowl === 0) msg = 'The bowl is empty. Each finished Claude reply adds one kibble.'
    else if (c.hunger >= 95) msg = `${c.name} is full and walks away from the bowl.`
    else {
      startAct('eating', 2600, now)
      const n = await saveCat($, x => withLog({ ...x, bowl: x.bowl - 1, hunger: clamp(x.hunger + 22) }, 'Ate 1 kibble'))
      msg = `${n.name} ate 1 kibble. Bowl: ${n.bowl} of 5.`
    }
  } else if (kind === 'play') {
    if (c.energy < 15) msg = `${c.name} is too sleepy to play.`
    else {
      startAct('playing', 4000, now)
      await saveCat($, x => withLog({ ...x, energy: clamp(x.energy - 12), mood: clamp(x.mood + 14), hunger: clamp(x.hunger - 4) }, 'Chased the yarn'))
      msg = `${c.name} chased the yarn.`
    }
  } else if (kind === 'cuddle') {
    live.cuddles = [...live.cuddles.filter(t => now - t < 12_000), now]
    if (live.cuddles.length > 3) {
      live.cuddles = []
      startAct('swat', 1600, now)
      await saveCat($, x => withLog({ ...x, mood: clamp(x.mood - 3) }, 'Swatted the cursor after too many cuddles'))
      msg = `${c.name} had enough cuddles and swatted the cursor.`
    } else {
      startAct('purring', 2800, now)
      await saveCat($, x => withLog({ ...x, mood: clamp(x.mood + 10) }, 'Purred during a cuddle'))
      msg = `${c.name} purrs.`
    }
  } else {
    if (c.treats === 0) msg = 'No treats left today. They come back tomorrow.'
    else {
      startAct('treat', 2400, now)
      const n = await saveCat($, x => withLog({ ...x, treats: x.treats - 1, mood: clamp(x.mood + 18), hunger: clamp(x.hunger + 8) }, 'Ate a fish treat'))
      msg = `${n.name} ate a fish treat. ${n.treats} left today.`
    }
  }
  live.kind = currentPose(now).kind
  await setView($, { kind: live.kind })
  await note($, msg)
  return msg
}

/* ---------- panes ---------- */

async function isOpen($: Engine, id: string): Promise<boolean> {
  return (await $.ui.panes()).some(p => p.id === id)
}

// Every open passes closeOnEscape, so Escape closes the room: from inside it,
// or at an idle, empty prompt. An open without it would switch that off again.
async function openRoom($: Engine): Promise<string> {
  const opened = await $.ui.open({ id: PANE, title: live.cat.name, columns: ROOM_COLS + 2, rows: 12, closeOnEscape: true })
  await setView($, { isRoomOpen: true })
  return opened.isPlaced
    ? `Opened ${live.cat.name}'s room. Esc or /cat closes it.`
    : `Opened ${live.cat.name}'s room. Widen the terminal to see it.`
}

async function closeRoom($: Engine): Promise<string> {
  if (await isOpen($, PANE)) await $.ui.close({ id: PANE })
  live.roomShown = false
  await setView($, { isRoomOpen: false })
  return `Closed ${live.cat.name}'s room.`
}

async function toggleRoom($: Engine): Promise<string> {
  return (await isOpen($, PANE)) ? closeRoom($) : openRoom($)
}

async function openSettings($: Engine): Promise<string> {
  await $.ui.open({ id: SETTINGS, title: 'Cat settings', focus: true, closeOnEscape: true, holdToasts: true, rows: 13, columns: 56 })
  return `Opened ${live.cat.name}'s settings. Tab moves, arrows choose, Enter sets, Esc closes.`
}

/* ---------- settings ---------- */

const CHOICES = { look: LOOKS, spot: SPOTS, side: SIDES, caption: CAPTIONS, coat: Object.keys(COATS) as Coat[] }
type SettingKey = keyof typeof CHOICES
const ALIASES: Record<string, SettingKey> = { size: 'look', look: 'look', spot: 'spot', where: 'spot', side: 'side', caption: 'caption', coat: 'coat' }

function withSetting(c: CatData, key: SettingKey, value: string): CatData {
  switch (key) {
    case 'look': return { ...c, look: value as Look }
    case 'spot': return { ...c, spot: value as Spot }
    case 'side': return { ...c, side: value as Side }
    case 'caption': return { ...c, caption: value as Caption }
    case 'coat': return { ...c, coat: value as Coat }
  }
}

async function setting($: Engine, key: SettingKey, value: string): Promise<string> {
  const list: readonly string[] = CHOICES[key]
  const word = key === 'look' ? 'size' : key
  if (!list.includes(value)) return `${word[0]?.toUpperCase()}${word.slice(1)}: ${list.join(', ')}. It is ${live.cat[key]} now. /cat settings opens a picker.`
  live.lastBand = ''
  await saveCat($, c => withSetting(c, key, value))
  return `${word[0]?.toUpperCase()}${word.slice(1)} set to ${value}.`
}

/* ---------- commands ---------- */

// Keep in step with skills/cat-help/SKILL.md, the longer guide Claude reads.
const HELP = 'Cat commands: /cat opens or closes the room, /cat settings, /cat feed, play, cuddle or treat, '
  + '/cat name <name>, /cat hide or show. In the room, click it to use the keys f p c t s x. '
  + 'Each finished Claude reply adds a kibble. The room docks at the side under /tui fullscreen at 110+ columns.'

async function runCommand($: Engine, args: string): Promise<string> {
  const [sub = '', ...rest] = args.trim().split(/\s+/).filter(Boolean)
  const word = sub.toLowerCase()
  if (!word) return toggleRoom($)
  if (word === 'help') return HELP
  if (word === 'open' || word === 'room') return openRoom($)
  if (word === 'close') return closeRoom($)
  if (word === 'settings' || word === 'set') return openSettings($)
  const key = ALIASES[word]
  if (key) return setting($, key, (rest[0] ?? '').toLowerCase())
  if ((CARE as string[]).includes(word)) return care($, word as Care)
  if (word === 'name') {
    const name = rest.join(' ').trim().slice(0, 12)
    if (!name) return 'Add a name, for example /cat name Biscuit'
    const old = live.cat.name
    await saveCat($, c => withLog({ ...c, name }, `Was renamed from ${old}`))
    if (await isOpen($, PANE)) await openRoom($)
    return `${old} is now called ${name}.`
  }
  if (word === 'hide' || word === 'show') {
    await saveCat($, c => ({ ...c, hidden: word === 'hide' }))
    return word === 'hide'
      ? `${live.cat.name} left the prompt line. /cat show brings it back.`
      : `${live.cat.name} is back on the prompt line.`
  }
  return `Not a /cat command. ${HELP}`
}

/* ---------- animation ---------- */

function tick($: Engine): void {
  live.frame++
  const now = Date.now()
  const busy = live.turns.size > 0 || (live.act !== null && now < live.actUntil)
  if (!live.asleep && !busy && now - live.lastPrompt > SLEEP_AFTER) {
    live.asleep = true
    void saveCat($, c => withLog(c, 'Dozed off on the prompt line'))
  }
  const p = currentPose(now)
  if (p.kind !== live.kind) {
    live.kind = p.kind
    void setView($, { kind: p.kind })
  }
  if (live.bandShown && live.bandId) {
    const cells = encode(bandLayer(p, live.frame, live.cat, needOf(live.cat, p.kind)))
    if (cells !== live.lastBand) {
      live.lastBand = cells
      void $.ui.blit({ requestId: live.bandId, key: 'cat', cells }).then(r => { if (r.deny) live.bandShown = false })
    }
  }
  if (live.roomShown) {
    const cells = encode(roomLayer(p, live.frame, live.cat))
    if (cells !== live.lastRoom) {
      live.lastRoom = cells
      void $.ui.blit({ requestId: PANE, key: 'room', cells }).then(r => { if (r.deny) live.roomShown = false })
    }
  }
}

/* ---------- loading ---------- */

// The animation and the slow stat changes start once per load of this module.
// session.start starts them, but /reload-plugins can load the module without
// one, so the first hook that runs after a reload starts them instead.
function startTimers($: Engine): void {
  if (live.started) return
  live.started = true
  live.lastPrompt = Date.now()
  $.clock.every(FRAME_MS, () => tick($))
  $.clock.every(MIN, () => { void saveCat($, c => decay(c, Date.now(), live.asleep)) })
}

async function load($: Engine): Promise<void> {
  if (live.loaded) return
  live.loaded = true
  startTimers($)
  const now = Date.now()
  const stored = await $.store.get('cat')
  let cat = decay(sanitize(stored, now), now, true)
  if (stored === undefined) cat = withLog({ ...cat, born: now }, 'Arrived and found a warm spot', now)
  live.cat = cat
  live.kind = currentPose(now).kind
  await update($, catState, () => cat)
  await $.store.set('cat', cat)
  await setView($, { kind: live.kind, isRoomOpen: await isOpen($, PANE) })
}

/* ---------- hooks ---------- */

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cat',
      description: 'Your pixel cat. Opens its room, or settings, feed, play, cuddle, treat, name, hide, show.',
      argumentHint: '[help | settings | feed | play | cuddle | treat | close | name <name> | hide | show]',
    })
    await load($)
    return next(e)
  })

  on('command.run', { command: 'cat' }, async ($, e) => {
    await load($)
    return { text: await runCommand($, e.args ?? '') }
  })

  on('prompt.submit', async ($, e, next) => {
    await load($)
    await wake($, 'Woke up when you sent a prompt')
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    live.turns.add(e.turnId)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await load($)
    live.turns.delete(e.turnId)
    live.lastPrompt = Date.now()
    if (e.agentId === undefined && !e.isAborted) {
      const before = live.cat.bowl
      await saveCat($, c => (c.bowl < 5 ? withLog({ ...c, bowl: c.bowl + 1 }, 'Watched Claude reply. +1 kibble') : c))
      await flash($, before < 5 ? '+1 kibble' : 'bowl full')
    }
    return done
  })

  on('turn.abort', async ($, e, next) => {
    live.turns.delete(e.turnId)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError === true) {
      await load($)
      const now = Date.now()
      if (!(live.act === 'startled' && now < live.actUntil)) {
        startAct('startled', 3200, now)
        await saveCat($, c => withLog({ ...c, mood: clamp(c.mood - 4) }, `Jumped at a failed ${String(e.tool)} call`))
      }
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      live.roomShown = false
      await setView($, { isRoomOpen: false })
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // The prompt line: the cat, a thought bubble when it wants something, its bowl,
  // and a short caption. "over" keeps the band one row tall and lets the drawing
  // rise into the empty space above it; "rows" gives the drawing rows of its own.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const cat = await read($, catState)
    const view = await read($, viewState)
    if (cat.hidden || view.isRoomOpen || e.props.hasSurvey || e.surface !== 'terminal') {
      live.bandShown = false
      return next(e)
    }
    live.cat = cat
    startTimers($)
    live.bandId = e.requestId
    const { Box, Raster, Text } = $.ui.resolve(e)
    const pixel = cat.look === 'big' || cat.look === 'small'
    // The text looks redraw only when the mood changes, so they hold still between.
    const p = pixel ? currentPose() : currentPose(Date.now(), 1)
    const need = needOf(cat, p.kind)
    const ink = COATS[cat.coat].t

    let art
    let width: number
    let rows: number
    if (pixel) {
      const cells = encode(bandLayer(p, live.frame, cat, need))
      live.lastBand = cells
      live.bandShown = true
      rows = bandRows(cat.look)
      width = BAND_COLS
      art = <Raster key="cat" columns={BAND_COLS} rows={rows} cells={cells} />
    } else {
      live.bandShown = false
      if (cat.look === 'ascii') {
        const lines = asciiCat(p, need)
        rows = lines.length
        width = Math.max(...lines.map(l => l.length)) + 1
        art = <Box flexDirection="column">{lines.map(l => <Text color={ink}>{l}</Text>)}</Box>
      } else {
        const face = faceCat(p, need)
        rows = 1
        width = face.length + 1
        art = <Text color={ink}>{face}</Text>
      }
    }

    const words = view.flash || (cat.caption === 'mood' ? moodWord(p.kind, need) : '')
    const caption =
      cat.caption === 'off' || !words ? null : (
        <Text wrap="truncate-end">
          <Text color={ink} bold>{cat.name}</Text>
          {view.flash ? <Text color="claude">{` ${view.flash}`}</Text> : <Text dimColor>{` · ${words}`}</Text>}
        </Text>
      )

    // Over the transcript only on the right, where its lines leave room.
    const over = cat.spot === 'over' && cat.side === 'right' && rows > 1
    const seat = over ? (
      <Box width={width} height={1}>
        <Box position="absolute" top={-(rows - 1)} left={0}>{art}</Box>
      </Box>
    ) : art
    const height = over ? 1 : rows
    return cat.side === 'right' ? (
      <Box flexDirection="row" justifyContent="flex-end" alignItems="flex-end" height={height} gap={1}>
        {caption}
        {seat}
      </Box>
    ) : (
      <Box flexDirection="row" alignItems="flex-end" height={height} gap={1}>
        {seat}
        {caption}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: SETTINGS }, async ($, e) => {
    const cat = await read($, catState)
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text>Change these with /cat size, /cat where, /cat side, /cat caption and /cat coat.</Text>
    }
    const { Box, Select, Text } = $.ui.resolve(e)
    const save = (key: SettingKey) => (value: string) => { void setting($, key, value) }
    return (
      <Box flexDirection="column">
        <Text bold>{`${cat.name}'s settings`}</Text>
        <Text dimColor>Changes show on the prompt line straight away.</Text>
        <Text> </Text>
        <Select key="look" label="Size      " value={cat.look} autoFocus onSelect={save('look')} options={[
          { value: 'small', label: 'Small pixel cat, 3 rows' },
          { value: 'big', label: 'Big pixel cat, 4 rows' },
          { value: 'ascii', label: 'Line art, 3 rows' },
          { value: 'face', label: 'One-line face' },
        ]} />
        <Select key="spot" label="Where     " value={cat.spot} onSelect={save('spot')} options={[
          { value: 'over', label: 'One row, cat rises into the space above' },
          { value: 'rows', label: 'Its own rows, covers nothing' },
        ]} />
        <Select key="side" label="Side      " value={cat.side} onSelect={save('side')} options={[
          { value: 'right', label: 'Right' },
          { value: 'left', label: 'Left (always its own rows)' },
        ]} />
        <Select key="caption" label="Caption   " value={cat.caption} onSelect={save('caption')} options={[
          { value: 'mood', label: 'Name and mood' },
          { value: 'news', label: 'Only news, like +1 kibble' },
          { value: 'off', label: 'Off' },
        ]} />
        <Select key="coat" label="Coat      " value={cat.coat} onSelect={save('coat')}
          options={(Object.keys(COATS) as Coat[]).map(k => ({ value: k, label: COATS[k].label }))} />
        <Text> </Text>
        <Text dimColor>Tab moves · arrows choose · Enter sets · Esc closes</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const cat = await read($, catState)
    const view = await read($, viewState)
    live.cat = cat
    startTimers($)
    const days = Math.max(1, Math.floor((Date.now() - cat.born) / (24 * HOUR)) + 1)
    const { Box, Button, Text } = $.ui.resolve(e)
    const level = (v: number): 'success' | 'warning' | 'error' => (v >= 60 ? 'success' : v >= 30 ? 'warning' : 'error')
    const stat = (label: string, v: number) => {
      const k = Math.round(v / 10)
      return (
        <Text>
          <Text dimColor>{label.padEnd(8)}</Text>
          <Text color={level(v)}>{'━'.repeat(k)}</Text>
          <Text color="inactive">{'━'.repeat(10 - k)}</Text>
          <Text dimColor>{` ${String(Math.round(v)).padStart(3)}`}</Text>
        </Text>
      )
    }
    const dock = e.props.placement === 'dock'
    const info = [
      <Box flexDirection="row" justifyContent="space-between">
        <Text wrap="truncate-end">
          <Text bold color="claude">{cat.name}</Text>
          <Text dimColor>{`  ·  ${COATS[cat.coat].label}  ·  day ${days}`}</Text>
        </Text>
        <Button key="close" hotkey="x" plain label="Close" onPress={() => { void closeRoom($) }} />
      </Box>,
      <Text dimColor wrap="truncate-end">{view.note || `${cat.name} ${phrase(currentPose().kind, cat)}.`}</Text>,
      stat('Fed', cat.hunger),
      stat('Happy', cat.mood),
      stat('Energy', cat.energy),
      <Text>
        <Text dimColor>{'Bowl    '}</Text>
        <Text color="claude">{'●'.repeat(cat.bowl)}</Text>
        <Text dimColor>{`${'○'.repeat(5 - cat.bowl)}  ${cat.bowl} of 5`}</Text>
      </Text>,
      <Box flexDirection="row" gap={2}>
        <Button key="feed" hotkey="f" plain label="Feed" onPress={() => { void care($, 'feed') }} />
        <Button key="play" hotkey="p" plain label="Play" onPress={() => { void care($, 'play') }} />
        <Button key="cuddle" hotkey="c" plain label="Cuddle" onPress={() => { void care($, 'cuddle') }} />
        <Button key="treat" hotkey="t" plain label="Treat" onPress={() => { void care($, 'treat') }} />
      </Box>,
      <Box flexDirection="row" justifyContent="space-between">
        <Text dimColor>{`${cat.treats} treats left today`}</Text>
        <Button key="settings" hotkey="s" plain label="Settings" onPress={() => { void openSettings($) }} />
      </Box>,
    ]
    const diary = cat.log.slice(0, dock ? 5 : 2).map(d => (
      <Text wrap="truncate-end">
        <Text dimColor>{`${hhmm(d.t)}  `}</Text>
        {d.text}
      </Text>
    ))
    const hint = <Text dimColor wrap="truncate-end">{e.props.isFocused ? 'f p c t act · s settings · x closes' : 'Esc or /cat closes · click for the keys'}</Text>
    const side = dock
      ? [...info, <Text> </Text>, <Text dimColor bold>Diary</Text>, ...diary, <Text> </Text>, hint]
      : [...info, ...diary, hint]

    if (e.surface !== 'terminal') {
      live.roomShown = false
      return <Box flexDirection="column">{side}</Box>
    }
    const { Raster } = $.ui.resolve(e)
    const cells = encode(roomLayer(currentPose(), live.frame, cat))
    live.lastRoom = cells
    live.roomShown = true
    const room = <Raster key="room" columns={ROOM_COLS} rows={ROOM_ROWS} cells={cells} />
    return dock ? (
      <Box flexDirection="column">
        {room}
        {side}
      </Box>
    ) : (
      <Box flexDirection="row" gap={2}>
        {room}
        <Box flexDirection="column" flexGrow={1}>{side}</Box>
      </Box>
    )
  })
}
