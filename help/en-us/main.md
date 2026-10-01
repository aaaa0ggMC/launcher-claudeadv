# Claude's Adventure

> Last updated: 2026-10-01

Claude's Adventure is a 2D side-scrolling platformer: play as Claude, a coral-orange starburst critter, through 5 themed levels — run, jump, stomp bugs, fire `{}` tool calls, and finally defeat the Legacy Monolith in Production. The game is packed with AI-coding in-jokes: Tokens are both coins and ammo, the level timer is your context window, and letting it fill up means "context overflow".

> Quick start: open the Claude's Adventure page → **Start Adventure** → move with **← →**, jump with **Space**, fire `{}` with **X**, and reach the terminal glowing ✓ to clear the level.

## What it does

- 5 themed levels: Terminal Meadows (tutorial) → Codebase Jungle → Dependency Hell → The Cloud → Production (boss fight).
- Tight platforming: coyote time, jump buffering, variable jump height, double jump, jump pads.
- Combat: stomp bugs to "fix" them, or spend Tokens to fire `{}` tool calls; saws are infinite loops — untouchable, only dodgeable.
- Context window mechanic: the top bar is your context, it grows over time, and at 100% you die; summary scrolls clear 35%.
- Checkpoints & rollback: git flags are checkpoints; on death you roll back to the last one with context and Token floors.
- Progress saving: best time / most Tokens / fewest deaths per level, unlocked levels, and ship counts are stored locally.

## UI at a glance

| Area | Where | Description |
| --- | --- | --- |
| Page toolbar | Top of the page | Mute button, volume slider, control hint text |
| Game canvas | Center of the page | 960×540 canvas, scaled to fit |
| Health & Tokens | Top-left of the screen | 3 hearts + Token count |
| Context window | Top-center | Progress bar + percentage, turns red and flashes past 85% |
| Level & timer | Top-right | Current level name + run time |
| Boss health bar | Bottom of the screen | Only during the boss fight |

## Common tasks

### Start & level select

- Title screen: **Start Adventure** (continue from your highest unlocked level) / **Level Select** / **How to Play**.
- Level select: 5 level cards, locked ones show 🔒; each card shows best time and most Tokens.
- Menus work with the mouse, or ↑↓ + Enter.

### Pause

- **Esc** or **P** to pause; the menu offers **Resume** / **Restart Level** / **Back to Title**.
- The game auto-pauses when the window loses focus or you switch away.

### Clearing & results

- Reach the terminal glowing ✓ to clear the level; the results screen shows time, Tokens collected, and deaths, with ★ NEW on a new record.
- On the results screen, click **Next Level** (or press Enter / Space) to continue; after level 5, click **Ship it!** to roll the ending.

## Controls

| Key | Action |
| --- | --- |
| ← → / A D | Move |
| Space / W / ↑ / Z | Jump (press again mid-air to double jump; hold for higher) |
| ↓ / S | Drop through one-way platforms |
| X / J / K | Fire a `{}` tool call (costs 1 Token) |
| Esc / P | Pause |
| Enter | Confirm (menus) |

The page toolbar has a **mute** button and a **volume** slider, with a control hint on the right.

## Read more

- [Mechanics](Gameplay/Mechanics.md): Tokens & `{}` shots, context window & summary scrolls, hurt / invulnerability / death & rollback, jump pads, one-way platforms, item blocks.
- [Levels & Enemies](Gameplay/LevelsAndEnemies.md): all 5 levels, enemy gallery, and the Legacy Monolith boss moveset.

## Command line

Progress lives in `~/.config/LinuxCockpit/claudeadv/stats.json` and can be read or written via commands:

```bash
claudeadv.stats                                   # read progress (unlocked levels / best records)
claudeadv.record --level 1 --time 83.4 --tokens 21 --deaths 0   # record a clear
claudeadv.reset --confirm true                    # wipe all progress
```

## FAQ

**Out of Tokens?** Tokens are both coins and ammo: grab coins and hit `?` blocks; the boss fight rains Tokens periodically. After a rollback you keep at least 3 Tokens.

**The context window kills you at 100%?** Yes — the top bar filling up means "context overflow". Grab a summary scroll (/compact) to instantly clear 35%, or roll back on death to the checkpoint's context (capped at 70%).

**Stuck on a level?** Replay any unlocked level from **Level Select** on the title screen; each level's records are tracked independently.

**What happens when the window loses focus?** The game auto-pauses — it never keeps running while you're away.
