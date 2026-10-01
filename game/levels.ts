/**
 * 关卡数据 —— 用坐标式 builder 搭建，而不是手写 ASCII（几百列的字符画很容易数错列）。
 *
 * 网格：每格 TILE=32px，固定 17 行（row 0 在顶，row 16 在底）；默认地面顶 = row 14，
 * 角色站在 row 13。数值手感（见 engine.ts 物理常量）：
 *   单跳高 ≈ 3.3 格、二段跳累计 ≈ 6 格、平地单跳水平 ≈ 5 格、弹跳垫 ≈ 10 格。
 * 所以普通沟 ≤ 4 格、台阶单次抬升 ≤ 3 格；更大的落差都留了二段跳或弹跳垫的解法。
 *
 * 瓦片字符：
 *   .  空      #  地面（实心）   =  砖（实心）     -  单向平台（可从下穿过）
 *   ^  尖刺    ~  岩浆（即死）   ?  道具块（顶出 Token）   !  道具块（顶出爱心）
 *   u  用过的道具块（运行期）     X  Boss 闸门（运行期关闭）
 */

export const TILE = 32
export const ROWS = 17

export type ThemeId = 'meadow' | 'jungle' | 'hell' | 'cloud' | 'prod'

export type Spawn =
  | {
      kind: 'bug' | 'fly' | 'ghost' | 'coin' | 'heart' | 'scroll' | 'pad' | 'check' | 'goal'
      x: number
      y: number
    }
  | { kind: 'boss'; x: number; y: number }
  | { kind: 'sign'; x: number; y: number; text: string }
  | { kind: 'saw'; x: number; y: number; ax: number; ay: number; period: number; phase: number }
  | {
      kind: 'plat'
      x: number
      y: number
      w: number
      dx: number
      dy: number
      period: number
      phase: number
    }

export interface LevelDef {
  /** 1-based 关卡号 */
  index: number
  /** 翻译键后缀：claudeadv.level.<key>.name / .sub */
  key: string
  theme: ThemeId
  /** assets 里的背景图名 */
  bg: string
  width: number
  tiles: string[]
  spawns: Spawn[]
  start: { x: number; y: number }
  /** 上下文窗口满载时间（秒）——超时 = 「上下文溢出」 */
  contextSeconds: number
  /** Boss 关：闸门列与竞技场范围 */
  arena?: { gateX: number; triggerX: number; x0: number; x1: number }
}

class Builder {
  private g: string[][]
  private spawns: Spawn[] = []
  start = { x: 2, y: 13 }

  constructor(readonly width: number) {
    this.g = Array.from({ length: ROWS }, () => Array<string>(width).fill('.'))
  }

  set(x: number, y: number, c: string): this {
    if (x >= 0 && x < this.width && y >= 0 && y < ROWS) this.g[y][x] = c
    return this
  }

  /** 地面：x0..x1（含）从 top 填到底 */
  ground(x0: number, x1: number, top = 14, c = '#'): this {
    for (let x = x0; x <= x1; x++) for (let y = top; y < ROWS; y++) this.set(x, y, c)
    return this
  }

  row(x0: number, x1: number, y: number, c: string): this {
    for (let x = x0; x <= x1; x++) this.set(x, y, c)
    return this
  }

  col(x: number, y0: number, y1: number, c: string): this {
    for (let y = y0; y <= y1; y++) this.set(x, y, c)
    return this
  }

  /** 岩浆池：底部两行 */
  lava(x0: number, x1: number): this {
    return this.row(x0, x1, 15, '~').row(x0, x1, 16, '~')
  }

  coins(x0: number, x1: number, y: number): this {
    for (let x = x0; x <= x1; x++) this.spawns.push({ kind: 'coin', x, y })
    return this
  }

  add(
    kind: 'bug' | 'fly' | 'ghost' | 'coin' | 'heart' | 'scroll' | 'pad' | 'check' | 'goal' | 'boss',
    x: number,
    y: number
  ): this {
    this.spawns.push({ kind, x, y })
    return this
  }

  sign(x: number, y: number, text: string): this {
    this.spawns.push({ kind: 'sign', x, y, text })
    return this
  }

  saw(x: number, y: number, ax: number, ay: number, period = 2.6, phase = 0): this {
    this.spawns.push({ kind: 'saw', x, y, ax, ay, period, phase })
    return this
  }

  plat(x: number, y: number, w: number, dx: number, dy: number, period = 4, phase = 0): this {
    this.spawns.push({ kind: 'plat', x, y, w, dx, dy, period, phase })
    return this
  }

  done(): Pick<LevelDef, 'width' | 'tiles' | 'spawns' | 'start'> {
    return {
      width: this.width,
      tiles: this.g.map((r) => r.join('')),
      spawns: this.spawns,
      start: this.start
    }
  }
}

