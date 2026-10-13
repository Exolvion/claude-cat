import { expect, mock, test } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const VIEWPORT = { columns: 120, rows: 40, isFullscreen: true }
const BAND = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  viewport: VIEWPORT,
}
const pane = (requestId: string, placement: 'dock' | 'inline' = 'dock', surface: 'terminal' | 'desktop' = 'terminal') => ({
  plugin: 'pixel-cat',
  surface,
  component: 'Pane' as const,
  requestId,
  props: { title: 'Mochi', isFocused: true, bodyColumns: 40, placement, scroll: { offset: 0, bodyRows: 40 }, view: {} },
  viewport: VIEWPORT,
})

// Stands in for the engine beneath the plugin: the calls the cat makes on $.
type Seen = { opens: { id: string; focus?: true; closeOnEscape?: true }[]; blits: number }
const ground = (on: On, stored?: Record<string, unknown>) => {
  mock.store(on, stored)
  const clock = mock.clock(on)
  const seen: Seen = { opens: [], blits: 0 }
  const open = new Set<string>()
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.panes', () => ({ value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }))
  on('ui.open', ($, e) => { seen.opens.push(e); open.add(e.id); return { value: { isPlaced: true as const } } })
  on('ui.close', ($, e) => { open.delete(e.id); return { value: undefined } })
  on('ui.blit', () => { seen.blits++; return { value: {} } })
  // What the engine draws in the band when the cat steps aside: an empty row.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  return { clock, seen }
}

