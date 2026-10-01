# Mechanics

> Last updated: 2026-10-01

## Tokens & `{}` shots

- Tokens are coins and ammo: grab coins and hit `?` blocks to get them; each `{}` shot costs 1.
- You start with 5 Tokens; shots have a 0.22s cooldown.
- Firing with no Tokens shows "Out of Tokens!" and never goes negative.
- `{}` can hit bugs, flies, the boss, and trigger `?` / `!` blocks; hitting a saw just sparks (it's an infinite loop — can't be fixed).
- Hold jump after a stomp to bounce higher.

## Context window & summary scrolls

- The top-center bar is your context window and grows over time; each level has a different limit (levels 1–2: 240s, levels 3–4: 260s, level 5: 300s).
- At 100% you die of "context overflow".
- Grabbing a summary scroll (/compact) instantly clears 35% of context.
- Bar color: green under 60%, yellow under 85%, red and flashing at 85%+.

## Hurt / invulnerability / death / rollback

- 3 hearts = 3 HP. Touching enemies, spikes, the boss or its projectiles costs 1 heart and knocks you back.
- After taking damage you get 1.4s of invulnerability (flickering); after a rollback you spawn with 1.5s.
- Lava is instant death; falling out of the map also kills you.
- On death you roll back to the last checkpoint (git flag):
  - Position returns to the checkpoint;
  - Context returns to the value recorded at the checkpoint, capped at 70%;
  - Tokens are floored at 3 (never lower than before the rollback);
  - All `{}` shots and boss projectiles are cleared.
- Dying during the boss fight: the boss refills to full HP, returns to sleep, the gate reopens, and its summoned bugs are cleared.

## Jump pads

- Bounce you very high (~10 tiles) and refill your double jump.
- The sign reads "npm install --force".

## One-way platforms

- One-way platforms (planks / clouds) can be passed through from below and landed on from above.
- Stand on one and press **↓** to drop through (with a 0.25s grace period so you don't slip by accident).

## Item blocks

- `?` blocks: bump to release 1 Token, then turn gray.
- `!` blocks: bump to release a heart (or +3 Tokens at full HP).
- Triggered by hitting them from below; `{}` shots also work.
- A bug standing on a block you bump gets squashed.