/** 第 1 关：终端草原 —— 教学关，路牌介绍所有基础机制 */
function level1(): LevelDef {
  const b = new Builder(180)
  b.ground(0, 34)
  b.sign(3, 11, 'move')
  b.coins(7, 11, 12)
  b.sign(13, 9, 'jump')
  b.row(15, 19, 10, '=').set(16, 10, '?').set(18, 10, '?')
  b.sign(22, 11, 'stomp')
  b.add('bug', 26, 13)
  // 沟 35–37
  b.ground(38, 70)
  b.sign(40, 11, 'shoot')
  b.add('bug', 47, 13).add('bug', 51, 13)
  b.ground(55, 59, 12)
  b.coins(55, 59, 10)
  b.row(61, 65, 10, '-')
  b.coins(61, 65, 9)
  b.add('check', 68, 13)
  // 沟 71–74
  b.ground(75, 112)
  b.add('fly', 83, 10)
  b.row(88, 90, 13, '^')
  b.sign(93, 11, 'pad')
  b.add('pad', 96, 13)
  b.row(97, 102, 6, '-')
  b.coins(97, 102, 5)
  b.sign(104, 11, 'scroll')
  b.add('scroll', 107, 13)
  b.sign(111, 11, 'ghost')
  b.ground(113, 125)
  b.add('ghost', 121, 9)
  // 移动平台跨 126–134
  b.plat(127, 12, 3, 4, 0, 4)
  b.ground(135, 179)
  b.add('check', 138, 13)
  b.add('bug', 145, 13).add('bug', 153, 13)
  b.row(147, 151, 10, '=').set(149, 10, '!')
  for (let i = 0; i < 4; i++) b.ground(160 + i, 160 + i, 13 - i)
  b.ground(164, 166, 10)
  b.coins(160, 166, 7)
  b.add('goal', 174, 13)
  return { index: 1, key: 'meadow', theme: 'meadow', bg: 'bg1', contextSeconds: 240, ...b.done() }
}

/** 第 2 关：代码丛林 —— 单向枝杈、锯齿、飞虫、移动平台 */
function level2(): LevelDef {
  const b = new Builder(200)
  b.ground(0, 25)
  b.add('bug', 12, 13).add('bug', 17, 13)
  b.row(14, 17, 11, '-')
  b.ground(20, 21, 9)
  b.coins(19, 22, 7)
  // 沟 26–29
  b.ground(30, 60)
  b.sign(32, 11, 'saw')
  b.saw(37, 12, 0, 2, 2.4)
  b.row(40, 44, 10, '-')
  b.row(46, 50, 7, '-')
  b.coins(46, 50, 6)
  b.add('fly', 44, 8)
  b.add('bug', 52, 13).add('bug', 56, 13)
  b.add('check', 58, 13)
  // 沟 61–65，中间一块单向平台
  b.row(62, 64, 11, '-')
  b.ground(66, 100)
  b.ground(72, 80, 11)
  b.add('bug', 76, 10)
  b.saw(87, 11, 3, 0, 3)
  b.row(90, 94, 10, '=').set(91, 10, '?').set(93, 10, '?')
  b.add('scroll', 98, 13)
  // 大沟 101–112：两块移动平台
  b.plat(102, 12, 3, 4, 0, 4)
  b.plat(109, 11, 3, 0, 2, 3, 0.25)
  b.ground(113, 150)
  b.add('check', 115, 13)
  b.add('fly', 122, 9).add('fly', 131, 10)
  b.add('bug', 125, 13).add('bug', 136, 13).add('bug', 141, 13)
  b.row(128, 130, 13, '^')
  b.add('pad', 145, 13)
  b.row(146, 150, 5, '-')
  b.add('heart', 148, 4)
  // 沟 151–155
  b.ground(156, 199)
  b.add('ghost', 165, 9)
  b.saw(171, 12, 0, 2, 2.2)
  b.saw(177, 12, 0, 2, 2.2, 0.5)
  b.coins(183, 188, 12)
  b.add('goal', 194, 13)
  return { index: 2, key: 'jungle', theme: 'jungle', bg: 'bg2', contextSeconds: 240, ...b.done() }
}