const start = async ($: Engine) => {
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
}
const run = ($: Engine, args: string) =>
  $.command.run({ command: 'cat', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
const band = async ($: Engine) => {
  const ui = await $.ui.mount({ plugin: 'pixel-cat', surface: 'terminal', ...BAND })
  const found = {
    raster: await ui.find({ type: 'Raster', key: 'cat' }),
    caption: await ui.find({ type: 'Text', text: /Mochi/ }),
    face: await ui.find({ type: 'Text', text: /ω/ }),
  }
  await ui.unmount()
  return found
}

test('a new cat eats one kibble, then is too full for more', async ($, on) => {
  ground(on)
  await start($)
  expect((await run($, 'feed')).text).toMatch(/ate 1 kibble\. Bowl: 1 of 5/)
  expect((await run($, 'feed')).text).toBe('Mochi is full and walks away from the bowl.')
  expect((await run($, 'play')).text).toBe('Mochi chased the yarn.')
  expect((await run($, 'treat')).text).toBe('Mochi ate a fish treat. 2 left today.')
})

test('commands rename, recolour and hide the cat', async ($, on) => {
  ground(on)
  await start($)
  expect((await run($, 'name Biscuit')).text).toBe('Mochi is now called Biscuit.')
  expect((await run($, 'coat smoke')).text).toBe('Coat set to smoke.')
  expect((await run($, 'coat plaid')).text).toMatch(/^Coat: tabby, smoke/)
  expect((await run($, 'hide')).text).toBe('Biscuit left the prompt line. /cat show brings it back.')
  expect((await band($)).raster).toBeUndefined()
  expect((await run($, 'show')).text).toBe('Biscuit is back on the prompt line.')
  expect((await run($, 'dance')).text).toMatch(/^Not a \/cat command\. Cat commands:/)
  expect((await run($, 'help')).text).toMatch(/^Cat commands: \/cat opens or closes the room/)
})

test('by default the band is one row: a small cat with its bowl and a one-word caption', async ($, on) => {
  ground(on)
  await start($)
  const ui = await $.ui.mount({ plugin: 'pixel-cat', surface: 'terminal', ...BAND })
  const raster = await ui.find({ type: 'Raster', key: 'cat' })
  expect(raster?.props.columns).toBe(26)
  expect(raster?.props.rows).toBe(3)
  expect((await ui.find({ type: 'Text', text: /Mochi/ }))?.text).toMatch(/Mochi · loafing/)
  const root = (await ui.drawn()) as unknown as { props: { height?: number } }
  expect(root.props.height).toBe(1)
  await ui.unmount()
})

test('the settings window changes the band as soon as a choice is made', async ($, on) => {
  const { seen } = ground(on)
  await start($)
  expect((await run($, 'settings')).text).toMatch(/^Opened Mochi's settings/)
  expect(seen.opens.at(-1)).toMatchObject({ id: 'cat-settings', focus: true, closeOnEscape: true })
  const ui = await $.ui.mount(pane('cat-settings'))
  await ui.select({ key: 'look', value: 'face' })
  expect((await band($)).face?.text).toContain('(=•ω•=)')
  await ui.select({ key: 'look', value: 'ascii' })
  expect((await band($)).face?.text).toContain('( •ω• )')
  await ui.select({ key: 'caption', value: 'off' })
  expect((await band($)).caption).toBeUndefined()
  await ui.select({ key: 'look', value: 'big' })
  await ui.select({ key: 'spot', value: 'rows' })
  expect((await band($)).raster?.props.rows).toBe(4)
  await ui.unmount()
})

test('the old typed settings still work', async ($, on) => {
  ground(on)
  await start($)
  expect((await run($, 'size big')).text).toBe('Size set to big.')
  expect((await run($, 'side left')).text).toBe('Side set to left.')
  expect((await run($, 'size huge')).text).toBe('Size: big, small, ascii, face. It is big now. /cat settings opens a picker.')
})

test('a save from before the redesign keeps its choices', async ($, on) => {
  ground(on, { cat: { name: 'Mochi', coat: 'tabby', look: 'tiny', style: 'cat', bowl: 2 } })
  await start($)
  expect((await run($, 'size nope')).text).toMatch(/It is face now/)
  expect((await band($)).caption).toBeUndefined()
})

test('the room feeds the cat and opens settings', async ($, on) => {
  const { seen } = ground(on)
  await start($)
  for (const placement of ['dock', 'inline'] as const) {
    const ui = await $.ui.mount(pane('cat-room', placement))
    expect((await ui.find({ type: 'Raster', key: 'room' }))?.props.columns).toBe(38)
    await ui.unmount()
  }
  const ui = await $.ui.mount(pane('cat-room'))
  await ui.press({ key: 'feed' })
  expect(await ui.find({ type: 'Text', text: /ate 1 kibble/ })).toBeDefined()
  await ui.press({ key: 'settings' })
  expect(seen.opens.at(-1)?.id).toBe('cat-settings')
  await ui.unmount()
})

test('other surfaces get the room without the pixel grid', async ($, on) => {
  ground(on)
  await start($)
  const ui = await $.ui.mount(pane('cat-room', 'dock', 'desktop'))
  expect(await ui.find({ type: 'Button', key: 'treat' })).toBeDefined()
  expect(await ui.find({ type: 'Raster', key: 'room' })).toBeUndefined()
  await ui.unmount()
})

test('the room closes from its button, Esc and the command', async ($, on) => {
  const { seen } = ground(on)
  await start($)
  expect((await run($, '')).text).toBe("Opened Mochi's room. Esc or /cat closes it.")
  expect(seen.opens.at(-1)?.closeOnEscape).toBe(true)
  expect((await band($)).raster).toBeUndefined()
  const ui = await $.ui.mount(pane('cat-room'))
  await ui.press({ key: 'close' })
  await ui.unmount()
  expect((await band($)).raster).toBeDefined()
  expect((await run($, '')).text).toMatch(/^Opened/)
  expect((await run($, 'close')).text).toBe("Closed Mochi's room.")
})

test('after a reload with no session start, the band draws and its timer animates it', async ($, on) => {
  const { clock, seen } = ground(on)
  const ui = await $.ui.mount({ plugin: 'pixel-cat', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Raster', key: 'cat' })).toBeDefined()
  await clock.advance(20_000)
  expect(seen.blits).toBeGreaterThan(0)
  await ui.unmount()
})
