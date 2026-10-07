<script setup lang="ts">
defineOptions({ name: 'cockpit-claudeadv' })

import { inject, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { translate, translateTemplate } from '@ui/i18n'
import { loadGameAssets } from './game/assets'
import { ClaudeAdventure, VIEW_H, VIEW_W } from './game/engine'
import type { ClaudeAdvStats, RunResult } from './game/engine'

const uiLang = inject('cockpit:lang', ref('zh')) as Ref<string>
const t = (key: string, fallback?: string): string => translate(uiLang.value, key, fallback)
const te = (key: string, vars: Record<string, string | number>): string =>
  translateTemplate(
    uiLang.value,
    key,
    Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, String(v)]))
  )

const stage = ref<HTMLDivElement | undefined>()
const cv = ref<HTMLCanvasElement | undefined>()
const ready = ref(false)
const failed = ref('')

const muted = ref(localStorage.getItem('claudeadv_muted') === '1')
const storedVol = localStorage.getItem('claudeadv_volume')
const volume = ref(storedVol === null ? 70 : Math.max(0, Math.min(100, Number(storedVol) || 0)))

const resetOpen = ref(false)
const resetting = ref(false)

let game: ClaudeAdventure | null = null
let ro: ResizeObserver | null = null

/** canvas 固定 960×540 逻辑分辨率，按容器等比缩放（不超过 2 倍） */
function fit(): void {
  const s = stage.value
  const canvas = cv.value
  if (!s || !canvas) return
  const scale = Math.min(s.clientWidth / VIEW_W, s.clientHeight / VIEW_H, 2)
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`
}

function onVolume(v: number | number[]): void {
  const n = Array.isArray(v) ? v[0] : v
  if (n === undefined) return
  volume.value = n
  localStorage.setItem('claudeadv_volume', String(Math.round(n)))
  game?.setVolume(n / 100)
}

/** 用完工具栏控件就把焦点还给游戏，免得方向键 / 空格继续作用在控件上 */
function giveBackFocus(): void {
  ;(document.activeElement as HTMLElement | null)?.blur()
  cv.value?.focus({ preventScroll: true })
}

function toggleMute(): void {
  giveBackFocus()
  muted.value = !muted.value
  localStorage.setItem('claudeadv_muted', muted.value ? '1' : '0')
  game?.setMuted(muted.value)
}

async function resetData(): Promise<void> {
  resetting.value = true
  try {
    const res = (await window.cockpit.command('claudeadv.reset', { confirm: true })) as
      (ClaudeAdvStats & { ok: boolean }) | null
    if (res?.ok) game?.resetProgress(res)
  } catch (e) {
    console.error('claudeadv.reset failed', e)
  } finally {
    resetting.value = false
    resetOpen.value = false
    giveBackFocus()
  }
}

onMounted(async () => {
  try {
    const assets = await loadGameAssets()
    if (!cv.value || !stage.value) return
    game = new ClaudeAdventure(cv.value, assets, {
      t,
      te,
      record: async (r: RunResult) => {
        try {
          const res = (await window.cockpit.command('claudeadv.record', { ...r })) as
            (ClaudeAdvStats & { ok: boolean }) | null
          return res?.ok ? res : null
        } catch (e) {
          console.error('claudeadv.record failed', e)
          return null
        }
      },
      getStats: async () => (await window.cockpit.command('claudeadv.stats')) as ClaudeAdvStats
    })
    await game.init()
    game.setVolume(volume.value / 100)
    game.setMuted(muted.value)
    game.start()
    ready.value = true
    fit()
    ro = new ResizeObserver(fit)
    ro.observe(stage.value)
  } catch (e) {
    console.error('claudeadv init failed', e)
    failed.value = String(e)
  }
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
  game?.destroy()
  game = null
})
</script>

<template>
  <div class="d-flex flex-column" style="height: 100%">
    <div class="d-flex align-center ga-2 pb-3 flex-wrap">
      <v-btn
        variant="text"
        :icon="muted ? 'mdi-volume-off' : 'mdi-volume-high'"
        :title="muted ? t('claudeadv.soundOn') : t('claudeadv.soundOff')"
        :aria-label="muted ? t('claudeadv.soundOn') : t('claudeadv.soundOff')"
        @click="toggleMute"
      />
      <v-slider
        :model-value="volume"
        :min="0"
        :max="100"
        :step="1"
        hide-details
        :width="140"
        :aria-label="t('claudeadv.volume')"
        @update:model-value="onVolume"
        @end="giveBackFocus"
      />
      <v-btn
        variant="text"
        prepend-icon="mdi-delete-sweep-outline"
        :disabled="!ready"
        @click="resetOpen = true"
      >
        {{ t('claudeadv.reset.button') }}
      </v-btn>
      <v-spacer />
      <span class="text-caption text-medium-emphasis">{{ t('claudeadv.hint') }}</span>
    </div>

    <div ref="stage" class="ca-stage flex-grow-1 d-flex align-center justify-center">
      <v-progress-circular v-if="!ready && !failed" indeterminate color="primary" />
      <v-alert v-if="failed" type="error" variant="tonal" class="ma-4">
        {{ t('claudeadv.loadFailed') }}：{{ failed }}
      </v-alert>
      <canvas ref="cv" class="ca-canvas" :aria-label="t('claudeadv.title')" />
    </div>

    <v-dialog v-model="resetOpen" max-width="440" @after-leave="giveBackFocus">
      <v-card :title="t('claudeadv.reset.title')" class="pa-2">
        <v-card-text>{{ t('claudeadv.reset.body') }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="resetOpen = false">{{ t('claudeadv.reset.cancel') }}</v-btn>
          <v-btn color="error" variant="tonal" :loading="resetting" @click="resetData">
            {{ t('claudeadv.reset.confirm') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.ca-stage {
  position: relative;
  min-height: 0;
}

.ca-canvas {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 12px;
  box-shadow: 0 0 24px rgba(0, 0, 0, 0.55);
  max-width: 100%;
  max-height: 100%;
}

/* 竖屏手机：横版画面贴着工具栏放在上方，不在高高的舞台里垂直居中（上下各空出半屏） */
@media (max-width: 720px) and (orientation: portrait) {
  .ca-canvas {
    top: 0;
    transform: translateX(-50%);
  }
}
</style>
