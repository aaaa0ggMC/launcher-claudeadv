/**
 * Claude 历险记 —— 2D 横版平台跳跃引擎（纯 canvas 2D，960×540 逻辑分辨率）。
 *
 * 状态机：title → select / help → intro → play ⇄ pause → dying → (respawn) → clear → … → ending
 * 物理：轴分离的 AABB × 瓦片网格碰撞；单向平台只在下落且上一帧脚底在平台之上时生效。
 * 手感：土狼时间 0.1s、跳跃缓冲 0.13s、松键截断上升（小跳）、空中二段跳。
 *
 * 主题梗：Token = 金币兼弹药（发射 `{}` 工具调用耗 1 个）；上下文窗口 = 关卡计时，
 * 满了就「上下文溢出」挂掉，摘要卷轴（/compact）能清掉 35%；幻觉幽灵你盯着它就不动。
 */

import { LEVELS, ROWS, TILE, type LevelDef, type Spawn } from './levels'
import {
  THEMES,
  drawBoss,
  drawBug,
  drawCheckpoint,
  drawClaude,
  drawCoin,
  drawFly,
  drawGhost,
  drawGoal,
  drawHeart,
  drawItemBlock,
  drawLava,
  drawPad,
  drawSaw,
  drawScroll,
  drawShockwave,
  drawShot,
  drawTile,
  drawTodoBrick,
  CLAUDE_ORANGE,
  type Theme
} from './sprites'
import { GameAudio, type Sfx } from './audio'
import type { GameAssets } from './assets'

export const VIEW_W = 960
export const VIEW_H = 540

const GRAV = 1900
const MAX_FALL = 900
const RUN = 240
const JUMP_V = 640
const DJUMP_V = 560
const PAD_V = 1150
const SHOT_V = 560
const MAX_HP = 3
const START_TOKENS = 5
const BOSS_HP = 24

const FONT = '"Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", system-ui, sans-serif'
const MONO = 'ui-monospace, "JetBrains Mono", "Fira Code", monospace'

export interface LevelRecord {
  clears: number
  bestTime: number | null
  bestTokens: number
  fewestDeaths: number | null
}

export interface ClaudeAdvStats {
  version: 1
  unlocked: number
  levels: Record<string, LevelRecord>
  endings: number
}

export interface RunResult {
  level: number
  time: number
  tokens: number
  deaths: number
}

export interface GameHost {
  t: (key: string, fallback?: string) => string
  te: (key: string, vars: Record<string, string | number>) => string
  record: (r: RunResult) => Promise<ClaudeAdvStats | null>
  getStats: () => Promise<ClaudeAdvStats | null>
}

type Mode = 'title' | 'select' | 'help' | 'intro' | 'play' | 'pause' | 'dying' | 'clear' | 'ending'
type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'shoot' | 'pause' | 'confirm' | 'back'

/** 标题画面输入任一暗号 → 切换隐藏角色「金色 Claude」（无敌，演示用） */
const CHEAT_CODES = ['AAAA0GGMC', 'CLAUDE']
const CHEAT_KEY = 'claudeadv-cheat'

const KEYMAP: Record<string, Action[]> = {
  ArrowLeft: ['left'],
  KeyA: ['left'],
  ArrowRight: ['right'],
  KeyD: ['right'],
  ArrowUp: ['jump', 'up'],
  KeyW: ['jump', 'up'],
  Space: ['jump', 'confirm'],
  KeyZ: ['jump'],
  ArrowDown: ['down'],
  KeyS: ['down'],
  KeyX: ['shoot'],
  KeyJ: ['shoot'],
  KeyK: ['shoot'],
  Escape: ['pause', 'back'],
  KeyP: ['pause'],
  Enter: ['confirm'],
  NumpadEnter: ['confirm']
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Player extends Box {
  vx: number
  vy: number
  onGround: boolean
  facing: 1 | -1
  coyote: number
  buffer: number
  airJumps: number
  canCut: boolean
  hp: number
  invuln: number
  dropTimer: number
  shootCd: number
  ride: Plat | null
  stretch: number
  blinkT: number
  anim: number
  spin: number
}

interface Plat {
  x0: number
  y0: number
  w: number
  dx: number
  dy: number
  period: number
  phase: number
  x: number
  y: number
}

interface Enemy extends Box {
  kind: 'bug' | 'fly' | 'ghost' | 'saw'
  vx: number
  vy: number
  facing: number
  alive: boolean
  /** 死亡动画倒计时（压扁 / 消散） */
  dead: number
  bx: number
  by: number
  ax: number
  ay: number
  period: number
  phase: number
  t: number
  shy: boolean
  onGround: boolean
  fromBoss: boolean
}

interface Boss extends Box {
  vx: number
  vy: number
  hp: number
  state: 'sleep' | 'intro' | 'idle' | 'walk' | 'jump' | 'summon' | 'throw' | 'dying' | 'gone'
  timer: number
  facing: number
  flash: number
  invuln: number
  onGround: boolean
  squash: number
  homeX: number
  homeY: number
  rainT: number
}

interface Coin {
  x: number
  y: number
  vy: number
  falling: boolean
  taken: boolean
}

interface Pickup {
  kind: 'heart' | 'scroll'
  x: number
  y: number
  taken: boolean
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: string
  size: number
  grav: number
}

interface Floater {
  x: number
  y: number
  text: string
  life: number
  color: string
}

interface Shot {
  x: number
  y: number
  vx: number
  life: number
}

interface BossShot {
  kind: 'wave' | 'brick'
  x: number
  y: number
  vx: number
  vy: number
  life: number
}

interface Button extends Box {
  id: string
  label: string
  enabled: boolean
  onClick: () => void
}

const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))

const loadCheat = (): boolean => {
  try {
    return localStorage.getItem(CHEAT_KEY) === '1'
  } catch {
    return false
  }
}