/** 第 3 关：依赖地狱 —— 岩浆池、尖刺、锯齿阵 */
function level3(): LevelDef {
  const b = new Builder(200)
  b.ground(0, 20)
  b.sign(6, 11, 'lava')
  b.lava(21, 26)
  b.row(23, 24, 12, '=')
  b.ground(27, 50)
  b.add('bug', 32, 13).add('bug', 38, 13)
  b.row(42, 43, 13, '^')
  b.saw(47, 11, 0, 2, 2.4)
  b.lava(51, 58)
  b.row(53, 54, 11, '=')
  b.row(57, 58, 9, '=')
  b.ground(59, 90)
  b.add('check', 61, 13)
  b.add('ghost', 70, 9)
  b.add('bug', 66, 13).add('bug', 74, 13).add('bug', 84, 13)
  b.row(76, 80, 10, '=').set(77, 10, '?').set(78, 10, '!').set(79, 10, '?')
  b.lava(91, 104)
  b.plat(92, 12, 3, 3, 0, 3.2)
  b.plat(99, 11, 3, 2, 0, 2.6, 0.5)
  b.ground(105, 140)
  b.add('check', 107, 13)
  b.saw(115, 12, 0, 2, 2.4)
  b.saw(120, 12, 0, 2, 2.4, 0.5)
  b.saw(125, 12, 0, 2, 2.4)
  b.add('scroll', 130, 13)
  b.add('fly', 133, 9).add('fly', 137, 8)
  b.lava(141, 147)
  b.ground(144, 144, 12)
  b.ground(148, 199)
  b.add('bug', 155, 13).add('bug', 160, 13).add('bug', 165, 13)
  b.ground(170, 175, 11)
  b.coins(170, 175, 9)
  b.row(178, 182, 10, '=').set(180, 10, '?')
  b.add('goal', 195, 13)
  return { index: 3, key: 'hell', theme: 'hell', bg: 'bg3', contextSeconds: 260, ...b.done() }
}

/** 第 4 关：云端 —— 单向云朵、无底深渊、弹跳垫 */
function level4(): LevelDef {
  const b = new Builder(210)
  b.ground(0, 14)
  b.add('pad', 12, 13)
  b.row(16, 20, 9, '-')
  b.coins(16, 20, 8)
  b.row(23, 27, 11, '-')
  b.row(30, 34, 8, '-')
  b.coins(30, 34, 7)
  b.ground(37, 48)
  b.add('fly', 40, 10)
  b.add('check', 45, 13)
  b.plat(50, 12, 3, 4, 0, 4)
  b.ground(59, 66, 12)
  b.add('ghost', 66, 8)
  b.row(69, 72, 10, '-')
  b.row(75, 78, 8, '-')
  b.row(81, 84, 10, '-')
  b.add('fly', 78, 5)
  b.ground(87, 100)
  b.add('check', 89, 13)
  b.add('bug', 94, 13)
  b.add('pad', 99, 13)
  b.row(101, 106, 4, '-')
  b.coins(101, 106, 3)
  b.row(103, 106, 11, '-')
  b.row(109, 112, 7, '-')
  b.ground(115, 130, 11)
  b.add('bug', 120, 10).add('bug', 126, 10)
  b.add('scroll', 128, 10)
  b.plat(133, 12, 3, 0, 3, 3.5)
  b.plat(137, 9, 3, 2, 0, 3)
  b.ground(142, 160)
  b.add('check', 144, 13)
  b.saw(150, 10, 3, 0, 3)
  b.add('fly', 155, 9)
  b.add('ghost', 158, 8)
  b.row(162, 165, 11, '-')
  b.row(168, 171, 9, '-')
  b.coins(168, 171, 8)
  b.row(174, 177, 11, '-')
  b.ground(180, 209)
  b.add('heart', 182, 12)
  b.add('goal', 204, 13)
  return { index: 4, key: 'cloud', theme: 'cloud', bg: 'bg4', contextSeconds: 260, ...b.done() }
}

/** 第 5 关：生产环境 —— 短走廊 + Boss「祖传巨石」 */
function level5(): LevelDef {
  const b = new Builder(100)
  b.row(0, 99, 0, '#').row(0, 99, 1, '#')
  b.ground(0, 99)
  b.add('bug', 10, 13).add('bug', 16, 13)
  b.saw(22, 12, 0, 2, 2.4)
  b.add('fly', 28, 9)
  b.row(33, 35, 13, '^')
  b.row(38, 42, 10, '=').set(38, 10, '?').set(40, 10, '!').set(42, 10, '?')
  b.add('check', 48, 13)
  b.add('scroll', 52, 13)
  b.sign(56, 11, 'boss')
  // 竞技场 63..97，右墙 98–99
  b.ground(98, 99, 2)
  b.row(67, 70, 10, '-')
  b.row(78, 82, 8, '-')
  b.row(90, 93, 10, '-')
  b.add('boss', 85, 13)
  return {
    index: 5,
    key: 'prod',
    theme: 'prod',
    bg: 'bg5',
    contextSeconds: 300,
    arena: { gateX: 62, triggerX: 66, x0: 63, x1: 97 },
    ...b.done()
  }
}

export const LEVELS: LevelDef[] = [level1(), level2(), level3(), level4(), level5()]
