/**
 * 程序化精灵 —— 角色 / 敌人 / 道具 / 瓦片全部用 canvas 路径现画，
 * 不依赖图片资源（AI 生图画不准主角，也画不出干净的透明小图标）。
 * 只有大幅风景背景来自 ComfyUI（assets/*.jpg）。
 */

import { TILE, type ThemeId } from './levels'

export const CLAUDE_ORANGE = '#d97757'
export const CLAUDE_ORANGE_LIGHT = '#f0a07f'
export const CLAUDE_ORANGE_DARK = '#a8522f'

export interface Theme {
  body: string
  top: string
  dark: string
  speck: string
  brick: string
  brickLine: string
  plank: string
  /** 背景之上的整体压暗，提升前景对比度 */
  tint: string
  /** 关卡内文字 / 路牌主色 */
  ink: string
}

export const THEMES: Record<ThemeId, Theme> = {
  meadow: {
    body: '#8a6240',
    top: '#7cc36a',
    dark: '#5d4029',
    speck: '#a57a52',
    brick: '#c98b5a',
    brickLine: '#8d5a33',
    plank: '#e9d3a6',
    tint: 'rgba(30, 20, 10, 0.08)',
    ink: '#3a2a1a'
  },
  jungle: {
    body: '#4e3b28',
    top: '#3aa35f',
    dark: '#2f2418',
    speck: '#6a5136',
    brick: '#6f8f3c',
    brickLine: '#465e22',
    plank: '#b9d77e',
    tint: 'rgba(0, 20, 10, 0.18)',
    ink: '#eaffdf'
  },
  hell: {
    body: '#3b2424',
    top: '#9a3f2a',
    dark: '#221313',
    speck: '#55302c',
    brick: '#6a3b36',
    brickLine: '#3f201d',
    plank: '#c97a4a',
    tint: 'rgba(20, 0, 0, 0.25)',
    ink: '#ffe0c8'
  },
  cloud: {
    body: '#e9eef8',
    top: '#ffffff',
    dark: '#b8c4dc',
    speck: '#d6deef',
    brick: '#b7c6e8',
    brickLine: '#8797c0',
    plank: '#ffffff',
    tint: 'rgba(255, 255, 255, 0)',
    ink: '#2b3a5a'
  },
  prod: {
    body: '#2a2d48',
    top: '#6b77e0',
    dark: '#181a2e',
    speck: '#3a3e64',
    brick: '#3d4375',
    brickLine: '#262a4d',
    plank: '#8f98ff',
    tint: 'rgba(10, 0, 30, 0.25)',
    ink: '#e4e6ff'
  }
}

/** 确定性哈希（瓦片噪点用，保证每帧一致） */
export function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

// ───────────────────────── 瓦片 ─────────────────────────

