# Claude Cat: notes for Claude

A Claude Code mod (a plugin of function hooks) that draws a pixel cat on the line above the prompt and gives it a room in a side pane. The repo is Claude Cat; the plugin id is `pixel-cat` (Claude Code reserves plugin names starting with `claude-`), and the command is `/cat`. Mods are an early-access API: Claude Code 2.1.287 or later. Built and tested against 2.1.295 and 2.1.296.

## Files

| Path | What it holds |
| --- | --- |
| `.claude-plugin/plugin.json` | Manifest. `types` names the state contract. |
| `.claude-plugin/marketplace.json` | Makes this repo a marketplace for `/plugin install pixel-cat --marketplace Exolvion/claude-cat`. |
| `hooks/hooks.json` | Names the one hooks module. |
| `hooks/register.tsx` | Everything that talks to the engine: hooks, `$.state` and `$.store`, commands, panes, timers, the band and room trees. |
| `hooks/scene.ts` | Pure. Poses, moods, captions, the room scene and the prompt-line scene. No `claude-code` import, so `tools/render.mjs` can run it. |
| `hooks/sprites.ts` | Pure. Coat palettes, sprite strings, pixel layers, packing cells for a `Raster`. |
| `types/index.d.ts` | The data model (`CatData`, `CatView`, the setting types) and the `PluginState` contract. |
| `skills/cat-help/SKILL.md` | Usage guide that ships with the plugin. In installed sessions Claude reads it when someone asks about the cat. Keep it in step with the commands, the settings and `HELP` in `register.tsx`. |
| `tests/pixel-cat.test.ts` | Engine tests, run by `claude plugin test .`. |
| `tools/typecheck.mjs` | Type check against Claude Code's API declarations. |
| `tools/render.mjs` | Renders the drawings to PNG in `tools/out/` for checking art (`sitting.png` holds the sitting cats). `--docs` refreshes `docs/images/`. |
| `.claude/CLAUDE.md` | This file. Claude Code reads it as project context when you work in the repo. |
| `docs/mod-api-notes.md` | The API facts this mod relies on, with type names to grep. |

## How it works

- **Data.** `CatData` lives in `$.state` (`pixel-cat` / `cat`) and is mirrored to `$.store` key `cat`, which persists across sessions. `CatView` (current mood kind, a passing note, a flash such as `+1 kibble`, whether the room is open) lives in `$.state` only. `saveCat()` writes both.
- **Time.** `decay()` applies real elapsed time on load and once a minute: a full belly lasts about a day, energy drains while awake and refills while asleep or while Claude Code is closed.
- **Events.** `turn.start` and `turn.complete` make the cat watch, and a main-agent reply (no `agentId`, not aborted) adds a kibble. A `tool.call` result with `isError` startles it. `prompt.submit` wakes it. Ten minutes with no prompt puts it to sleep.
- **Drawing.** `scene.ts` builds a pixel `Layer`. `encode()` packs it into a `Raster`'s cells: one cell is two pixels (the upper half block, foreground on top, background below), and an empty pixel is the terminal's default colour, so the cat works on light and dark themes. `tick()` runs every 333 ms, re-encodes, and calls `$.ui.blit` only when the cells changed. Render hooks redraw whenever the state they read changes.
- **Prompt line** (the `AbovePrompt` band). Settings: `look` (big by default, sit and tall for the 5- and 6-row sitting cats, small, ascii, face), `side` (right, left), `caption` (mood, news, off), `coat`. The band is as tall as the drawing. The caption is the name over the mood or news; the name and a dim `≡` menu button in the band's top right corner, beside the engine's `[-]`, both open the room. Mouse clicks reach band Buttons only under `/tui fullscreen`. The `[-]` at the band's top right is the engine's own collapse control: mods cannot move it. Any choice typed alone (`/cat big`) sets it, except `off`. A thought bubble shows a need (hungry `><>`, sleepy `zZ`, bored yarn); a mini bowl shows one pixel per kibble.
- **Room.** Pane `cat-room`: docks beside the transcript under `/tui fullscreen` at 110+ columns, otherwise opens above the prompt. Feed, Play, Cuddle, Treat, Settings and Close buttons with hotkeys f, p, c, t, s, x.
- **Settings.** Pane `cat-settings`, opened with `focus` and `closeOnEscape`, one `Select` per setting. Each pick saves at once.

