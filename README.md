# Claude 历险记 · Claude's Adventure

A small 2D side-scrolling platformer, packaged as an ability for
[Linux System Cockpit](https://github.com/aaaa0ggMC) (Electron + Vue 3 + Vuetify).

> Unofficial fan game. Not affiliated with or endorsed by Anthropic.

Claude is a coral-orange little starburst. Starting from the request "can you fix this bug for me?",
it has to cross five levels and finally ship the code to production:

| # | Level | What's new |
|---|-------|------------|
| 1 | Terminal Meadows · 终端草原 | Tutorial: running, double jump, stomping bugs, `{}` shots, jump pads, scrolls, ghosts |
| 2 | Codebase Jungle · 代码丛林 | One-way branches, infinite-loop saws, flying bugs, moving platforms |
| 3 | Dependency Hell · 依赖地狱 | Lava pits, spikes, saw gauntlets |
| 4 | The Cloud · 云端 | Bottomless gaps, cloud platforms, chained jump pads |
| 5 | Production · 生产环境 | Boss fight: the **Legacy Monolith** |

## Mechanics

- **Tokens** are coins *and* ammo: each `{}` tool call you fire costs one.
- The **context window** at the top of the screen is your timer. When it overflows, you die.
  Summary scrolls (`/compact`) free 35% of it.
- **Hallucination ghosts** freeze while you face them and creep closer when you turn away.
- **git flags** are checkpoints. When you die, you roll back to the last commit.
- Coyote time, jump buffering, variable jump height and a mid-air double jump.

## Controls

| Key | Action |
|-----|--------|
| ← → / A D | Move |
| Space / W / ↑ / Z | Jump (press again mid-air to double jump) |
| ↓ / S | Drop through one-way platforms |
| X / J / K | Fire `{}` (costs 1 Token) |
| Esc / P | Pause |

## Install

```bash
cd <launcher>/src/abilities
git clone https://github.com/aaaa0ggMC/launcher-claudeadv.git claudeadv
cd ../.. && pnpm install
```

The folder name must be `claudeadv`. The game has no third-party dependencies.

Progress is saved to `~/.config/LinuxCockpit/claudeadv/stats.json`. You can also manage it
from the Cockpit CLI:

```bash
claudeadv.stats
claudeadv.record --level 1 --time 83.4 --tokens 21 --deaths 0
claudeadv.reset --confirm true
```

## How it's made

- `game/engine.ts`: state machine, physics, enemies, boss, rendering (Canvas 2D, 960×540)
- `game/levels.ts`: levels built from coordinates with a small builder
- `game/sprites.ts`: every character, enemy, tile and item is drawn procedurally
- `game/audio.ts`: sound effects and chiptune music, synthesized live with WebAudio
- `assets/*.jpg`: the painted backgrounds were generated locally with ComfyUI (Z-Image Turbo)

## License

MIT. See [LICENSE](LICENSE).