/**
 * 画一个静态瓦片。`solidAt(dx, dy)` 查询邻格是否为同类实心（决定草皮 / 边缘）。
 */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  c: string,
  tx: number,
  ty: number,
  theme: Theme,
  themeId: ThemeId,
  solidAt: (dx: number, dy: number) => boolean
): void {
  const x = tx * TILE
  const y = ty * TILE
  switch (c) {
    case '#': {
      ctx.fillStyle = theme.body
      ctx.fillRect(x, y, TILE, TILE)
      // 噪点
      for (let i = 0; i < 4; i++) {
        const r = hash2(tx * 7 + i, ty * 13 + i)
        const r2 = hash2(tx * 3 + i * 5, ty * 11 - i)
        ctx.fillStyle = r > 0.5 ? theme.speck : theme.dark
        ctx.fillRect(x + Math.floor(r * 26) + 2, y + Math.floor(r2 * 26) + 2, 4, 4)
      }
      if (!solidAt(0, -1)) {
        ctx.fillStyle = theme.top
        if (themeId === 'cloud') {
          ctx.beginPath()
          for (let i = 0; i < 3; i++) ctx.arc(x + 6 + i * 10, y + 6, 8, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillRect(x, y + 4, TILE, 6)
        } else {
          ctx.fillRect(x, y, TILE, 9)
          ctx.fillStyle = theme.dark
          ctx.globalAlpha = 0.35
          ctx.fillRect(x, y + 9, TILE, 3)
          ctx.globalAlpha = 1
          // 草尖
          ctx.fillStyle = theme.top
          for (let i = 0; i < 4; i++) {
            const hx = x + 3 + i * 8 + Math.floor(hash2(tx, i) * 4)
            ctx.fillRect(hx, y + 9, 3, 3 + Math.floor(hash2(i, tx) * 4))
          }
        }
      }
      if (!solidAt(-1, 0)) {
        ctx.fillStyle = theme.dark
        ctx.globalAlpha = 0.4
        ctx.fillRect(x, y, 3, TILE)
        ctx.globalAlpha = 1
      }
      if (!solidAt(1, 0)) {
        ctx.fillStyle = theme.dark
        ctx.globalAlpha = 0.4
        ctx.fillRect(x + TILE - 3, y, 3, TILE)
        ctx.globalAlpha = 1
      }
      break
    }
    case '=': {
      ctx.fillStyle = theme.brick
      ctx.fillRect(x, y, TILE, TILE)
      ctx.strokeStyle = theme.brickLine
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, y + 16)
      ctx.lineTo(x + TILE, y + 16)
      ctx.moveTo(x + 16, y)
      ctx.lineTo(x + 16, y + 16)
      ctx.moveTo(x + 8, y + 16)
      ctx.lineTo(x + 8, y + 32)
      ctx.moveTo(x + 24, y + 16)
      ctx.lineTo(x + 24, y + 32)
      ctx.stroke()
      ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2)
      break
    }
    case '-': {
      ctx.fillStyle = theme.plank
      if (themeId === 'cloud') {
        ctx.globalAlpha = 0.95
        ctx.beginPath()
        ctx.arc(x + 8, y + 9, 9, 0, Math.PI * 2)
        ctx.arc(x + 20, y + 7, 10, 0, Math.PI * 2)
        ctx.arc(x + 30, y + 10, 8, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      } else {
        roundRect(ctx, x, y, TILE, 10, 3)
        ctx.fill()
        ctx.fillStyle = theme.brickLine
        ctx.globalAlpha = 0.5
        ctx.fillRect(x, y + 8, TILE, 2)
        ctx.fillRect(x + 14, y + 2, 2, 6)
        ctx.globalAlpha = 1
      }
      break
    }
    case '^': {
      ctx.fillStyle = '#c9ced8'
      ctx.strokeStyle = '#59606e'
      ctx.lineWidth = 2
      for (let i = 0; i < 4; i++) {
        ctx.beginPath()
        ctx.moveTo(x + i * 8, y + TILE)
        ctx.lineTo(x + i * 8 + 4, y + 14)
        ctx.lineTo(x + i * 8 + 8, y + TILE)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
      break
    }
    case 'X': {
      ctx.fillStyle = '#4a1d2a'
      ctx.fillRect(x, y, TILE, TILE)
      ctx.fillStyle = '#ff5370'
      for (let i = 0; i < 2; i++) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(x, y, TILE, TILE)
        ctx.clip()
        ctx.translate(x + i * 16, y)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(8, 0)
        ctx.lineTo(16, TILE)
        ctx.lineTo(8, TILE)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
      break
    }
  }
}

/** 道具块（动态绘制：会被顶、会变灰） */
export function drawItemBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  used: boolean,
  t: number,
  bump: number
): void {
  const by = y - bump * 8
  ctx.fillStyle = used ? '#8b7f73' : '#f2b441'
  roundRect(ctx, x + 1, by + 1, TILE - 2, TILE - 2, 5)
  ctx.fill()
  ctx.strokeStyle = used ? '#5d544b' : '#9a5f12'
  ctx.lineWidth = 2
  ctx.stroke()
  if (!used) {
    const glow = 0.75 + Math.sin(t * 5) * 0.25
    ctx.fillStyle = `rgba(255,255,255,${glow})`
    ctx.font = 'bold 20px ui-monospace, "JetBrains Mono", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('?', x + TILE / 2, by + TILE / 2 + 1)
  } else {
    ctx.fillStyle = '#5d544b'
    for (const [dx, dy] of [
      [6, 6],
      [24, 6],
      [6, 24],
      [24, 24]
    ])
      ctx.fillRect(x + dx, by + dy, 3, 3)
  }
}

