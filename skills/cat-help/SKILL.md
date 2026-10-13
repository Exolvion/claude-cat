---
name: cat-help
description: How to use Claude Cat, the pixel cat on the line above the prompt (plugin pixel-cat, command /cat). Use when the user asks about the cat, its room, its settings, feeding or caring for it, or why it or its room looks wrong or does not show.
---

# Claude Cat

A pixel cat that sits on the line above the prompt. It watches Claude work, gets one kibble in its bowl for each finished reply, and has a room that opens in a side pane. The person names it; the default name is Mochi.

You cannot run `/cat` yourself. Tell the person exactly what to type.

## Commands

| Type | What it does |
| --- | --- |
| `/cat` | Opens or closes the room. Esc also closes it. |
| `/cat settings` | Opens the settings window. |
| `/cat help` | Prints a short guide. |
| `/cat feed` | Eats one kibble from the bowl. Each finished Claude reply adds one, up to five. |
| `/cat play` | Chases the yarn. Lifts mood, costs energy. |
| `/cat cuddle` | Purrs. More than three in a row and it swats. |
| `/cat treat` | A fish treat. Three a day. |
| `/cat name <name>` | Renames it, up to 12 characters. |
| `/cat hide`, `/cat show` | Takes it off the prompt line, or brings it back. The room still works. |

Settings can also be typed: `/cat size small|big|ascii|face`, `/cat where over|rows`, `/cat side right|left`, `/cat caption mood|news|off`, `/cat coat tabby|smoke|midnight|tuxedo|cream`.

## The room

`/cat` opens it. It shows the cat in a room whose window follows the local time, its Fed, Happy and Energy bars, the bowl, and a diary. To use its keys, click the room or press `ctrl+x` then `tab`: `f` feed, `p` play, `c` cuddle, `t` treat, `s` settings, `x` close.

## Settings window

`/cat settings`, or `s` in the room. Tab moves between settings, the arrow keys choose, Enter sets, Esc closes. Changes show straight away.

| Setting | Choices |
| --- | --- |
| Size | Small pixel cat (3 rows), big pixel cat (4 rows), line art, or a one-line face |
| Where | One row, with the cat rising into the empty space above; or rows of its own that cover nothing |
| Side | Right or left. Left always uses its own rows. |
| Caption | Name and mood, only news such as `+1 kibble`, or off |
| Coat | Tabby, smoke, midnight, tuxedo, cream |

## What the cat shows

- A thought bubble when it wants something: `><>` means hungry (feed it), `zZ` means sleepy, a ball of yarn means bored (play with it).
- The tiny bowl beside it holds one pixel per kibble, up to five.
- It watches while Claude works, jumps and puffs its tail when a tool call fails, and falls asleep after ten minutes with no prompt. Sending a prompt wakes it.
- Hunger, mood and energy carry over between sessions. A full belly lasts about a day. Energy comes back while it sleeps, including while Claude Code is closed.

## When something looks wrong

- **No cat above the prompt.** Try `/cat show`. The band above the prompt can be folded with its `[-]` mark; unfold it to see the cat again. While the room is open, the cat is in the room instead of on the prompt line. After installing or updating, run `/reload-plugins`.
- **The room opens above the prompt, not at the side.** The side pane needs the fullscreen renderer, `/tui fullscreen`, and a window at least 110 columns wide.
- **Only the bottom of the cat shows, or it covers the end of long output lines.** Run `/cat settings` and set Where to "Its own rows".
- **No pixel cat at all in the desktop app or an IDE panel.** The drawings need Claude Code running in a terminal. The room's text and buttons still work there.
- **Colours look wrong or blocky.** Use a terminal with true colour, such as Windows Terminal, iTerm2 or the VS Code terminal.
- **"The bowl is empty."** Kibble comes only from finished Claude replies.
- **Starting over with a new cat.** Close Claude Code, delete `~/.claude/plugins/store/pixel-cat_*.json`, and start it again.

Source and issues: https://github.com/Exolvion/claude-cat