## Edit loop

1. Make the change. If people will notice it (a command, a setting, a behaviour), update `skills/cat-help/SKILL.md`, `HELP` in `register.tsx` and the README as well.
2. `claude plugin validate .`
3. `claude plugin test .`
4. `node tools/typecheck.mjs <path to claude-code.d.ts>` (finding the path is below).
5. For any art change, `node tools/render.mjs` and look at `tools/out/*.png` before shipping. `--docs` updates the README images.
6. Bump `version` in `plugin.json` for anything people who installed from GitHub should get (`claude plugin update` compares it). Commit and push. Where the cat is installed from a local clone, `git pull` there, then `/reload-plugins` in Claude Code.

**The API declarations** (`claude-code.d.ts`) are written by Claude Code and are not committed. Two ways to get them:
- In a session, load the `plugin-authoring` skill. Its text names the path of this build's file.
- Run `claude --plugin-dir .` here. The engine writes `.claude-plugin/types/` (gitignored), which `typecheck.mjs` finds on its own. Never do this in a session where the cat is also installed: the plugin loads twice and you get two cats.

## Gotchas already hit

- In tests, stand-ins for `$` calls (`command.register`, `ui.open`, `ui.panes`, `ui.close`, `ui.blit`) return `{ value: ... }`. Stand-ins for events (`session.start`) return the result itself. See `ground()` in the test file.
- Nothing beneath the plugins answers `ui.render` in tests. When the band returns `next(e)` (hidden cat, open room), a test needs the stand-in render that `ground()` registers.
- `/reload-plugins` loads the module again without a `session.start`. So every hook calls `load()` or `startTimers()`, and `live.kind` starts as `''` so the first tick writes the real mood. A test covers this with the mocked clock.
- Render hooks cannot write `$.state`. They may read it and may start timers.
- Pass `closeOnEscape: true` on every `$.ui.open` of the room, retitles included. An open without it turns Escape-to-close off.
- A `Raster` glyph cell must be one printable, single-width BMP character.
- `mobile` has no `Select` or `Raster`; `desktop` and `vscode` have no `Raster`. Narrow `e.surface` before resolving them.
- The store file is keyed by plugin and marketplace name: `~/.claude/plugins/store/pixel-cat_pixel-cat-<hash>.json`. Renaming either starts a new cat unless that JSON is copied across.
- Headless checks (`claude -p "/cat ..."`) run against the real installed cat and save to its store. `/cat size check` is a harmless probe; avoid feed, play and the like. In Git Bash, prefix with `MSYS_NO_PATHCONV=1`, or `/cat` turns into a Windows path.
- A `command.run` answer's `text` is also read by the model, so keep it short.
- The band clips its drawing to itself. An absolute `Box` with a negative `top` (the old `spot: 'over'`, a one-row band with the cat rising above it) showed only the cat's bottom row, seen on Windows Terminal with 2.1.296, before and after limiting it to fullscreen. So the band is always as tall as the drawing. Do not bring `over` back; old saves that still hold `spot` are ignored.
- The band is shared. Any other mod that draws in `AbovePrompt` runs after the cat's hook. Always `await next(e)` and draw its result above the cat's line; returning the cat alone hides every other mod's band.

## Maintainer preferences

- Act rather than ask; keep replies short.
- No em dashes anywhere: README, UI text, commit messages, replies.
- Commits and PRs carry no `Co-Authored-By` trailer and no "Generated with Claude Code" footer.
- Design: compact, cute and polished. Pictures over text on the prompt line. Render and look at art before shipping it.
- UI copy: plain, neutral, short.