export function drawLava(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  top: boolean
): void {
  ctx.fillStyle = '#e2461f'
  ctx.fillRect(x, y, TILE, TILE)
  ctx.fillStyle = '#ff8a2a'
  if (top) {
    ctx.beginPath()
    ctx.moveTo(x, y + 8)
    for (let i = 0; i <= 4; i++) {
      const px = x + i * 8
      ctx.lineTo(px, y + 6 + Math.sin(t * 3 + px * 0.15) * 3)
    }
    ctx.lineTo(x + TILE, y + TILE)
    ctx.lineTo(x, y + TILE)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffd36b'
    ctx.fillRect(x + ((t * 20 + x) % TILE), y + 10, 4, 3)
  } else {
    ctx.globalAlpha = 0.6
    ctx.fillRect(x + 4, y + ((t * 12 + x) % TILE), 6, 4)
    ctx.globalAlpha = 1
  }
}

// ───────────────────────── 主角 ─────────────────────────

export interface PlayerPose {
  facing: 1 | -1
  t: number
  /** 横向奔跑速度比例 0..1 */
  run: number
  /** 挤压拉伸：>1 拉长，<1 压扁 */
  stretch: number
  blink: boolean
  hurt: boolean
  /** 整体旋转（死亡翻滚 / 二段跳翻转） */
  spin: number
}

/**
 * Claude：珊瑚橙色的星芒小家伙。12 根圆头光芒围绕一个圆身体，
 * 跑动时光芒轻微旋转、长短交替；两只眼睛朝面向方向看。
 * (cx, cy) 为身体中心。
 */