const fmtTime = (s: number): string => {
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${m}:${r.toFixed(1).padStart(4, '0')}`
}

export class ClaudeAdventure {
  private ctx: CanvasRenderingContext2D
  private audio = new GameAudio()
  private raf = 0
  private last = 0
  private time = 0

  private mode: Mode = 'title'
  private down = new Set<Action>()
  private pressed = new Set<Action>()
  private buttons: Button[] = []
  private menuIndex = 0
  private stats: ClaudeAdvStats | null = null

  // ── 关卡运行时 ──
  private level: LevelDef = LEVELS[0]
  private theme: Theme = THEMES.meadow
  private tiles: string[][] = []
  private staticLayer: HTMLCanvasElement | null = null
  private bumps = new Map<string, number>()
  private player!: Player
  private plats: Plat[] = []
  private enemies: Enemy[] = []
  private boss: Boss | null = null
  private coins: Coin[] = []
  private pickups: Pickup[] = []
  private pads: { x: number; y: number; squash: number }[] = []
  private checks: { x: number; y: number; active: boolean }[] = []
  private goal: { x: number; y: number } | null = null
  private signs: { x: number; y: number; text: string }[] = []
  private shots: Shot[] = []
  private bossShots: BossShot[] = []
  private particles: Particle[] = []
  private floaters: Floater[] = []
  private cam = { x: 0, y: 0 }
  private shake = 0
  private respawn = { x: 0, y: 0, context: 0 }
  private tokens = START_TOKENS
  private collected = 0
  private deaths = 0
  private elapsed = 0
  private contextUsed = 0
  private modeT = 0
  private deathCause = ''
  private gateClosed = false
  private clearInfo: {
    time: number
    tokens: number
    deaths: number
    best: LevelRecord | null
    newBest: boolean
  } | null = null
  private toast: { text: string; life: number } | null = null
  private cheat = loadCheat()
  private cheatBuf = ''

  private readonly onKeyDown = (e: KeyboardEvent): void => this.handleKey(e, true)
  private readonly onKeyUp = (e: KeyboardEvent): void => this.handleKey(e, false)
  private readonly onBlur = (): void => {
    this.down.clear()
    if (this.mode === 'play') this.setMode('pause')
  }
  private readonly onVisibility = (): void => {
    if (document.hidden) this.onBlur()
  }
  private readonly onMouseMove = (e: MouseEvent): void => {
    const p = this.toCanvas(e)
    const hit = this.buttons.findIndex((b) => b.enabled && this.inBox(p, b))
    if (hit >= 0) this.menuIndex = hit
    this.canvas.style.cursor = hit >= 0 ? 'pointer' : 'default'
  }
  private readonly onMouseDown = (e: MouseEvent): void => {
    // 抢回焦点：否则方向键 / 空格会落到刚点过的音量滑块、静音按钮上
    this.canvas.focus({ preventScroll: true })
    this.audio.unlock()
    const p = this.toCanvas(e)
    const b = this.buttons.find((b) => b.enabled && this.inBox(p, b))
    if (b) {
      this.audio.play('select')
      b.onClick()
    } else if (this.mode === 'intro') {
      this.setMode('play')
    } else if (this.mode === 'help') {
      this.setMode('title')
    }
  }

  constructor(
    private canvas: HTMLCanvasElement,
    private assets: GameAssets,
    private host: GameHost
  ) {
    canvas.width = VIEW_W
    canvas.tabIndex = 0
    canvas.style.outline = 'none'
    canvas.height = VIEW_H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d unavailable')
    this.ctx = ctx
  }

  async init(): Promise<void> {
    this.stats = await this.host.getStats().catch(() => null)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.canvas.addEventListener('mousemove', this.onMouseMove)
    this.canvas.addEventListener('mousedown', this.onMouseDown)
    this.setMode('title')
  }

  /** 清除游戏数据后调用：换上新进度、关掉隐藏角色、回到标题 */
  resetProgress(stats: ClaudeAdvStats | null): void {
    this.stats = stats
    this.cheat = false
    this.cheatBuf = ''
    try {
      localStorage.removeItem(CHEAT_KEY)
    } catch {
      // ignore
    }
    this.down.clear()
    this.setMode('title')
    this.showToast(this.host.t('claudeadv.reset.done'))
  }

  start(): void {
    this.last = performance.now()
    const loop = (now: number): void => {
      const dt = Math.min(1 / 30, (now - this.last) / 1000)
      this.last = now
      this.time += dt
      this.update(dt)
      this.render()
      this.pressed.clear()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  destroy(): void {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.canvas.removeEventListener('mousemove', this.onMouseMove)
    this.canvas.removeEventListener('mousedown', this.onMouseDown)
    this.audio.destroy()
  }

  setVolume(v: number): void {
    this.audio.setVolume(v)
  }

  setMuted(m: boolean): void {
    this.audio.setMuted(m)
  }

  // ───────────────────────── 输入 ─────────────────────────

  private handleKey(e: KeyboardEvent, isDown: boolean): void {
    const tgt = e.target as HTMLElement | null
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable))
      return
    if (!this.canvas.isConnected) return
    if (isDown && !e.repeat && this.mode === 'title') this.typeCheat(e.code)
    const acts = KEYMAP[e.code]
    if (!acts) return
    e.preventDefault()
    if (isDown) this.audio.unlock()
    for (const a of acts) {
      if (isDown) {
        if (!e.repeat) this.pressed.add(a)
        this.down.add(a)
      } else {
        this.down.delete(a)
      }
    }
  }

  private typeCheat(code: string): void {
    const m = /^(?:Key|Digit|Numpad)([A-Z0-9])$/.exec(code)
    if (!m) return
    this.cheatBuf = (this.cheatBuf + m[1]).slice(-16)
    if (!CHEAT_CODES.some((c) => this.cheatBuf.endsWith(c))) return
    this.cheatBuf = ''
    this.cheat = !this.cheat
    try {
      if (this.cheat) localStorage.setItem(CHEAT_KEY, '1')
      else localStorage.removeItem(CHEAT_KEY)
    } catch {
      // 存不了就只在本次生效
    }
    this.sfx(this.cheat ? 'clear' : 'select')
    this.showToast(this.host.t(this.cheat ? 'claudeadv.cheat.on' : 'claudeadv.cheat.off'))
  }

  private toCanvas(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * VIEW_W,
      y: ((e.clientY - r.top) / r.height) * VIEW_H
    }
  }

  private inBox(p: { x: number; y: number }, b: Box): boolean {
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
  }

  private sfx(s: Sfx): void {
    this.audio.play(s)
  }

  // ───────────────────────── 状态切换 ─────────────────────────

  private setMode(m: Mode): void {
    this.mode = m
    this.modeT = 0
    this.menuIndex = 0
    if (m === 'title' || m === 'select' || m === 'help' || m === 'ending')
      this.audio.playMusic('title')
    if (m === 'play' && !this.boss) this.audio.playMusic(this.level.theme)
    if (m === 'play' && this.boss)
      this.audio.playMusic(this.boss.state === 'sleep' ? this.level.theme : 'boss')
  }

  private unlocked(): number {
    if (this.cheat) return LEVELS.length
    return clamp(this.stats?.unlocked ?? 1, 1, LEVELS.length)
  }

  private startLevel(index: number): void {
    const def = LEVELS[clamp(index, 1, LEVELS.length) - 1]
    this.level = def
    this.theme = THEMES[def.theme]
    this.tiles = def.tiles.map((r) => r.split(''))
    this.bumps.clear()
    this.plats = []
    this.enemies = []
    this.boss = null
    this.coins = []
    this.pickups = []
    this.pads = []
    this.checks = []
    this.goal = null
    this.signs = []
    this.shots = []
    this.bossShots = []
    this.particles = []
    this.floaters = []
    this.tokens = START_TOKENS
    this.collected = 0
    this.deaths = 0
    this.elapsed = 0
    this.contextUsed = 0
    this.gateClosed = false
    this.clearInfo = null
    for (const s of def.spawns) this.spawn(s)
    this.respawn = { x: def.start.x * TILE + 5, y: (def.start.y + 1) * TILE - 26, context: 0 }
    this.player = this.newPlayer(this.respawn.x, this.respawn.y)
    this.buildStatic()
    this.cam.x = clamp(this.player.x - VIEW_W / 3, 0, this.levelW() - VIEW_W)
    this.cam.y = ROWS * TILE - VIEW_H
    this.setMode('intro')
  }

  private newPlayer(x: number, y: number): Player {
    return {
      x,
      y,
      w: 22,
      h: 26,
      vx: 0,
      vy: 0,
      onGround: false,
      facing: 1,
      coyote: 0,
      buffer: 0,
      airJumps: 1,
      canCut: false,
      hp: MAX_HP,
      invuln: 0,
      dropTimer: 0,
      shootCd: 0,
      ride: null,
      stretch: 1,
      blinkT: 2,
      anim: 0,
      spin: 0
    }
  }

  private spawn(s: Spawn): void {
    const px = s.x * TILE
    const py = s.y * TILE
    const enemy = (kind: Enemy['kind'], w: number, h: number): Enemy => ({
      kind,
      x: px + (TILE - w) / 2,
      y: py + TILE - h,
      w,
      h,
      vx: 0,
      vy: 0,
      facing: -1,
      alive: true,
      dead: 0,
      bx: px,
      by: py,
      ax: 0,
      ay: 0,
      period: 1,
      phase: Math.random(),
      t: 0,
      shy: false,
      onGround: false,
      fromBoss: false
    })
    switch (s.kind) {
      case 'bug':
        this.enemies.push(enemy('bug', 26, 20))
        break
      case 'fly': {
        const e = enemy('fly', 26, 20)
        e.y = py + 6
        e.by = e.y
        e.vx = -70
        this.enemies.push(e)
        break
      }
      case 'ghost': {
        const e = enemy('ghost', 28, 30)
        this.enemies.push(e)
        break
      }
      case 'saw': {
        const e = enemy('saw', 26, 26)
        e.bx = px + TILE / 2
        e.by = py + TILE / 2
        e.ax = s.ax * TILE
        e.ay = s.ay * TILE
        e.period = s.period
        e.phase = s.phase
        this.enemies.push(e)
        break
      }
      case 'plat':
        this.plats.push({
          x0: px,
          y0: py,
          w: s.w * TILE,
          dx: s.dx * TILE,
          dy: s.dy * TILE,
          period: s.period,
          phase: s.phase,
          x: px,
          y: py
        })
        break
      case 'coin':
        this.coins.push({ x: px + TILE / 2, y: py + TILE / 2, vy: 0, falling: false, taken: false })
        break
      case 'heart':
      case 'scroll':
        this.pickups.push({ kind: s.kind, x: px + TILE / 2, y: py + TILE / 2, taken: false })
        break
      case 'pad':
        this.pads.push({ x: px, y: py, squash: 0 })
        break
      case 'check':
        this.checks.push({ x: px, y: py, active: false })
        break
      case 'goal':
        this.goal = { x: px, y: py }
        break
      case 'sign':
        this.signs.push({ x: px, y: py, text: s.text })
        break
      case 'boss':
        this.boss = {
          x: px - 32,
          y: py + TILE - 96,
          w: 96,
          h: 96,
          vx: 0,
          vy: 0,
          hp: BOSS_HP,
          state: 'sleep',
          timer: 0,
          facing: -1,
          flash: 0,
          invuln: 0,
          onGround: true,
          squash: 0,
          homeX: px - 32,
          homeY: py + TILE - 96,
          rainT: 3
        }
        break
    }
  }

  private levelW(): number {
    return this.level.width * TILE
  }

  // ───────────────────────── 瓦片查询 ─────────────────────────

  private tileAt(tx: number, ty: number): string {
    if (tx < 0 || tx >= this.level.width) return '#'
    if (ty < 0 || ty >= ROWS) return '.'
    return this.tiles[ty][tx]
  }

  private isSolid(c: string): boolean {
    return c === '#' || c === '=' || c === '?' || c === '!' || c === 'u' || c === 'X'
  }

  private buildStatic(): void {
    const cv = document.createElement('canvas')
    cv.width = this.levelW()
    cv.height = ROWS * TILE
    const g = cv.getContext('2d')
    if (!g) return
    for (let ty = 0; ty < ROWS; ty++)
      for (let tx = 0; tx < this.level.width; tx++) this.paintStatic(g, tx, ty)
    this.staticLayer = cv
  }

  private paintStatic(g: CanvasRenderingContext2D, tx: number, ty: number): void {
    g.clearRect(tx * TILE, ty * TILE, TILE, TILE)
    const c = this.tiles[ty][tx]
    if (c === '.' || c === '~' || c === '?' || c === '!' || c === 'u') return
    drawTile(g, c, tx, ty, this.theme, this.level.theme, (dx, dy) => {
      const n = this.tileAt(tx + dx, ty + dy)
      return n === c || (c === '#' && n === 'X')
    })
  }

  private setTile(tx: number, ty: number, c: string): void {
    this.tiles[ty][tx] = c
    const g = this.staticLayer?.getContext('2d')
    if (!g) return
    for (const [dx, dy] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1]
    ]) {
      const x = tx + dx
      const y = ty + dy
      if (x >= 0 && x < this.level.width && y >= 0 && y < ROWS) this.paintStatic(g, x, y)
    }
  }

  // ───────────────────────── 通用碰撞移动 ─────────────────────────

  /** 返回是否撞墙 */
  private moveX(b: Box & { vx: number }, dx: number): boolean {
    b.x += dx
    const top = Math.floor(b.y / TILE)
    const bot = Math.floor((b.y + b.h - 0.01) / TILE)
    if (dx > 0) {
      const tx = Math.floor((b.x + b.w - 0.01) / TILE)
      for (let ty = top; ty <= bot; ty++)
        if (this.isSolid(this.tileAt(tx, ty))) {
          b.x = tx * TILE - b.w
          b.vx = 0
          return true
        }
    } else if (dx < 0) {
      const tx = Math.floor(b.x / TILE)
      for (let ty = top; ty <= bot; ty++)
        if (this.isSolid(this.tileAt(tx, ty))) {
          b.x = (tx + 1) * TILE
          b.vx = 0
          return true
        }
    }
    return false
  }

  /**
   * 纵向移动。下落时落在实心 / 单向平台 / 移动平台上；上升撞头时返回撞到的瓦片。
   */
  private moveY(
    b: Box & { vy: number; onGround: boolean },
    dy: number,
    oneWay: boolean,
    onHead?: (tx: number, ty: number) => void
  ): Plat | null {
    const prevBottom = b.y + b.h
    b.y += dy
    b.onGround = false
    const left = Math.floor(b.x / TILE)
    const right = Math.floor((b.x + b.w - 0.01) / TILE)
    if (dy > 0) {
      const ty = Math.floor((b.y + b.h - 0.01) / TILE)
      for (let tx = left; tx <= right; tx++) {
        const c = this.tileAt(tx, ty)
        if (this.isSolid(c) || (oneWay && c === '-' && prevBottom <= ty * TILE + 0.5)) {
          b.y = ty * TILE - b.h
          b.vy = 0
          b.onGround = true
          return null
        }
      }
      if (oneWay)
        for (const p of this.plats) {
          if (b.x + b.w > p.x && b.x < p.x + p.w && prevBottom <= p.y + 0.5 && b.y + b.h >= p.y) {
            b.y = p.y - b.h
            b.vy = 0
            b.onGround = true
            return p
          }
        }
    } else if (dy < 0) {
      const ty = Math.floor(b.y / TILE)
      let hit = -1
      let best = Infinity
      const cx = b.x + b.w / 2
      for (let tx = left; tx <= right; tx++)
        if (this.isSolid(this.tileAt(tx, ty))) {
          const d = Math.abs(tx * TILE + TILE / 2 - cx)
          if (d < best) {
            best = d
            hit = tx
          }
        }
      if (hit >= 0) {
        b.y = (ty + 1) * TILE
        b.vy = 0
        onHead?.(hit, ty)
      }
    }
    return null
  }

  // ───────────────────────── 更新 ─────────────────────────

  private update(dt: number): void {
    this.modeT += dt
    if (this.toast) {
      this.toast.life -= dt
      if (this.toast.life <= 0) this.toast = null
    }
    switch (this.mode) {
      case 'title':
        this.menuNav(3)
        break
      case 'select':
        this.menuNav(LEVELS.length + 1)
        if (this.pressed.has('back')) this.setMode('title')
        break
      case 'help':
        if (this.pressed.has('back') || this.pressed.has('confirm')) this.setMode('title')
        break
      case 'intro':
        this.updateParticles(dt)
        if (
          this.modeT > 2.4 ||
          (this.modeT > 0.3 && (this.pressed.has('confirm') || this.pressed.has('jump')))
        )
          this.setMode('play')
        break
      case 'play':
        if (this.pressed.has('pause')) {
          this.setMode('pause')
          break
        }
        this.updatePlay(dt)
        break
      case 'pause':
        this.menuNav(3)
        if (this.pressed.has('pause') && this.modeT > 0.05) this.setMode('play')
        break
      case 'dying':
        this.updateDying(dt)
        break
      case 'clear':
        this.updateParticles(dt)
        if (this.modeT > 0.8 && (this.pressed.has('confirm') || this.pressed.has('jump')))
          this.afterClear()
        break
      case 'ending':
        this.updateParticles(dt)
        if (Math.random() < dt * 6) this.confetti(Math.random() * VIEW_W, -10, true)
        if (this.modeT > 1.5 && this.pressed.has('confirm')) this.setMode('title')
        break
    }
  }

  /** 键盘菜单导航：上下 / 左右移动，确认触发当前按钮 */
  private menuNav(count: number): void {
    const prev = this.menuIndex
    if (this.pressed.has('up') || this.pressed.has('left'))
      this.menuIndex = (this.menuIndex + count - 1) % count
    if (this.pressed.has('down') || this.pressed.has('right'))
      this.menuIndex = (this.menuIndex + 1) % count
    if (prev !== this.menuIndex) this.sfx('select')
    if (this.pressed.has('confirm') && this.modeT > 0.15) {
      const b = this.buttons[this.menuIndex]
      if (b?.enabled) {
        this.sfx('select')
        b.onClick()
      } else if (b) this.sfx('empty')
    }
  }

  private updatePlay(dt: number): void {
    const p = this.player
    this.elapsed += dt
    if (!this.cheat) this.contextUsed += dt / this.level.contextSeconds
    if (this.contextUsed >= 1) {
      this.contextUsed = 1
      this.die('context')
      return
    }
    this.updatePlats()
    this.updatePlayer(dt)
    if (this.mode !== 'play') return
    this.updateEnemies(dt)
    this.updateBoss(dt)
    this.updateShots(dt)
    this.updatePickups(dt)
    this.updateParticles(dt)
    for (const pad of this.pads) pad.squash = Math.max(0, pad.squash - dt * 4)
    for (const [k, v] of this.bumps) {
      if (v <= 0) this.bumps.delete(k)
      else this.bumps.set(k, v - dt * 6)
    }
    this.shake = Math.max(0, this.shake - dt * 2)

    // 摔出地图
    if (p.y > ROWS * TILE + 40) {
      if (this.cheat) {
        p.x = this.respawn.x
        p.y = this.respawn.y
        p.vx = 0
        p.vy = 0
        p.invuln = 1
      } else this.die('fall')
    }

    // 相机：带前瞻的平滑跟随
    const tx = clamp(p.x + p.w / 2 - VIEW_W / 2 + p.facing * 70, 0, this.levelW() - VIEW_W)
    this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 6)
    const ty = clamp(p.y - VIEW_H * 0.55, 0, ROWS * TILE - VIEW_H)
    this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 4)
    if (this.boss && this.gateClosed && this.level.arena) {
      const a = this.level.arena
      this.cam.x = clamp(this.cam.x, a.gateX * TILE - 16, (a.x1 + 3) * TILE - VIEW_W)
    }
  }

  private updatePlats(): void {
    const p = this.player
    for (const pl of this.plats) {
      const ox = pl.x
      const oy = pl.y
      const s = Math.sin(((this.elapsed / pl.period + pl.phase) * Math.PI * 2) % (Math.PI * 2))
      pl.x = pl.x0 + (pl.dx * (s + 1)) / 2
      pl.y = pl.y0 + (pl.dy * s) / 2
      if (p.ride === pl) {
        this.moveX(p, pl.x - ox)
        p.y = pl.y - p.h
        if (pl.y - oy > 0) p.vy = 0
      }
    }
  }

  private updatePlayer(dt: number): void {
    const p = this.player
    p.anim += dt
    p.invuln = Math.max(0, p.invuln - dt)
    p.dropTimer = Math.max(0, p.dropTimer - dt)
    p.shootCd = Math.max(0, p.shootCd - dt)
    p.blinkT -= dt
    if (p.blinkT < -0.12) p.blinkT = 2 + Math.random() * 3
    p.stretch += (1 - p.stretch) * Math.min(1, dt * 12)
    p.spin *= Math.max(0, 1 - dt * 10)

    const dir = (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0)
    if (dir !== 0) p.facing = dir > 0 ? 1 : -1
    const target = dir * RUN
    const accel = p.onGround ? (dir === 0 ? 2600 : 2200) : 1400
    if (p.vx < target) p.vx = Math.min(target, p.vx + accel * dt)
    else if (p.vx > target) p.vx = Math.max(target, p.vx - accel * dt)

    // 跳跃：缓冲 + 土狼时间 + 二段跳
    if (this.pressed.has('jump')) p.buffer = 0.13
    else p.buffer = Math.max(0, p.buffer - dt)
    p.coyote = p.onGround ? 0.1 : Math.max(0, p.coyote - dt)

    // ↓ 穿过单向平台
    if (this.pressed.has('down') && p.onGround && this.standingOnOneWay()) {
      p.dropTimer = 0.25
      p.ride = null
      p.y += 2
      p.onGround = false
    }

    if (p.buffer > 0) {
      if (p.coyote > 0) {
        p.vy = -JUMP_V
        p.coyote = 0
        p.buffer = 0
        p.canCut = true
        p.onGround = false
        p.ride = null
        p.stretch = 1.3
        this.sfx('jump')
        this.dust(p.x + p.w / 2, p.y + p.h, 5)
      } else if (p.airJumps > 0) {
        p.vy = -DJUMP_V
        p.airJumps = 0
        p.buffer = 0
        p.canCut = true
        p.spin = p.facing * Math.PI * 2
        p.stretch = 1.25
        this.sfx('djump')
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2
          this.particles.push({
            x: p.x + p.w / 2,
            y: p.y + p.h,
            vx: Math.cos(a) * 120,
            vy: Math.sin(a) * 40 + 40,
            life: 0.35,
            max: 0.35,
            color: '#ffd9c4',
            size: 3,
            grav: 0
          })
        }
      }
    }
    if (!this.down.has('jump') && p.canCut && p.vy < -220) {
      p.vy *= 0.5
      p.canCut = false
    }

    // 发射 {}
    if (this.pressed.has('shoot') && p.shootCd <= 0) {
      p.shootCd = 0.22
      if (this.tokens <= 0) {
        this.sfx('empty')
        this.float(p.x + p.w / 2, p.y - 8, this.host.t('claudeadv.msg.noTokens'), '#ff9a8a')
      } else {
        this.tokens--
        this.shots.push({
          x: p.x + p.w / 2 + p.facing * 12,
          y: p.y + 12,
          vx: SHOT_V * p.facing + p.vx * 0.3,
          life: 0.9
        })
        this.sfx('shoot')
      }
    }

    p.vy = Math.min(MAX_FALL, p.vy + GRAV * dt)
    const wasGround = p.onGround
    const fallSpeed = p.vy
    this.moveX(p, p.vx * dt)
    const plat = this.moveY(p, p.vy * dt, p.dropTimer <= 0, (tx, ty) => this.hitBlock(tx, ty))
    p.ride = plat
    if (p.onGround) {
      p.airJumps = 1
      p.canCut = false
      if (!wasGround && fallSpeed > 300) {
        p.stretch = 0.7
        this.dust(p.x + p.w / 2, p.y + p.h, 4)
      }
    }

    // 尖刺 / 岩浆
    const l = Math.floor(p.x / TILE)
    const r = Math.floor((p.x + p.w - 0.01) / TILE)
    const t0 = Math.floor(p.y / TILE)
    const t1 = Math.floor((p.y + p.h - 0.01) / TILE)
    for (let ty = t0; ty <= t1; ty++)
      for (let tx = l; tx <= r; tx++) {
        const c = this.tileAt(tx, ty)
        if (c === '~' && p.y + p.h > ty * TILE + 8) {
          if (this.cheat) {
            p.vy = -640
            p.airJumps = 1
            continue
          }
          this.die('lava')
          return
        }
        if (c === '^' && p.y + p.h > ty * TILE + 14) {
          this.hurt(tx * TILE + TILE / 2)
          if (this.mode !== 'play') return
          p.vy = -480
          p.canCut = false
        }
      }

    // 弹跳垫
    for (const pad of this.pads) {
      const box = { x: pad.x + 2, y: pad.y + 16, w: TILE - 4, h: 16 }
      if (p.vy >= 0 && overlap(p, box)) {
        p.vy = -PAD_V
        p.airJumps = 1
        p.canCut = false
        p.onGround = false
        p.ride = null
        p.stretch = 1.4
        pad.squash = 1
        this.sfx('pad')
      }
    }
  }

  private standingOnOneWay(): boolean {
    const p = this.player
    if (p.ride) return true
    const ty = Math.floor((p.y + p.h + 1) / TILE)
    const l = Math.floor(p.x / TILE)
    const r = Math.floor((p.x + p.w - 0.01) / TILE)
    let any = false
    for (let tx = l; tx <= r; tx++) {
      const c = this.tileAt(tx, ty)
      if (this.isSolid(c)) return false
      if (c === '-') any = true
    }
    return any
  }

  private hitBlock(tx: number, ty: number): void {
    const c = this.tileAt(tx, ty)
    this.bumps.set(`${tx},${ty}`, 1)
    if (c === '?') {
      this.tiles[ty][tx] = 'u'
      this.tokens++
      this.collected++
      this.sfx('coin')
      this.float(tx * TILE + TILE / 2, ty * TILE - 10, '+1 Token', '#ffd34d')
      for (let i = 0; i < 6; i++) this.spark(tx * TILE + TILE / 2, ty * TILE, '#ffd34d')
    } else if (c === '!') {
      this.tiles[ty][tx] = 'u'
      this.pickups.push({
        kind: 'heart',
        x: tx * TILE + TILE / 2,
        y: (ty - 1) * TILE + TILE / 2,
        taken: false
      })
      this.sfx('power')
    } else {
      this.sfx('bump')
    }
    // 顶块顺手打死站在上面的敌人
    for (const e of this.enemies)
      if (
        e.alive &&
        e.kind === 'bug' &&
        overlap(e, { x: tx * TILE, y: ty * TILE - 6, w: TILE, h: 6 })
      )
        this.killEnemy(e)
  }

  private updateEnemies(dt: number): void {
    const p = this.player
    const pcx = p.x + p.w / 2
    for (const e of this.enemies) {
      e.t += dt
      if (!e.alive) {
        e.dead -= dt
        continue
      }
      switch (e.kind) {
        case 'bug': {
          if (Math.abs(e.x - p.x) > VIEW_W * 1.2 && !e.fromBoss) break
          e.vx = e.facing * (e.fromBoss ? 75 : 55)
          e.vy = Math.min(MAX_FALL, e.vy + GRAV * dt)
          if (this.moveX(e, e.vx * dt)) e.facing *= -1
          this.moveY(e, e.vy * dt, true)
          if (e.onGround) {
            const fx = e.facing > 0 ? e.x + e.w + 1 : e.x - 1
            const below = this.tileAt(Math.floor(fx / TILE), Math.floor((e.y + e.h + 2) / TILE))
            if (!this.isSolid(below) && below !== '-') e.facing *= -1
          }
          if (e.y > ROWS * TILE + 40) e.alive = false
          break
        }
        case 'fly': {
          e.x += e.vx * dt
          if (Math.abs(e.x - e.bx) > TILE * 3) {
            e.vx = -e.vx
            e.x = e.bx + Math.sign(e.x - e.bx) * TILE * 3
          }
          e.facing = Math.sign(e.vx) || 1
          e.y = e.by + Math.sin(e.t * 3 + e.phase * 6) * 12
          break
        }
        case 'ghost': {
          const gcx = e.x + e.w / 2
          const looking = Math.sign(gcx - pcx) === p.facing
          const dist = Math.hypot(gcx - pcx, e.y + e.h / 2 - (p.y + p.h / 2))
          e.shy = looking && dist < 520
          e.facing = gcx < pcx ? 1 : -1
          if (!e.shy && dist < 520) {
            const sp = 62 * dt
            e.x += (Math.sign(pcx - gcx) * sp * Math.abs(pcx - gcx)) / Math.max(1, dist)
            e.y += (sp * (p.y + p.h / 2 - (e.y + e.h / 2))) / Math.max(1, dist)
          }
          break
        }
        case 'saw': {
          const s = Math.sin(((e.t / e.period + e.phase) * Math.PI * 2) % (Math.PI * 2))
          e.x = e.bx + (e.ax * s) / 2 - e.w / 2
          e.y = e.by + (e.ay * s) / 2 - e.h / 2
          break
        }
      }
      // 与玩家交互
      if (this.mode !== 'play' || !overlap(p, e)) continue
      if (e.kind === 'ghost' && e.shy) continue
      const stompable = e.kind === 'bug' || e.kind === 'fly'
      if (stompable && p.vy > 0 && p.y + p.h - p.vy * dt <= e.y + 10) {
        this.killEnemy(e)
        p.vy = this.down.has('jump') ? -JUMP_V : -420
        p.canCut = false
        p.airJumps = 1
        this.sfx('stomp')
      } else {
        this.hurt(e.x + e.w / 2)
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive || e.dead > 0)
  }

  private killEnemy(e: Enemy): void {
    if (!e.alive) return
    e.alive = false
    e.dead = e.kind === 'bug' ? 0.5 : 0.01
    const color = e.kind === 'bug' ? '#5fae3a' : e.kind === 'fly' ? '#8d6ad8' : '#e8f0ff'
    for (let i = 0; i < 10; i++) this.spark(e.x + e.w / 2, e.y + e.h / 2, color)
    const key = e.kind === 'ghost' ? 'claudeadv.msg.dispelled' : 'claudeadv.msg.fixed'
    this.float(e.x + e.w / 2, e.y - 6, this.host.t(key), '#9cf5b4')
  }

  private updateShots(dt: number): void {
    for (const s of this.shots) {
      s.life -= dt
      s.x += s.vx * dt
      const c = this.tileAt(Math.floor(s.x / TILE), Math.floor(s.y / TILE))
      if (this.isSolid(c)) {
        s.life = 0
        this.puff(s.x, s.y)
        if (c === '?' || c === '!') this.hitBlock(Math.floor(s.x / TILE), Math.floor(s.y / TILE))
        continue
      }
      const box = { x: s.x - 8, y: s.y - 7, w: 16, h: 14 }
      for (const e of this.enemies) {
        if (!e.alive || !overlap(box, e)) continue
        s.life = 0
        if (e.kind === 'saw') this.puff(s.x, s.y)
        else {
          this.killEnemy(e)
          this.sfx('stomp')
        }
        break
      }
      const b = this.boss
      if (s.life > 0 && b && this.bossActive() && overlap(box, b)) {
        s.life = 0
        this.damageBoss(1)
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0)

    const p = this.player
    for (const s of this.bossShots) {
      s.life -= dt
      if (s.kind === 'wave') {
        s.x += s.vx * dt
        if (
          this.isSolid(
            this.tileAt(
              Math.floor((s.x + 10 + Math.sign(s.vx) * 10) / TILE),
              Math.floor((s.y + 10) / TILE)
            )
          )
        )
          s.life = 0
      } else {
        s.vy += GRAV * 0.6 * dt
        s.x += s.vx * dt
        s.y += s.vy * dt
        if (this.isSolid(this.tileAt(Math.floor(s.x / TILE), Math.floor(s.y / TILE)))) {
          s.life = 0
          this.puff(s.x, s.y)
        }
      }
      const box =
        s.kind === 'wave'
          ? { x: s.x, y: s.y + 4, w: 20, h: 16 }
          : { x: s.x - 10, y: s.y - 7, w: 20, h: 14 }
      if (s.life > 0 && overlap(p, box)) {
        this.hurt(s.x)
        if (s.kind === 'brick') s.life = 0
      }
    }
    this.bossShots = this.bossShots.filter((s) => s.life > 0)
  }

  private updatePickups(dt: number): void {
    const p = this.player
    const pick = { x: p.x - 4, y: p.y - 4, w: p.w + 8, h: p.h + 8 }
    for (const c of this.coins) {
      if (c.taken) continue
      if (c.falling) {
        c.vy = Math.min(600, c.vy + GRAV * 0.5 * dt)
        c.y += c.vy * dt
        if (this.isSolid(this.tileAt(Math.floor(c.x / TILE), Math.floor((c.y + 10) / TILE)))) {
          c.y = Math.floor((c.y + 10) / TILE) * TILE - 12
          c.falling = false
        }
        if (c.y > ROWS * TILE) c.taken = true
      }
      if (overlap(pick, { x: c.x - 9, y: c.y - 10, w: 18, h: 20 })) {
        c.taken = true
        this.tokens++
        this.collected++
        this.sfx('coin')
        for (let i = 0; i < 5; i++) this.spark(c.x, c.y, '#ffd34d')
      }
    }
    for (const it of this.pickups) {
      if (it.taken || !overlap(pick, { x: it.x - 12, y: it.y - 12, w: 24, h: 24 })) continue
      it.taken = true
      if (it.kind === 'heart') {
        if (p.hp < MAX_HP) p.hp++
        else {
          this.tokens += 3
          this.collected += 3
        }
        this.sfx('power')
        this.float(it.x, it.y - 16, p.hp < MAX_HP ? '+♥' : '+♥ / +3 Token', '#ff8fa3')
      } else {
        this.contextUsed = Math.max(0, this.contextUsed - 0.35)
        this.sfx('power')
        this.float(it.x, it.y - 16, this.host.t('claudeadv.msg.compact'), '#fff3d6')
      }
    }
    for (const ck of this.checks) {
      if (ck.active || !overlap(p, { x: ck.x, y: ck.y - 24, w: TILE, h: TILE + 24 })) continue
      for (const o of this.checks) o.active = false
      ck.active = true
      this.respawn = { x: ck.x + 5, y: ck.y + TILE - p.h, context: this.contextUsed }
      this.sfx('check')
      this.float(ck.x + 16, ck.y - 34, this.host.t('claudeadv.msg.checkpoint'), '#9cf5b4')
    }
    if (this.goal && overlap(p, { x: this.goal.x - 12, y: this.goal.y - 40, w: 56, h: 72 }))
      this.clearLevel()
  }

  private updateParticles(dt: number): void {
    for (const pt of this.particles) {
      pt.life -= dt
      pt.vy += pt.grav * dt
      pt.x += pt.vx * dt
      pt.y += pt.vy * dt
    }
    this.particles = this.particles.filter((pt) => pt.life > 0)
    for (const f of this.floaters) {
      f.life -= dt
      f.y -= 30 * dt
    }
    this.floaters = this.floaters.filter((f) => f.life > 0)
  }

  // ───────────────────────── Boss ─────────────────────────

  private bossActive(): boolean {
    const s = this.boss?.state
    return !!s && s !== 'sleep' && s !== 'dying' && s !== 'gone'
  }

  private updateBoss(dt: number): void {
    const b = this.boss
    const a = this.level.arena
    if (!b || !a) return
    const p = this.player
    b.flash = Math.max(0, b.flash - dt)
    b.invuln = Math.max(0, b.invuln - dt)
    b.squash = Math.max(0, b.squash - dt * 3)
    b.timer -= dt

    if (b.state === 'sleep') {
      if (p.x > a.triggerX * TILE) {
        this.gateClosed = true
        for (let y = 2; y <= 13; y++) this.setTile(a.gateX, y, 'X')
        this.sfx('thud')
        this.shake = 0.6
        b.state = 'intro'
        b.timer = 1.6
        this.audio.playMusic('boss')
        this.showToast(this.host.t('claudeadv.boss.name'))
      }
      return
    }
    if (b.state === 'gone') return
    if (b.state === 'dying') {
      if (Math.random() < dt * 14) {
        this.spark(
          b.x + Math.random() * b.w,
          b.y + Math.random() * b.h,
          Math.random() < 0.5 ? '#ffb347' : '#ffffff'
        )
        this.sfx('stomp')
      }
      if (b.timer <= 0) {
        b.state = 'gone'
        this.sfx('boom')
        this.shake = 1
        for (let i = 0; i < 60; i++)
          this.spark(b.x + b.w / 2, b.y + b.h / 2, i % 2 ? '#ffb347' : '#c9ced8', 380)
        this.goal = { x: Math.round((a.x0 + a.x1) / 2) * TILE, y: 13 * TILE }
        this.audio.playMusic(this.level.theme)
        this.showToast(this.host.t('claudeadv.boss.defeated'))
      }
      return
    }

    const rage = b.hp <= BOSS_HP / 2
    b.facing = p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1

    // Token 雨：战斗中定期从天而降，保证不会弹尽粮绝
    b.rainT -= dt
    if (b.rainT <= 0) {
      b.rainT = 3.5
      const x = (a.x0 + 1 + Math.random() * (a.x1 - a.x0 - 2)) * TILE
      this.coins.push({ x, y: 2.5 * TILE, vy: 0, falling: true, taken: false })
    }

    switch (b.state) {
      case 'intro':
        if (b.timer <= 0) this.bossIdle(rage)
        break
      case 'idle':
        b.vx = 0
        if (b.timer <= 0) {
          const roll = Math.random()
          const bugs = this.enemies.filter((e) => e.alive && e.fromBoss).length
          if (rage && roll < 0.3) {
            b.state = 'throw'
            b.timer = 0.5
          } else if (roll < 0.62) {
            b.state = 'jump'
            b.vy = -760
            b.vx = b.facing * (rage ? 200 : 150)
            b.onGround = false
            b.squash = 0.6
          } else if (roll < 0.82 && bugs < 3) {
            b.state = 'summon'
            b.timer = 0.6
          } else {
            b.state = 'walk'
            b.timer = rage ? 2.2 : 1.8
          }
        }
        break
      case 'walk':
        b.vx = b.facing * (rage ? 150 : 100)
        if (b.timer <= 0) this.bossIdle(rage)
        break
      case 'summon':
        b.vx = 0
        if (b.timer <= 0) {
          for (const side of [-1, 1]) {
            const e: Enemy = {
              kind: 'bug',
              x: b.x + b.w / 2 + side * 30 - 13,
              y: b.y + 10,
              w: 26,
              h: 20,
              vx: 0,
              vy: -420,
              facing: side,
              alive: true,
              dead: 0,
              bx: 0,
              by: 0,
              ax: 0,
              ay: 0,
              period: 1,
              phase: 0,
              t: 0,
              shy: false,
              onGround: false,
              fromBoss: true
            }
            this.enemies.push(e)
          }
          this.sfx('pad')
          this.bossIdle(rage)
        }
        break
      case 'throw':
        b.vx = 0
        if (b.timer <= 0) {
          const dx = p.x + p.w / 2 - (b.x + b.w / 2)
          for (let i = 0; i < 3; i++) {
            this.bossShots.push({
              kind: 'brick',
              x: b.x + b.w / 2,
              y: b.y + 10,
              vx: dx * (0.75 + i * 0.25) * 0.9,
              vy: -620 - i * 60,
              life: 3
            })
          }
          this.sfx('shoot')
          this.bossIdle(rage)
        }
        break
    }

    b.vy = Math.min(MAX_FALL, b.vy + GRAV * dt)
    const wasGround = b.onGround
    if (this.moveX(b, b.vx * dt)) b.facing *= -1
    b.x = clamp(b.x, (a.x0 + 0.2) * TILE, (a.x1 + 1) * TILE - b.w)
    this.moveY(b, b.vy * dt, false)
    if (b.onGround && !wasGround && b.state === 'jump') {
      b.squash = 1
      this.shake = 0.5
      this.sfx('thud')
      const gy = b.y + b.h - 20
      this.bossShots.push({
        kind: 'wave',
        x: b.x - 20,
        y: gy,
        vx: -(rage ? 340 : 280),
        vy: 0,
        life: 4
      })
      this.bossShots.push({
        kind: 'wave',
        x: b.x + b.w,
        y: gy,
        vx: rage ? 340 : 280,
        vy: 0,
        life: 4
      })
      this.dust(b.x + b.w / 2, b.y + b.h, 14)
      this.bossIdle(rage)
    }

    // 与玩家碰撞：踩头 = 2 伤害
    if (this.mode === 'play' && overlap(p, b)) {
      if (p.vy > 0 && p.y + p.h - p.vy * dt <= b.y + 18) {
        p.vy = -700
        p.airJumps = 1
        p.canCut = false
        if (b.invuln <= 0) {
          this.damageBoss(2)
          b.invuln = 0.6
        }
      } else this.hurt(b.x + b.w / 2)
    }
  }

  private bossIdle(rage: boolean): void {
    const b = this.boss
    if (!b) return
    b.state = 'idle'
    b.timer = rage ? 0.55 : 1.0
  }

  private damageBoss(n: number): void {
    const b = this.boss
    if (!b) return
    b.hp = Math.max(0, b.hp - n)
    b.flash = 0.12
    this.sfx('bossHit')
    for (let i = 0; i < 6; i++) this.spark(b.x + b.w / 2, b.y + 30, '#c9ced8')
    if (b.hp <= 0) {
      b.state = 'dying'
      b.timer = 1.8
      b.vx = 0
      for (const e of this.enemies) if (e.fromBoss) this.killEnemy(e)
      this.bossShots = []
    }
  }

  // ───────────────────────── 受伤 / 死亡 / 通关 ─────────────────────────

  private hurt(fromX: number): void {
    const p = this.player
    if (p.invuln > 0 || this.mode !== 'play') return
    if (this.cheat) {
      // 无敌：照常击退，但不扣血
      p.invuln = 0.6
      p.vy = -380
      p.vx = (p.x + p.w / 2 < fromX ? -1 : 1) * 260
      return
    }
    p.hp--
    if (p.hp <= 0) {
      this.die('hp')
      return
    }
    p.invuln = 1.4
    p.vy = -380
    p.vx = (p.x + p.w / 2 < fromX ? -1 : 1) * 260
    this.shake = 0.35
    this.sfx('hurt')
  }

  private die(cause: string): void {
    if (this.mode !== 'play') return
    const p = this.player
    this.deathCause = cause
    p.vy = -560
    p.vx = 0
    p.hp = 0
    this.shake = 0.5
    this.audio.stopMusic()
    this.sfx('die')
    this.setMode('dying')
  }

  private updateDying(dt: number): void {
    const p = this.player
    p.vy = Math.min(MAX_FALL, p.vy + GRAV * 0.8 * dt)
    p.y += p.vy * dt
    p.spin += dt * 8
    this.updateParticles(dt)
    if (this.modeT > 1.6) {
      this.deaths++
      const fresh = this.newPlayer(this.respawn.x, this.respawn.y)
      fresh.invuln = 1.5
      this.player = fresh
      this.contextUsed = Math.min(this.respawn.context, 0.7)
      this.tokens = Math.max(this.tokens, 3)
      this.shots = []
      this.bossShots = []
      // Boss 战中阵亡：Boss 回满、闸门打开、重新等待触发
      const b = this.boss
      if (b && b.state !== 'gone' && this.level.arena) {
        b.hp = BOSS_HP
        b.state = 'sleep'
        b.x = b.homeX
        b.y = b.homeY
        b.vx = 0
        b.vy = 0
        this.enemies = this.enemies.filter((e) => !e.fromBoss)
        if (this.gateClosed) {
          for (let y = 2; y <= 13; y++) this.setTile(this.level.arena.gateX, y, '.')
          this.gateClosed = false
        }
      }
      this.cam.x = clamp(fresh.x - VIEW_W / 3, 0, this.levelW() - VIEW_W)
      this.setMode('play')
    }
  }

  private clearLevel(): void {
    if (this.mode !== 'play') return
    this.goal = null
    this.audio.stopMusic()
    this.sfx('clear')
    for (let i = 0; i < 40; i++) this.confetti(this.player.x, this.player.y)
    const result: RunResult = {
      level: this.level.index,
      time: Math.round(this.elapsed * 10) / 10,
      tokens: this.collected,
      deaths: this.deaths
    }
    const prev = this.stats?.levels[String(this.level.index)] ?? null
    const newBest = !this.cheat && (!prev?.bestTime || result.time < prev.bestTime)
    this.clearInfo = {
      time: result.time,
      tokens: result.tokens,
      deaths: result.deaths,
      best: prev,
      newBest
    }
    this.setMode('clear')
    if (this.cheat) return
    void this.host.record(result).then((s) => {
      if (s) this.stats = s
    })
  }

  private afterClear(): void {
    if (this.level.index >= LEVELS.length) {
      this.setMode('ending')
      this.cam = { x: 0, y: 0 }
      return
    }
    this.startLevel(this.level.index + 1)
  }

  // ───────────────────────── 特效 ─────────────────────────

  private spark(x: number, y: number, color: string, speed = 180): void {
    const a = Math.random() * Math.PI * 2
    const v = speed * (0.4 + Math.random() * 0.6)
    this.particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 60,
      life: 0.6,
      max: 0.6,
      color,
      size: 3,
      grav: 600
    })
  }

  private dust(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++)
      this.particles.push({
        x: x + (Math.random() - 0.5) * 16,
        y,
        vx: (Math.random() - 0.5) * 120,
        vy: -Math.random() * 60,
        life: 0.4,
        max: 0.4,
        color: 'rgba(255,255,255,0.7)',
        size: 3,
        grav: 0
      })
  }

  private puff(x: number, y: number): void {
    for (let i = 0; i < 5; i++) this.spark(x, y, '#fff1e0', 100)
  }

  /** 彩纸；`fall` = 从屏幕顶部往下飘（结局画面），否则从原地炸开 */
  private confetti(x: number, y: number, fall = false): void {
    const colors = ['#d97757', '#ffd34d', '#4fd17a', '#6b77e0', '#ff5c7a']
    this.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 300,
      vy: fall ? 60 + Math.random() * 90 : -Math.random() * 300 - 100,
      life: fall ? 5 : 2.5,
      max: 2.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 4,
      grav: 300
    })
  }

  private float(x: number, y: number, text: string, color: string): void {
    this.floaters.push({ x, y, text, life: 1, color })
  }

  private showToast(text: string): void {
    this.toast = { text, life: 2.4 }
  }

  // ───────────────────────── 渲染 ─────────────────────────

  private render(): void {
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, VIEW_W, VIEW_H)
    this.buttons = []
    switch (this.mode) {
      case 'title':
        this.renderTitle()
        break
      case 'select':
        this.renderSelect()
        break
      case 'help':
        this.renderHelp()
        break
      case 'ending':
        this.renderEnding()
        break
      default:
        this.renderWorld()
        this.renderHud()
        if (this.mode === 'intro') this.renderIntro()
        if (this.mode === 'pause') this.renderPause()
        if (this.mode === 'dying') this.renderDying()
        if (this.mode === 'clear') this.renderClear()
    }
    if (this.toast) {
      const a = Math.min(1, this.toast.life * 2)
      ctx.globalAlpha = a
      this.panel(VIEW_W / 2 - 200, 72, 400, 48, 'rgba(10, 10, 20, 0.75)')
      this.text(this.toast.text, VIEW_W / 2, 96, 20, '#fff', 'center', true)
      ctx.globalAlpha = 1
    }
  }

  private drawBg(name: string, parallax: number, offsetX: number): void {
    const ctx = this.ctx
    const img = this.assets.backgrounds[name]
    if (!img) {
      ctx.fillStyle = '#223'
      ctx.fillRect(0, 0, VIEW_W, VIEW_H)
      return
    }
    const scale = VIEW_H / img.height
    const iw = img.width * scale
    const off = -((offsetX * parallax) % (iw * 2))
    // 正 / 镜像交替平铺：拼缝处左右对称，不会出现硬切边
    for (let i = 0, x = off; x < VIEW_W; i++, x += iw) {
      if (i % 2 === 0) ctx.drawImage(img, x, 0, iw, VIEW_H)
      else {
        ctx.save()
        ctx.translate(x + iw, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(img, 0, 0, iw, VIEW_H)
        ctx.restore()
      }
    }
  }

  private renderWorld(): void {
    const ctx = this.ctx
    this.drawBg(this.level.bg, 0.25, this.cam.x)
    ctx.fillStyle = this.theme.tint
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)

    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 16 : 0
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 16 : 0
    const cx = Math.round(this.cam.x + sx)
    const cy = Math.round(this.cam.y + sy)
    ctx.save()
    ctx.translate(-cx, -cy)
    const t = this.time

    // 路牌（在瓦片后面）
    for (const s of this.signs) {
      if (s.x < cx - 400 || s.x > cx + VIEW_W + 100) continue
      this.drawSign(s.x, s.y, this.host.t(`claudeadv.sign.${s.text}`))
    }

    if (this.staticLayer) {
      const w = Math.min(VIEW_W + 2, this.staticLayer.width - Math.max(0, cx))
      if (w > 0)
        ctx.drawImage(
          this.staticLayer,
          Math.max(0, cx),
          0,
          w,
          this.staticLayer.height,
          Math.max(0, cx),
          0,
          w,
          this.staticLayer.height
        )
    }

    // 动态瓦片：岩浆 / 道具块
    const tx0 = Math.max(0, Math.floor(cx / TILE))
    const tx1 = Math.min(this.level.width - 1, Math.floor((cx + VIEW_W) / TILE))
    for (let ty = 0; ty < ROWS; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const c = this.tiles[ty][tx]
        if (c === '~') drawLava(ctx, tx * TILE, ty * TILE, t, this.tileAt(tx, ty - 1) !== '~')
        else if (c === '?' || c === '!' || c === 'u')
          drawItemBlock(
            ctx,
            tx * TILE,
            ty * TILE,
            c === 'u',
            t,
            Math.max(0, this.bumps.get(`${tx},${ty}`) ?? 0)
          )
      }

    for (const pl of this.plats) this.drawPlat(pl)
    for (const pad of this.pads) drawPad(ctx, pad.x, pad.y, pad.squash)
    for (const ck of this.checks) drawCheckpoint(ctx, ck.x, ck.y, ck.active, t)
    if (this.goal) drawGoal(ctx, this.goal.x, this.goal.y, t)
    for (const c of this.coins) if (!c.taken) drawCoin(ctx, c.x, c.y, t + c.x * 0.01)
    for (const it of this.pickups) {
      if (it.taken) continue
      if (it.kind === 'heart') drawHeart(ctx, it.x, it.y + Math.sin(t * 3) * 2, 20)
      else drawScroll(ctx, it.x, it.y, t)
    }

    for (const e of this.enemies) {
      if (e.x < cx - 64 || e.x > cx + VIEW_W + 64) continue
      if (!e.alive && e.kind !== 'bug') continue
      switch (e.kind) {
        case 'bug':
          ctx.globalAlpha = e.alive ? 1 : Math.max(0, e.dead * 2)
          drawBug(ctx, e.x, e.y, e.facing, e.t, e.alive ? 0 : 1)
          ctx.globalAlpha = 1
          break
        case 'fly':
          drawFly(ctx, e.x, e.y, e.facing, e.t)
          break
        case 'ghost':
          drawGhost(ctx, e.x, e.y, e.facing, e.t, e.shy)
          break
        case 'saw':
          drawSaw(ctx, e.x + e.w / 2, e.y + e.h / 2, e.t)
          break
      }
    }

    const b = this.boss
    if (b && b.state !== 'gone') {
      const shakeX = b.state === 'dying' ? (Math.random() - 0.5) * 6 : 0
      drawBoss(
        ctx,
        b.x + shakeX,
        b.y,
        b.facing,
        t,
        b.flash > 0 || (b.state === 'dying' && Math.floor(t * 20) % 2 === 0),
        b.hp <= BOSS_HP / 2,
        b.squash
      )
      if (b.state === 'sleep')
        this.text(
          'z z z',
          b.x + b.w - 8,
          b.y - 6 + Math.sin(t * 2) * 4,
          16,
          this.theme.ink,
          'left',
          true
        )
    }
    for (const s of this.bossShots) {
      if (s.kind === 'wave') drawShockwave(ctx, s.x, s.y, t)
      else drawTodoBrick(ctx, s.x, s.y, t)
    }

    // 玩家
    const p = this.player
    const flicker = p.invuln > 0 && this.mode === 'play' && Math.floor(t * 20) % 2 === 0
    if (!flicker) {
      const moving = Math.abs(p.vx) / RUN
      const bob = p.onGround ? Math.abs(Math.sin(p.anim * 14)) * moving * -2 : 0
      drawClaude(ctx, p.x + p.w / 2, p.y + p.h / 2 + bob, {
        facing: p.facing,
        t: p.anim,
        run: p.onGround ? moving : 0.5,
        stretch: p.stretch,
        blink: p.blinkT < 0,
        hurt: this.mode === 'dying' || p.invuln > 1.1,
        spin: p.spin,
        golden: this.cheat
      })
    }

    for (const s of this.shots) drawShot(ctx, s.x, s.y, t)

    for (const pt of this.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max)
      ctx.fillStyle = pt.color
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size)
    }
    ctx.globalAlpha = 1
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 2)
      this.text(f.text, f.x, f.y, 14, f.color, 'center', true)
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }

  private drawPlat(pl: Plat): void {
    const ctx = this.ctx
    const cloud = this.level.theme === 'cloud'
    ctx.fillStyle = cloud ? '#ffffff' : this.theme.plank
    ctx.strokeStyle = this.theme.brickLine
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(pl.x, pl.y, pl.w, 14, 5)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = this.theme.brickLine
    for (let i = 1; i < pl.w / TILE; i++) ctx.fillRect(pl.x + i * TILE - 1, pl.y + 3, 2, 8)
    // 推进器小火苗
    ctx.fillStyle = '#ffb347'
    const f = 3 + Math.sin(this.time * 30) * 2
    ctx.fillRect(pl.x + 8, pl.y + 14, 4, f)
    ctx.fillRect(pl.x + pl.w - 12, pl.y + 14, 4, f)
  }

  private drawSign(x: number, y: number, text: string): void {
    const ctx = this.ctx
    ctx.font = `15px ${FONT}`
    const lines = text.split('\n')
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 28
    const h = lines.length * 20 + 18
    const bx = x
    const by = y - h + TILE
    ctx.fillStyle = '#6b4a2e'
    ctx.fillRect(bx + 14, by + h, 5, ROWS * TILE)
    this.panel(bx, by, w, h, 'rgba(20, 16, 12, 0.72)')
    ctx.strokeStyle = 'rgba(255, 220, 180, 0.5)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(bx, by, w, h, 8)
    ctx.stroke()
    lines.forEach((l, i) => this.text(l, bx + 14, by + 22 + i * 20, 15, '#fff6ea', 'left'))
  }

  // ── HUD ──

  private renderHud(): void {
    const ctx = this.ctx
    const p = this.player
    this.panel(14, 12, 270, 44, 'rgba(10, 10, 20, 0.55)')
    if (this.cheat) {
      drawHeart(ctx, 38, 34, 22, true)
      this.text('∞', 58, 42, 22, '#ffd94a', 'left', true)
    } else for (let i = 0; i < MAX_HP; i++) drawHeart(ctx, 38 + i * 30, 34, 22, i < p.hp)
    drawCoin(ctx, 148, 34, 0)
    this.text(`× ${this.tokens}`, 164, 40, 18, '#fff', 'left', true)

    // 上下文窗口
    const bw = 260
    const bx = VIEW_W / 2 - bw / 2
    this.panel(bx - 12, 12, bw + 24, 44, 'rgba(10, 10, 20, 0.55)')
    const c = this.contextUsed
    const col = c < 0.6 ? '#4fd17a' : c < 0.85 ? '#ffc94d' : '#ff5c5c'
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.beginPath()
    ctx.roundRect(bx, 38, bw, 10, 5)
    ctx.fill()
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.roundRect(bx, 38, Math.max(10, bw * c), 10, 5)
    ctx.fill()
    const warn = c > 0.85 && Math.floor(this.time * 4) % 2 === 0
    this.text(
      `${this.host.t('claudeadv.hud.context')} ${Math.floor(c * 100)}%`,
      VIEW_W / 2,
      31,
      13,
      warn ? '#ff8a8a' : '#e8e8f0',
      'center'
    )

    // 关卡 / 计时
    this.panel(VIEW_W - 254, 12, 240, 44, 'rgba(10, 10, 20, 0.55)')
    this.text(
      this.host.t(`claudeadv.level.${this.level.key}.name`),
      VIEW_W - 240,
      40,
      15,
      '#fff',
      'left',
      true
    )
    this.text(fmtTime(this.elapsed), VIEW_W - 28, 40, 15, '#ffd9c4', 'right')

    // Boss 血条
    const b = this.boss
    if (b && (this.bossActive() || b.state === 'dying')) {
      const w = 420
      const x = VIEW_W / 2 - w / 2
      this.panel(x - 14, VIEW_H - 62, w + 28, 48, 'rgba(10, 10, 20, 0.7)')
      this.text(
        this.host.t('claudeadv.boss.name'),
        VIEW_W / 2,
        VIEW_H - 42,
        14,
        '#ffd9c4',
        'center',
        true
      )
      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      ctx.fillRect(x, VIEW_H - 34, w, 10)
      ctx.fillStyle = b.hp <= BOSS_HP / 2 ? '#ff5370' : '#c9ced8'
      ctx.fillRect(x, VIEW_H - 34, (w * b.hp) / BOSS_HP, 10)
    }
  }

  // ── 覆盖层 ──

  private dim(a = 0.55): void {
    this.ctx.fillStyle = `rgba(8, 8, 16, ${a})`
    this.ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  }

  private renderIntro(): void {
    const a = Math.min(1, this.modeT * 3) * Math.min(1, (2.4 - this.modeT) * 3)
    this.ctx.globalAlpha = Math.max(0, a)
    this.dim(0.6)
    const lv = this.level
    this.text(
      this.host.te('claudeadv.intro.level', { n: lv.index }),
      VIEW_W / 2,
      210,
      22,
      '#ffd9c4',
      'center',
      true
    )
    this.text(
      this.host.t(`claudeadv.level.${lv.key}.name`),
      VIEW_W / 2,
      262,
      46,
      '#fff',
      'center',
      true
    )
    this.text(
      this.host.t(`claudeadv.level.${lv.key}.sub`),
      VIEW_W / 2,
      310,
      18,
      '#d8d8e8',
      'center'
    )
    this.text(
      this.host.t('claudeadv.intro.skip'),
      VIEW_W / 2,
      380,
      14,
      'rgba(255,255,255,0.55)',
      'center'
    )
    this.ctx.globalAlpha = 1
  }

  private renderPause(): void {
    this.dim(0.6)
    this.text(this.host.t('claudeadv.pause.title'), VIEW_W / 2, 170, 38, '#fff', 'center', true)
    const items: [string, () => void][] = [
      ['claudeadv.pause.resume', () => this.setMode('play')],
      ['claudeadv.pause.restart', () => this.startLevel(this.level.index)],
      ['claudeadv.pause.quit', () => this.setMode('title')]
    ]
    items.forEach(([k, fn], i) =>
      this.button(`p${i}`, this.host.t(k), VIEW_W / 2 - 130, 220 + i * 66, 260, 50, fn)
    )
    this.drawButtons()
  }

  private renderDying(): void {
    const a = clamp((this.modeT - 0.3) * 2, 0, 0.5)
    this.dim(a)
    if (this.modeT > 0.4) {
      this.text(
        this.host.t(`claudeadv.death.${this.deathCause}`),
        VIEW_W / 2,
        250,
        30,
        '#ffb4a8',
        'center',
        true
      )
      this.text(this.host.t('claudeadv.death.retry'), VIEW_W / 2, 292, 16, '#e8e8f0', 'center')
    }
  }

  private renderClear(): void {
    this.dim(Math.min(0.6, this.modeT))
    const info = this.clearInfo
    if (!info) return
    const w = 460
    const x = VIEW_W / 2 - w / 2
    this.panel(x, 110, w, 320, 'rgba(18, 18, 30, 0.88)')
    this.text(this.host.t('claudeadv.clear.title'), VIEW_W / 2, 170, 34, '#4fd17a', 'center', true)
    this.text(
      this.host.t(`claudeadv.level.${this.level.key}.name`),
      VIEW_W / 2,
      206,
      16,
      '#d8d8e8',
      'center'
    )
    const rows: [string, string][] = [
      [this.host.t('claudeadv.clear.time'), fmtTime(info.time) + (info.newBest ? '  ★ NEW' : '')],
      [this.host.t('claudeadv.clear.tokens'), String(info.tokens)],
      [this.host.t('claudeadv.clear.deaths'), String(info.deaths)]
    ]
    if (info.best?.bestTime && !info.newBest)
      rows.push([this.host.t('claudeadv.clear.best'), fmtTime(info.best.bestTime)])
    rows.forEach(([k, v], i) => {
      this.text(k, x + 60, 262 + i * 34, 18, '#c8c8d8', 'left')
      this.text(v, x + w - 60, 262 + i * 34, 18, '#fff', 'right', true)
    })
    const last = this.level.index >= LEVELS.length
    this.button(
      'next',
      this.host.t(last ? 'claudeadv.clear.finale' : 'claudeadv.clear.next'),
      VIEW_W / 2 - 120,
      440,
      240,
      50,
      () => this.afterClear()
    )
    this.drawButtons()
  }

  // ── 标题 / 选关 / 帮助 / 结局 ──

  private renderTitle(): void {
    const ctx = this.ctx
    this.drawBg('title', 1, 0)
    const g = ctx.createLinearGradient(0, 0, VIEW_W, 0)
    g.addColorStop(0, 'rgba(10, 8, 20, 0.72)')
    g.addColorStop(0.55, 'rgba(10, 8, 20, 0.15)')
    g.addColorStop(1, 'rgba(10, 8, 20, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)

    // 主角站在悬崖上（标题图右侧的空崖）
    const bob = Math.sin(this.time * 2.4) * 4
    drawClaude(
      ctx,
      752,
      292 + bob,
      {
        facing: -1,
        t: this.time,
        run: 0.15,
        stretch: 1 + Math.sin(this.time * 2.4) * 0.04,
        blink: this.time % 4 < 0.12,
        hurt: false,
        spin: 0,
        golden: this.cheat
      },
      2.6
    )

    this.text(this.host.t('claudeadv.title'), 64, 140, 58, '#fff', 'left', true)
    this.text("Claude's Adventure", 68, 180, 20, CLAUDE_ORANGE, 'left', true)
    if (this.cheat)
      this.text(this.host.t('claudeadv.cheat.badge'), 68, 210, 15, '#ffd94a', 'left', true)
    const cont = this.unlocked()
    const startLabel =
      cont > 1
        ? this.host.te('claudeadv.menu.continue', { n: cont })
        : this.host.t('claudeadv.menu.start')
    this.button('start', startLabel, 64, 236, 280, 52, () => this.startLevel(cont))
    this.button('select', this.host.t('claudeadv.menu.select'), 64, 302, 280, 52, () =>
      this.setMode('select')
    )
    this.button('help', this.host.t('claudeadv.menu.help'), 64, 368, 280, 52, () =>
      this.setMode('help')
    )
    this.drawButtons()
    const done = this.stats?.endings ?? 0
    if (done > 0)
      this.text(this.host.te('claudeadv.menu.endings', { n: done }), 64, 462, 14, '#ffd9c4', 'left')
    this.text(
      this.host.t('claudeadv.menu.keys'),
      64,
      VIEW_H - 30,
      13,
      'rgba(255,255,255,0.6)',
      'left'
    )
  }

  private renderSelect(): void {
    const ctx = this.ctx
    this.drawBg('title', 1, 0)
    this.dim(0.62)
    this.text(this.host.t('claudeadv.menu.select'), VIEW_W / 2, 84, 32, '#fff', 'center', true)
    const unlocked = this.unlocked()
    const cw = 164
    const gap = 16
    const total = LEVELS.length * cw + (LEVELS.length - 1) * gap
    LEVELS.forEach((lv, i) => {
      const x = VIEW_W / 2 - total / 2 + i * (cw + gap)
      const y = 136
      const h = 260
      const open = lv.index <= unlocked
      const hover = this.menuIndex === i
      const btn: Button = {
        id: `lv${i}`,
        label: '',
        x,
        y,
        w: cw,
        h,
        enabled: open,
        onClick: () => this.startLevel(lv.index)
      }
      this.buttons.push(btn)
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(x, y - (hover && open ? 6 : 0), cw, h, 12)
      ctx.clip()
      const img = this.assets.backgrounds[lv.bg]
      const top = y - (hover && open ? 6 : 0)
      if (img) {
        const s = 140 / img.height
        ctx.drawImage(img, x + cw / 2 - (img.width * s) / 2 + 120, top, img.width * s, 140)
      }
      ctx.fillStyle = 'rgba(16, 16, 28, 0.92)'
      ctx.fillRect(x, top + 140, cw, h - 140)
      if (!open) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(x, top, cw, h)
      }
      ctx.restore()
      ctx.strokeStyle = hover && open ? CLAUDE_ORANGE : 'rgba(255,255,255,0.25)'
      ctx.lineWidth = hover && open ? 3 : 1.5
      ctx.beginPath()
      ctx.roundRect(x, top, cw, h, 12)
      ctx.stroke()
      this.text(`${lv.index}`, x + 16, top + 34, 26, '#fff', 'left', true)
      this.text(
        open ? this.host.t(`claudeadv.level.${lv.key}.name`) : '🔒',
        x + cw / 2,
        top + 176,
        18,
        '#fff',
        'center',
        true
      )
      const rec = this.stats?.levels[String(lv.index)]
      if (open && rec?.bestTime) {
        this.text(`⏱ ${fmtTime(rec.bestTime)}`, x + cw / 2, top + 210, 14, '#ffd9c4', 'center')
        this.text(`T ${rec.bestTokens}`, x + cw / 2, top + 234, 13, '#ffd34d', 'center')
      } else if (open)
        this.text(
          this.host.t('claudeadv.select.new'),
          x + cw / 2,
          top + 214,
          14,
          '#9cf5b4',
          'center'
        )
    })
    this.button('back', this.host.t('claudeadv.menu.back'), VIEW_W / 2 - 110, 430, 220, 50, () =>
      this.setMode('title')
    )
    this.drawButtons()
  }

  private renderHelp(): void {
    this.drawBg('title', 1, 0)
    this.dim(0.72)
    this.text(this.host.t('claudeadv.menu.help'), VIEW_W / 2, 74, 30, '#fff', 'center', true)
    const lines = this.host.t('claudeadv.help.body').split('\n')
    lines.forEach((l, i) => this.text(l, 120, 124 + i * 30, 17, '#ececf4', 'left'))
    this.button(
      'back',
      this.host.t('claudeadv.menu.back'),
      VIEW_W / 2 - 110,
      VIEW_H - 76,
      220,
      50,
      () => this.setMode('title')
    )
    this.drawButtons()
  }

  private renderEnding(): void {
    this.drawBg('bg5', 1, 0)
    this.dim(0.55)
    const ctx = this.ctx
    for (const pt of this.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max)
      ctx.fillStyle = pt.color
      ctx.fillRect(pt.x - this.cam.x, pt.y - this.cam.y, pt.size, pt.size)
    }
    ctx.globalAlpha = 1
    drawClaude(
      ctx,
      VIEW_W / 2,
      150 + Math.sin(this.time * 3) * 6,
      {
        facing: 1,
        t: this.time,
        run: 0.6,
        stretch: 1,
        blink: false,
        hurt: false,
        spin: Math.sin(this.time * 1.5) * 0.2,
        golden: this.cheat
      },
      3
    )
    this.text(this.host.t('claudeadv.ending.title'), VIEW_W / 2, 270, 40, '#fff', 'center', true)
    const lines = this.host.t('claudeadv.ending.body').split('\n')
    lines.forEach((l, i) => this.text(l, VIEW_W / 2, 318 + i * 28, 17, '#e4e4f0', 'center'))
    this.button('end', this.host.t('claudeadv.ending.back'), VIEW_W / 2 - 120, 450, 240, 50, () =>
      this.setMode('title')
    )
    this.drawButtons()
  }

  // ── UI 原语 ──

  private button(
    id: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
    onClick: () => void
  ): void {
    this.buttons.push({ id, label, x, y, w, h, enabled: true, onClick })
  }

  private drawButtons(): void {
    const ctx = this.ctx
    this.buttons.forEach((b, i) => {
      if (!b.label) return
      const hover = i === this.menuIndex
      ctx.fillStyle = hover ? CLAUDE_ORANGE : 'rgba(20, 18, 30, 0.72)'
      ctx.beginPath()
      ctx.roundRect(b.x, b.y, b.w, b.h, 12)
      ctx.fill()
      ctx.strokeStyle = hover ? '#ffd9c4' : 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 2
      ctx.stroke()
      this.text(b.label, b.x + b.w / 2, b.y + b.h / 2 + 7, 19, '#fff', 'center', hover)
    })
  }

  private panel(x: number, y: number, w: number, h: number, fill: string): void {
    const ctx = this.ctx
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 10)
    ctx.fill()
  }

  private text(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: CanvasTextAlign = 'left',
    bold = false
  ): void {
    const ctx = this.ctx
    ctx.font = `${bold ? '700 ' : ''}${size}px ${/^[\x20-\x7e]+$/.test(s) && size < 16 ? MONO : FONT}`
    ctx.textAlign = align
    ctx.textBaseline = 'alphabetic'
    if (size >= 18) {
      ctx.lineWidth = Math.max(3, size / 7)
      ctx.strokeStyle = 'rgba(10, 8, 16, 0.65)'
      ctx.lineJoin = 'round'
      ctx.strokeText(s, x, y)
    }
    ctx.fillStyle = color
    ctx.fillText(s, x, y)
  }
}
