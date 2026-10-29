# Mod API notes

The parts of Claude Code's function-hook API that Claude Cat uses, with the declaration names to grep in `claude-code.d.ts` (see `.claude/CLAUDE.md` for where that file comes from). The API is early access and moves between releases: the declaration file wins over these notes.

## Shape of a mod

- `.claude-plugin/plugin.json`, `hooks/hooks.json` with `{ "modules": ["./register.tsx"] }`, and the module exporting `register: Register`.
- Every hook is `($, e, next)`. `next(e)` runs the plugins beneath and the engine. A hook that returns without `next` answers for itself.
- The module runs with no DOM and no Node. JSX compiles against the global `h`. Elements come from `$.ui.resolve(e)`.
- `claude plugin validate <dir>` lists what the module hooks and calls and what the engine would refuse. `claude plugin test <dir>` runs `*.test.ts`.

## Events used

| Event | Type to grep | Used for |
| --- | --- | --- |
| `session.start` | `SessionStartInput` | Register `/cat`, load the cat, start timers. Not raised by `/reload-plugins`. |
| `command.run` | `CommandRunInput` (`args`) | `/cat` and its subcommands. Answer `{ text }`. |
| `prompt.submit` | `PromptSubmitInput` | Wake the cat. Only sent prompts are seen, never keystrokes. |
| `turn.start`, `turn.complete`, `turn.abort` | `TurnStartInput`, `TurnCompleteFields` (`agentId`, `isAborted`) | Watching, and a kibble per finished main reply. |
| `tool.call` | `ToolCallResult` (`isError`, `deny`) | Startle on a failed tool call. |
| `ui.close` | `PaneCloseInput` (`id`, `origin`) | Know when the person closed the room. |
| `ui.render` | `RenderInput`, `RenderPropsOf` | `AbovePrompt` (the band) and `Pane` (room, settings). |

## Engine calls used

- `$.command.register(CommandSpec)`: `name`, `description`, `argumentHint`.
- `$.ui.open(PaneOpenArgs)`: `id`, `title`, `focus`, `closeOnEscape`, `holdToasts`, `rows`, `columns`. Resolves `UiOpenResult` (`isPlaced`). Opened unasked, a pane waits until the terminal is 144 columns (110 once the person has opened it); asked, it places at any width.
- `$.ui.close({ id })`, `$.ui.panes()` (`UiPane`: `id`, `isShown`, `isFocused`, `isPlaced`).
- `$.ui.blit(RasterBlitArgs)`: `requestId` (the pane id, or the band's `e.requestId`), `key`, `cells`. Resolves `UiBlitResult` with `deny` when nothing of this plugin's is mounted there or the size differs.
- `$.clock.every(ms, fn)` and `$.clock.after(ms, fn)` return a `Timer` with `cancel()`. Timers end when the module reloads.
- `$.store.get(key)` / `$.store.set(key, value)`: per plugin, kept across sessions.
- `atom(ref, initial)`, `read($, atom)`, `update($, atom, fn)` from `'claude-code'`. Declare each value in `PluginState` (`types/index.d.ts`). Reads while drawing subscribe the drawing; writes are refused while drawing.

## Elements used

- `Raster` (`RasterProps`): `key`, `columns`, `rows`, `cells`. Cells are padded base64 of little-endian u32 triplets `[codePoint, foreground, background]`; a colour is `0x00RRGGBB`, or `0x01000000` for the terminal default. Terminal only.
- `Box` (`BoxProps`): flex layout, `width`, `height`, `gap`, and `position: "absolute"` with `top`/`left` in cells. In the `AbovePrompt` band a negative `top` does not reach the rows above: the band clips its drawing to itself.
- `Text` (`TextProps`): `color` takes a `ThemeKey` (`claude`, `success`, `warning`, `error`, `inactive`, ...) or a hex string. `dimColor`, `bold`, `wrap: 'truncate-end'`.
- `Button` (`ButtonProps`): `key`, `label`, `hotkey` (one digit or lowercase letter), `plain` (draws `f: Feed` instead of `[ Feed ]`), `variant`, `onPress`. Hotkeys work while the site holds the keyboard: a click, or `ctrl+x` then `tab`.
- `Select` (`SelectProps`): `key`, `label`, `options` (`SelectOption`: `value`, `label`), `value`, `autoFocus`, `onSelect`. Not on `mobile`.

## Sites

- **`AbovePrompt`**: the band above the prompt. Props: `hasSurvey`, `isWorking`, `maxRows`, `bodyColumns` (already excludes the engine's `[-]` mark), `scroll`, `view`. The person folds it with `[-]`.
- **`Pane`**: props `title`, `isFocused`, `bodyColumns`, `placement` (`dock` beside the transcript under `/tui fullscreen` at 110+ columns, else `inline` above the prompt), `scroll`, `view`.

## Test kit (`claude-code/testing`)

- `test(name, async ($, on) => { ... })`. Hooks registered with `on` sit beneath the plugin and stand in for the engine.
- `mock.store(on, entries?)` and `mock.clock(on)` (returns `MockClock`: `advance(ms)`, `set`, `settle`, `now`).
- `$.ui.mount({ plugin, surface, component, props, requestId?, viewport? })` returns `Mounted`: `find({ type, key, text })`, `press({ key })`, `select({ key, value })`, `input`, `drawn()`, `unmount()`.
- Events are raised on the test's `$` directly, for example `$.session.start(...)` and `$.command.run(...)`.