export function drawClaude(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  pose: PlayerPose,
  scale = 1
): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(scale / Math.sqrt(pose.stretch), scale * pose.stretch)
  ctx.rotate(pose.spin)

  const rays = 12
  const rot = pose.t * (0.6 + pose.run * 4) * pose.facing
  ctx.lineCap = 'round'
  // 光芒外描边（深色），再画本色，形成描边感
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? CLAUDE_ORANGE_DARK : CLAUDE_ORANGE
    ctx.lineWidth = pass === 0 ? 7 : 4.5
    ctx.beginPath()
    for (let i = 0; i < rays; i++) {
      const a = rot + (i / rays) * Math.PI * 2
      const wobble = Math.sin(pose.t * 9 + i * 1.7) * pose.run * 1.5
      const len = (i % 2 === 0 ? 17 : 14) + wobble
      ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6)
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len)
    }
    ctx.stroke()
  }
  // 身体
  ctx.fillStyle = CLAUDE_ORANGE
  ctx.strokeStyle = CLAUDE_ORANGE_DARK
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, 10.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  // 高光
  ctx.fillStyle = CLAUDE_ORANGE_LIGHT
  ctx.beginPath()
  ctx.arc(-3.5, -4, 3.5, 0, Math.PI * 2)
  ctx.fill()

  // 眼睛（不随旋转——反向抵消 spin 以外的光芒旋转即可，眼睛本身不转）
  const ex = pose.facing * 2.5
  if (pose.hurt) {
    ctx.strokeStyle = '#2a1a12'
    ctx.lineWidth = 1.8
    for (const sx of [-4, 4]) {
      ctx.beginPath()
      ctx.moveTo(ex + sx - 2, -3)
      ctx.lineTo(ex + sx + 2, 1)
      ctx.moveTo(ex + sx + 2, -3)
      ctx.lineTo(ex + sx - 2, 1)
      ctx.stroke()
    }
  } else if (pose.blink) {
    ctx.strokeStyle = '#2a1a12'
    ctx.lineWidth = 1.8
    for (const sx of [-4, 4]) {
      ctx.beginPath()
      ctx.moveTo(ex + sx - 2, -1)
      ctx.lineTo(ex + sx + 2, -1)
      ctx.stroke()
    }
  } else {
    for (const sx of [-4, 4]) {
      ctx.fillStyle = '#fffaf3'
      ctx.beginPath()
      ctx.ellipse(ex + sx, -1, 2.8, 3.6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#2a1a12'
      ctx.beginPath()
      ctx.arc(ex + sx + pose.facing * 0.9, -0.5, 1.7, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // 腮红
  ctx.fillStyle = 'rgba(255, 140, 140, 0.45)'
  ctx.beginPath()
  ctx.arc(ex - 6.5, 4, 2, 0, Math.PI * 2)
  ctx.arc(ex + 6.5, 4, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ───────────────────────── 敌人 ─────────────────────────

/** Bug：绿色甲虫，六条腿交替摆动。(x, y) 为碰撞箱左上，w=26 h=20 */
export function drawBug(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: number,
  t: number,
  squashed: number
): void {
  ctx.save()
  ctx.translate(x + 13, y + 20)
  if (squashed > 0) ctx.scale(1.25, 0.35)
  ctx.scale(facing, 1)
  // 腿
  ctx.strokeStyle = '#1f2a14'
  ctx.lineWidth = 2
  for (let i = 0; i < 3; i++) {
    const swing = squashed > 0 ? 0 : Math.sin(t * 14 + i * 2) * 3
    ctx.beginPath()
    ctx.moveTo(-6 + i * 6, -6)
    ctx.lineTo(-8 + i * 6 + swing, 0)
    ctx.stroke()
  }
  // 壳
  ctx.fillStyle = '#5fae3a'
  ctx.strokeStyle = '#2c5418'
  ctx.beginPath()
  ctx.ellipse(-1, -10, 11, 9, 0, Math.PI, 0)
  ctx.lineTo(10, -5)
  ctx.lineTo(-12, -5)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-1, -19)
  ctx.lineTo(-1, -5)
  ctx.stroke()
  // 斑点
  ctx.fillStyle = '#2c5418'
  ctx.beginPath()
  ctx.arc(-6, -11, 1.8, 0, Math.PI * 2)
  ctx.arc(4, -12, 1.8, 0, Math.PI * 2)
  ctx.fill()
  // 头
  ctx.fillStyle = '#2f3a24'
  ctx.beginPath()
  ctx.arc(11, -8, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(13, -9, 1.7, 0, Math.PI * 2)
  ctx.fill()
  // 触角
  ctx.strokeStyle = '#2f3a24'
  ctx.beginPath()
  ctx.moveTo(12, -12)
  ctx.quadraticCurveTo(15, -18, 19, -17)
  ctx.stroke()
  ctx.restore()
}

/** 飞虫：紫色小飞蛾（"flaky test"）。w=26 h=20 */
export function drawFly(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: number,
  t: number
): void {
  ctx.save()
  ctx.translate(x + 13, y + 10)
  ctx.scale(facing, 1)
  const flap = Math.sin(t * 30) * 0.7
  ctx.fillStyle = 'rgba(220, 210, 255, 0.85)'
  ctx.strokeStyle = '#6b5aa8'
  ctx.lineWidth = 1.5
  for (const s of [-1, 1]) {
    ctx.save()
    ctx.rotate(s * (0.3 + flap * 0.5))
    ctx.beginPath()
    ctx.ellipse(-2, -9 * s, 6, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
  ctx.fillStyle = '#8d6ad8'
  ctx.strokeStyle = '#4a3580'
  ctx.beginPath()
  ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#4a3580'
  ctx.fillRect(-6, -6, 2, 12)
  ctx.fillRect(-1, -7, 2, 14)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(7, -2, 2.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1d1430'
  ctx.beginPath()
  ctx.arc(8, -2, 1.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** 幻觉幽灵：半透明，被注视时捂脸。w=28 h=30 */
export function drawGhost(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: number,
  t: number,
  shy: boolean
): void {
  ctx.save()
  ctx.translate(x + 14, y + 15 + Math.sin(t * 3) * 2)
  ctx.globalAlpha = shy ? 0.45 : 0.88
  ctx.fillStyle = '#e8f0ff'
  ctx.strokeStyle = '#7f8fc0'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, -3, 13, Math.PI, 0)
  ctx.lineTo(13, 12)
  for (let i = 0; i < 4; i++) {
    const wx = 13 - (i + 0.5) * 6.5
    ctx.quadraticCurveTo(
      wx,
      12 + (i % 2 === 0 ? 5 : -2) + Math.sin(t * 8 + i) * 1.5,
      13 - (i + 1) * 6.5,
      12
    )
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  if (shy) {
    // 捂脸的两只小手
    ctx.fillStyle = '#c9d6f5'
    ctx.beginPath()
    ctx.ellipse(-5, -2, 5, 4, 0.3, 0, Math.PI * 2)
    ctx.ellipse(5, -2, 5, 4, -0.3, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillStyle = '#2b2f5a'
    const ex = facing * 3
    ctx.beginPath()
    ctx.ellipse(ex - 4.5, -4, 2.2, 3.4, 0, 0, Math.PI * 2)
    ctx.ellipse(ex + 4.5, -4, 2.2, 3.4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(ex, 4, 3, 2.5, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** 死循环锯齿：旋转的 ↻ 圆锯。(cx, cy) 中心，半径 15 */
export function drawSaw(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(t * 9)
  ctx.fillStyle = '#b9c0cc'
  ctx.strokeStyle = '#4b5263'
  ctx.lineWidth = 2
  ctx.beginPath()
  const n = 10
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2
    const r = i % 2 === 0 ? 16 : 11
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#e0533d'
  ctx.beginPath()
  ctx.arc(0, 0, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(0, 0, 3.4, 0.3, Math.PI * 1.6)
  ctx.stroke()
  ctx.restore()
}

/**
 * Boss「祖传巨石」：一块长满 TODO 注释的灰色巨石，愤怒的双眼。
 * (x, y) 碰撞箱左上，w=h=96。`flash` 受击闪白，`rage` 二阶段泛红。
 */
export function drawBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: number,
  t: number,
  flash: boolean,
  rage: boolean,
  squash: number
): void {
  ctx.save()
  ctx.translate(x + 48, y + 96)
  ctx.scale(1 + squash * 0.15, 1 - squash * 0.15)
  ctx.fillStyle = flash ? '#ffffff' : rage ? '#7a5a66' : '#6c7280'
  ctx.strokeStyle = '#2b2e36'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(-44, 0)
  ctx.lineTo(-48, -60)
  ctx.lineTo(-36, -92)
  ctx.lineTo(-4, -98)
  ctx.lineTo(34, -90)
  ctx.lineTo(48, -58)
  ctx.lineTo(44, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  if (!flash) {
    // 裂缝与 TODO 涂鸦
    ctx.strokeStyle = 'rgba(30, 30, 40, 0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-30, -20)
    ctx.lineTo(-20, -34)
    ctx.lineTo(-26, -46)
    ctx.moveTo(26, -12)
    ctx.lineTo(18, -24)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 230, 120, 0.7)'
    ctx.font = 'bold 10px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('// TODO', -8, -12)
    ctx.fillText('FIXME', 18, -36)
    ctx.fillText('v0.0.1', -22, -70)
  }
  // 眼睛
  const ex = facing * 8
  ctx.fillStyle = rage ? '#ffdf5a' : '#fff'
  ctx.beginPath()
  ctx.ellipse(ex - 15, -58, 9, 7, 0, 0, Math.PI * 2)
  ctx.ellipse(ex + 15, -58, 9, 7, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = rage ? '#b3001b' : '#1b1d24'
  ctx.beginPath()
  ctx.arc(ex - 15 + facing * 3, -57, 3.5, 0, Math.PI * 2)
  ctx.arc(ex + 15 + facing * 3, -57, 3.5, 0, Math.PI * 2)
  ctx.fill()
  // 怒眉
  ctx.strokeStyle = '#1b1d24'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(ex - 26, -72 + Math.sin(t * 6) * 1)
  ctx.lineTo(ex - 6, -64)
  ctx.moveTo(ex + 26, -72 + Math.sin(t * 6) * 1)
  ctx.lineTo(ex + 6, -64)
  ctx.stroke()
  // 嘴
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(ex - 14, -34)
  for (let i = 1; i <= 4; i++) ctx.lineTo(ex - 14 + i * 7, -34 + (i % 2 === 0 ? 0 : -5))
  ctx.stroke()
  ctx.restore()
}

// ───────────────────────── 道具 ─────────────────────────

/** Token：旋转的金色硬币，正面印「T」 */
export function drawCoin(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number): void {
  const w = Math.abs(Math.cos(t * 3.2)) * 9 + 1.5
  ctx.fillStyle = '#ffcf3f'
  ctx.strokeStyle = '#b07a10'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(cx, cy, w, 10, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  if (w > 5) {
    ctx.fillStyle = '#b07a10'
    ctx.font = 'bold 12px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.save()
    ctx.translate(cx, cy + 1)
    ctx.scale(w / 10.5, 1)
    ctx.fillText('T', 0, 0)
    ctx.restore()
  }
}

export function drawHeart(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  filled = true
): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(size / 16, size / 16)
  ctx.beginPath()
  ctx.moveTo(0, 6)
  ctx.bezierCurveTo(-10, -1, -8, -10, 0, -5)
  ctx.bezierCurveTo(8, -10, 10, -1, 0, 6)
  ctx.closePath()
  ctx.fillStyle = filled ? '#ff5c7a' : 'rgba(0,0,0,0.35)'
  ctx.fill()
  ctx.strokeStyle = filled ? '#a3203a' : 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 1.6
  ctx.stroke()
  if (filled) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.beginPath()
    ctx.arc(-3.5, -3.5, 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** 摘要卷轴：/compact */
export function drawScroll(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number): void {
  ctx.save()
  ctx.translate(cx, cy + Math.sin(t * 3) * 2)
  ctx.fillStyle = '#fff3d6'
  ctx.strokeStyle = '#a07a3a'
  ctx.lineWidth = 2
  ctx.fillRect(-9, -11, 18, 22)
  ctx.strokeRect(-9, -11, 18, 22)
  ctx.fillStyle = '#d9b46a'
  roundRect(ctx, -12, -14, 24, 5, 2)
  ctx.fill()
  roundRect(ctx, -12, 9, 24, 5, 2)
  ctx.fill()
  ctx.fillStyle = '#a07a3a'
  for (let i = 0; i < 3; i++) ctx.fillRect(-6, -5 + i * 5, 12 - (i === 2 ? 5 : 0), 2)
  ctx.restore()
}

export function drawPad(ctx: CanvasRenderingContext2D, x: number, y: number, squash: number): void {
  const h = 14 - squash * 8
  ctx.fillStyle = '#3d4250'
  ctx.fillRect(x + 4, y + TILE - 6, TILE - 8, 6)
  ctx.strokeStyle = '#9aa3b5'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i <= 4; i++)
    ctx.lineTo(x + (i % 2 === 0 ? 10 : 22), y + TILE - 6 - (i * (h - 4)) / 4)
  ctx.stroke()
  ctx.fillStyle = '#ff6b4a'
  roundRect(ctx, x + 2, y + TILE - 6 - h, TILE - 4, 6, 3)
  ctx.fill()
}

/** 检查点：git commit 旗。active 时旗面亮起并带 ✓ */
export function drawCheckpoint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  active: boolean,
  t: number
): void {
  const px = x + 8
  ctx.fillStyle = '#5a5f6b'
  ctx.fillRect(px, y - 24, 3, TILE + 24)
  ctx.fillStyle = active ? '#4fd17a' : '#9aa0ab'
  const wave = Math.sin(t * 5) * 2
  ctx.beginPath()
  ctx.moveTo(px + 3, y - 24)
  ctx.quadraticCurveTo(px + 13, y - 22 + wave, px + 22, y - 18)
  ctx.lineTo(px + 3, y - 10)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = active ? '#ffffff' : '#e6e8ec'
  ctx.font = 'bold 9px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(active ? '✓' : 'git', px + 5, y - 15)
}

/** 终点：显示「✓ Tests passed」的终端 */
export function drawGoal(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const bx = x - 16
  const by = y - 40
  ctx.fillStyle = '#2b2f3a'
  roundRect(ctx, bx, by, 64, 50, 6)
  ctx.fill()
  ctx.strokeStyle = '#c7cbd6'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = '#0f1a12'
  ctx.fillRect(bx + 6, by + 6, 52, 34)
  ctx.fillStyle = '#4fd17a'
  ctx.font = 'bold 18px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('✓', bx + 32, by + 19)
  ctx.font = '8px ui-monospace, monospace'
  ctx.fillText('PASS', bx + 32, by + 33)
  if (Math.floor(t * 2) % 2 === 0) ctx.fillRect(bx + 46, by + 30, 5, 7)
  ctx.fillStyle = '#c7cbd6'
  ctx.fillRect(bx + 26, by + 50, 12, 10)
  ctx.fillRect(bx + 16, by + 58, 32, 6)
  // 光柱
  const g = ctx.createLinearGradient(0, by - 60, 0, by)
  g.addColorStop(0, 'rgba(120, 255, 170, 0)')
  g.addColorStop(1, `rgba(120, 255, 170, ${0.18 + Math.sin(t * 3) * 0.08})`)
  ctx.fillStyle = g
  ctx.fillRect(bx + 4, by - 60, 56, 60)
}

/** `{}` 弹体 */
export function drawShot(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(Math.sin(t * 20) * 0.2)
  ctx.font = 'bold 18px ui-monospace, "JetBrains Mono", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 4
  ctx.strokeStyle = CLAUDE_ORANGE_DARK
  ctx.strokeText('{}', 0, 0)
  ctx.fillStyle = '#fff1e0'
  ctx.fillText('{}', 0, 0)
  ctx.restore()
}

/** Boss 冲击波 */
export function drawShockwave(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number
): void {
  ctx.fillStyle = '#ffb347'
  ctx.strokeStyle = '#a24a0a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, y + 20)
  for (let i = 0; i <= 4; i++)
    ctx.lineTo(x + i * 5, y + 20 - (i % 2 === 0 ? 4 : 18 + Math.sin(t * 20) * 3))
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}

/** Boss 二阶段扔出的 TODO 砖 */
export function drawTodoBrick(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number
): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(t * 6)
  ctx.fillStyle = '#c9a24a'
  ctx.strokeStyle = '#6a5014'
  ctx.lineWidth = 2
  ctx.fillRect(-12, -8, 24, 16)
  ctx.strokeRect(-12, -8, 24, 16)
  ctx.fillStyle = '#3a2a08'
  ctx.font = 'bold 8px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('TODO', 0, 1)
  ctx.restore()
}
