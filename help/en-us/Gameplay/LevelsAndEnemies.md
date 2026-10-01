# Levels & Enemies

> Last updated: 2026-10-01

## The five levels

### Level 1 · Terminal Meadows (tutorial)

Signposts walk you through every basic move: moving, jumping, stomping bugs, firing `{}`, jump pads, summary scrolls, and hallucination ghosts, ending with a moving-platform river crossing. The place to learn the ropes.

### Level 2 · Codebase Jungle

One-way branches form the jump route, infinite-loop saws appear, flies patrol between platforms, and a big gap needs two moving platforms in relay.

### Level 3 · Dependency Hell

Lava pools in force, spikes and saw arrays interleave, moving platforms cross the lava. The sign warns: "Lava is instant death (so are dependency conflicts)".

### Level 4 · The Cloud

One-way clouds stretch over a bottomless abyss, jump pads launch you to high platforms, and flies and ghosts drift between the clouds.

### Level 5 · Production

A short warm-up corridor (bugs, saws, spikes, flies), then past a checkpoint into the arena where the Legacy Monolith awakens.

## Enemy gallery

| Enemy | Look | Behavior | Counter |
| --- | --- | --- | --- |
| Bug | Green beetle, six legs | Patrols back and forth, turns at edges | Stomp its head to "fix" it, or shoot it |
| Fly | Purple moth | Hovers around its spawn point, bobbing up and down | Stompable, or shoot it |
| Hallucination ghost | Semi-transparent ghost | Freezes (covering its face) while you face it, creeps closer when you don't | Back away while facing it, or avoid it; touching it hurts |
| Infinite-loop saw | Spinning circular saw | Slides back and forth along a fixed straight line (vertical or horizontal) | Untouchable — time your dodges |

## Boss · Legacy Monolith

A gray boulder covered in `// TODO`, `FIXME` and `v0.0.1` graffiti, with 24 HP.

**Trigger**: walk into the arena (back half of level 5), the gate slams shut, the boss wakes, and the music changes.

**Moves**:

- **Walk**: slowly walks toward you.
- **Jump**: leaps at you and emits shockwaves along the ground on landing (jump over or dodge them).
- **Summon**: spawns 2 bugs at a time (only while fewer than 3 of its summoned bugs are alive).
- **Throw TODO bricks** (phase 2 only): lobs 3 bricks in an arc.
- **Token rain**: a Token drops from the sky every 3.5s during the fight, so you never run dry.

**Phases**:

- Phase 1 (HP > 12): walk / jump / summon.
- Phase 2 (HP ≤ 12, enraged): body reddens, moves faster, and unlocks brick throws.

**Strategy**:

- Stomp its head for 2 damage (0.6s invulnerability window), or shoot `{}` for 1 damage each.
- Watch for bricks in phase 2; the summoned bugs can be stomped to clear them out.
- On death the boss refills, the gate reopens, and you retry from the checkpoint.

**Defeat**: the boss explodes, a goal terminal appears in the arena center, and reaching it clears the game into the ending.
