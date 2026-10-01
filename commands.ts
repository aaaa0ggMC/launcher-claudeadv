import type { CommandSpec } from '../../main/process/commands/types'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { USER_CONFIG_DIR } from '../../main/process/paths'
import { makeLogger } from '../../main/process/logger'

const log = makeLogger('claudeadv')

/**
 * Claude 历险记进度 —— 读进度 / 记一次通关 / 清空进度。
 * 数据文件 `~/.config/LinuxCockpit/claudeadv/stats.json`，tmp+rename 原子写入。
 */

const LEVEL_COUNT = 5

export interface LevelRecord {
  clears: number
  bestTime: number | null
  bestTokens: number
  fewestDeaths: number | null
}

export interface ClaudeAdvStats {
  version: 1
  /** 已解锁的最高关卡（1..5） */
  unlocked: number
  levels: Record<string, LevelRecord>
  /** 通关全部 5 关的次数 */
  endings: number
}

const STATS_PATH = join(USER_CONFIG_DIR, 'claudeadv', 'stats.json')

function defaults(): ClaudeAdvStats {
  return { version: 1, unlocked: 1, levels: {}, endings: 0 }
}

const num = (v: unknown, d: number): number => (Number.isFinite(Number(v)) ? Number(v) : d)

async function readStats(): Promise<ClaudeAdvStats> {
  try {
    const parsed = JSON.parse(await readFile(STATS_PATH, 'utf-8')) as Partial<ClaudeAdvStats>
    const levels: Record<string, LevelRecord> = {}
    for (const [k, r] of Object.entries(parsed.levels ?? {})) {
      if (!r || typeof r !== 'object') continue
      levels[k] = {
        clears: Math.max(0, Math.round(num(r.clears, 0))),
        bestTime: r.bestTime == null ? null : num(r.bestTime, 0),
        bestTokens: Math.max(0, Math.round(num(r.bestTokens, 0))),
        fewestDeaths:
          r.fewestDeaths == null ? null : Math.max(0, Math.round(num(r.fewestDeaths, 0)))
      }
    }
    return {
      version: 1,
      unlocked: Math.min(LEVEL_COUNT, Math.max(1, Math.round(num(parsed.unlocked, 1)))),
      levels,
      endings: Math.max(0, Math.round(num(parsed.endings, 0)))
    }
  } catch {
    return defaults()
  }
}

async function writeStats(stats: ClaudeAdvStats): Promise<void> {
  await mkdir(dirname(STATS_PATH), { recursive: true })
  const tmp = `${STATS_PATH}.tmp`
  await writeFile(tmp, JSON.stringify(stats, null, 2), 'utf-8')
  await rename(tmp, STATS_PATH)
}

export default [
  {
    name: 'claudeadv.stats',
    description: '读取 Claude 历险记进度（已解锁关卡 / 每关最佳用时与 Token / 通关次数）',
    usage: 'claudeadv.stats',
    run: async () => readStats()
  },
  {
    name: 'claudeadv.record',
    description:
      '记录一次关卡通关（--level 1-5 --time <秒> --tokens <收集数> --deaths <阵亡数>），解锁下一关并更新最佳纪录',
    usage: 'claudeadv.record --level 1 --time 83.4 --tokens 21 --deaths 0',
    run: async (ctx) => {
      const level = Math.round(Number(ctx.named.level))
      const time = Number(ctx.named.time)
      const tokens = Math.max(0, Math.round(Number(ctx.named.tokens) || 0))
      const deaths = Math.max(0, Math.round(Number(ctx.named.deaths) || 0))
      if (!Number.isInteger(level) || level < 1 || level > LEVEL_COUNT)
        return { ok: false, error: `--level 必须是 1-${LEVEL_COUNT}` }
      if (!Number.isFinite(time) || time <= 0)
        return { ok: false, error: '--time 必须是正数（秒）' }
      const stats = await readStats()
      const prev = stats.levels[String(level)] ?? {
        clears: 0,
        bestTime: null,
        bestTokens: 0,
        fewestDeaths: null
      }
      stats.levels[String(level)] = {
        clears: prev.clears + 1,
        bestTime: prev.bestTime === null ? time : Math.min(prev.bestTime, time),
        bestTokens: Math.max(prev.bestTokens, tokens),
        fewestDeaths: prev.fewestDeaths === null ? deaths : Math.min(prev.fewestDeaths, deaths)
      }
      stats.unlocked = Math.min(LEVEL_COUNT, Math.max(stats.unlocked, level + 1))
      if (level === LEVEL_COUNT) stats.endings += 1
      await writeStats(stats)
      log.info('claudeadv.record ok', { level, time, tokens, deaths })
      return { ok: true, ...stats }
    }
  },
  {
    name: 'claudeadv.reset',
    description: '清空 Claude 历险记的全部进度（需 --confirm true）',
    usage: 'claudeadv.reset --confirm true',
    run: async (ctx) => {
      if (String(ctx.named.confirm) !== 'true') return { ok: false, error: '需要 --confirm true' }
      await writeStats(defaults())
      log.info('claudeadv.reset')
      return { ok: true, ...defaults() }
    }
  }
] satisfies CommandSpec[]
