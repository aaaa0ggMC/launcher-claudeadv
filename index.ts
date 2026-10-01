import { defineAsyncComponent } from 'vue'
import type { Ability } from '../../main/ui/ability'

/**
 * Claude 历险记 —— 2D 横版平台跳跃小游戏。
 * 珊瑚橙的小星芒 Claude 穿过 5 个关卡（终端草原 → 代码丛林 → 依赖地狱 → 云端 →
 * 生产环境），踩 Bug、发射 `{}`、躲幻觉，最后打倒 Boss「祖传巨石」把代码上线。
 *
 * 独立的公开仓库 aaaa0ggMC/launcher-claudeadv（主仓库 .gitignore 忽略本目录）。
 * 背景图由 ComfyUI 生成，角色 / 敌人 / 音效 / 音乐全部程序化生成。
 * keepAlive: false —— 切走即销毁、音乐停止，进度经 claudeadv.* 命令持久化。
 */
export default {
  id: 'claudeadv',
  name: 'Claude 历险记',
  icon: 'default/sun/padding',
  category: '游戏',
  keepAlive: false,
  component: defineAsyncComponent(() => import('./View.vue'))
} satisfies Ability
