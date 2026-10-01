/**
 * WebAudio 合成音频 —— 音效与芯片风背景音乐全部实时合成，零音频资源。
 *
 * 浏览器要求先有用户交互才能出声：AudioContext 懒创建，`unlock()` 由
 * 首次按键 / 点击调用。音乐用「前瞻调度」（每 25ms 把未来 0.12s 内的音符排进
 * AudioContext 时间线），切后台、掉帧都不会走调。
 */

export type Sfx =
  | 'jump'
  | 'djump'
  | 'coin'
  | 'stomp'
  | 'shoot'
  | 'hurt'
  | 'die'
  | 'power'
  | 'check'
  | 'bump'
  | 'pad'
  | 'clear'
  | 'bossHit'
  | 'boom'
  | 'select'
  | 'empty'
  | 'thud'

/** 每首曲子：速度、根音（MIDI）、和弦进行（相对根音的级数半音）、旋律模式 */
interface Song {
  bpm: number
  root: number
  /** 每小节一个和弦根（半音偏移），循环 */
  chords: number[]
  /** 是否小调 */
  minor: boolean
  /** 16 步旋律：和弦音索引（0..3），-1 = 休止 */
  lead: number[]
  /** 16 步贝斯：1 = 根音，2 = 五度，0 = 休止 */
  bass: number[]
  leadWave: OscillatorType
}

export const SONGS: Record<string, Song> = {
  title: {
    bpm: 96,
    root: 60,
    chords: [0, 5, 9, 7],
    minor: false,
    lead: [0, -1, 2, -1, 1, -1, 3, 2, -1, 1, -1, 0, 2, -1, -1, -1],
    bass: [1, 0, 0, 2, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0, 1, 0],
    leadWave: 'triangle'
  },
  meadow: {
    bpm: 132,
    root: 62,
    chords: [0, 7, 9, 5],
    minor: false,
    lead: [0, 1, 2, -1, 2, 1, 3, -1, 2, -1, 1, 0, 1, -1, 2, -1],
    bass: [1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 1],
    leadWave: 'square'
  },
  jungle: {
    bpm: 120,
    root: 57,
    chords: [0, 3, 5, 7],
    minor: true,
    lead: [2, -1, 1, 2, -1, 3, 2, -1, 1, -1, 0, 1, -1, 2, -1, 0],
    bass: [1, 0, 1, 2, 0, 1, 0, 2, 1, 0, 1, 2, 0, 1, 2, 0],
    leadWave: 'square'
  },
  hell: {
    bpm: 144,
    root: 52,
    chords: [0, 1, 0, 6],
    minor: true,
    lead: [0, 0, 2, -1, 1, 0, 3, -1, 0, 0, 2, -1, 3, 2, 1, -1],
    bass: [1, 1, 0, 1, 1, 0, 2, 0, 1, 1, 0, 1, 2, 0, 2, 0],
    leadWave: 'sawtooth'
  },
  cloud: {
    bpm: 108,
    root: 65,
    chords: [0, 9, 5, 7],
    minor: false,
    lead: [3, -1, 2, -1, 1, -1, 2, 3, -1, 2, -1, 1, 0, -1, 1, -1],
    bass: [1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 2, 0, 1, 0],
    leadWave: 'triangle'
  },
  prod: {
    bpm: 150,
    root: 50,
    chords: [0, 0, 3, 5],
    minor: true,
    lead: [0, 2, 3, 2, 0, 2, 3, 1, 0, 2, 3, 2, 1, 3, 2, 1],
    bass: [1, 0, 1, 0, 1, 2, 1, 0, 1, 0, 1, 0, 2, 1, 2, 0],
    leadWave: 'sawtooth'
  },
  boss: {
    bpm: 168,
    root: 49,
    chords: [0, 1, 6, 5],
    minor: true,
    lead: [0, 3, 2, 3, 0, 3, 2, 1, 0, 3, 2, 3, 1, 2, 3, 0],
    bass: [1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 2, 2, 1, 2],
    leadWave: 'square'
  }
}

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)

export class GameAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicBus: GainNode | null = null
  private sfxBus: GainNode | null = null
  private noise: AudioBuffer | null = null
  private volume = 0.7
  private muted = false

  private song: Song | null = null
  private songName = ''
  private step = 0
  private nextTime = 0
  private timer: number | null = null

  unlock(): void {
    if (!this.ctx) {
      const ctx = new AudioContext()
      this.ctx = ctx
      this.master = ctx.createGain()
      this.master.connect(ctx.destination)
      this.musicBus = ctx.createGain()
      this.musicBus.gain.value = 0.32
      this.musicBus.connect(this.master)
      this.sfxBus = ctx.createGain()
      this.sfxBus.gain.value = 0.6
      this.sfxBus.connect(this.master)
      const len = ctx.sampleRate * 0.5
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = this.noise.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      this.applyGain()
      if (this.songName) this.playMusic(this.songName, true)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v))
    this.applyGain()
  }

  setMuted(m: boolean): void {
    this.muted = m
    this.applyGain()
  }

  private applyGain(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume
  }

  // ─────────── 音效 ───────────

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    delay = 0,
    bus: GainNode | null = this.sfxBus
  ): void {
    const ctx = this.ctx
    if (!ctx || !bus) return
    const t = ctx.currentTime + delay
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g)
    g.connect(bus)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  private burst(dur: number, vol: number, freq: number, delay = 0): void {
    const ctx = this.ctx
    if (!ctx || !this.noise || !this.sfxBus) return
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(freq, t)
    f.frequency.exponentialRampToValueAtTime(80, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(f)
    f.connect(g)
    g.connect(this.sfxBus)
    src.start(t)
    src.stop(t + dur + 0.02)
  }

  play(s: Sfx): void {
    if (!this.ctx) return
    switch (s) {
      case 'jump':
        this.tone('square', 280, 620, 0.14, 0.18)
        break
      case 'djump':
        this.tone('square', 420, 900, 0.12, 0.15)
        this.tone('triangle', 840, 1400, 0.1, 0.1, 0.04)
        break
      case 'coin':
        this.tone('square', 988, 988, 0.07, 0.15)
        this.tone('square', 1319, 1319, 0.2, 0.15, 0.07)
        break
      case 'stomp':
        this.tone('square', 400, 90, 0.15, 0.25)
        this.burst(0.08, 0.2, 2000)
        break
      case 'shoot':
        this.tone('sawtooth', 900, 300, 0.1, 0.12)
        break
      case 'hurt':
        this.tone('square', 300, 80, 0.3, 0.25)
        this.burst(0.2, 0.25, 3000)
        break
      case 'die':
        for (let i = 0; i < 6; i++)
          this.tone('square', 600 - i * 80, 500 - i * 80, 0.12, 0.18, i * 0.11)
        break
      case 'power':
        for (let i = 0; i < 5; i++)
          this.tone(
            'triangle',
            523 * Math.pow(1.26, i),
            523 * Math.pow(1.26, i),
            0.12,
            0.2,
            i * 0.06
          )
        break
      case 'check':
        this.tone('triangle', 660, 660, 0.1, 0.2)
        this.tone('triangle', 880, 880, 0.1, 0.2, 0.1)
        this.tone('triangle', 1320, 1320, 0.25, 0.2, 0.2)
        break
      case 'bump':
        this.tone('square', 180, 120, 0.08, 0.2)
        break
      case 'pad':
        this.tone('sine', 200, 1200, 0.3, 0.3)
        break
      case 'clear': {
        const notes = [72, 76, 79, 84, 79, 84]
        notes.forEach((n, i) =>
          this.tone('square', mtof(n), mtof(n), i === notes.length - 1 ? 0.6 : 0.14, 0.18, i * 0.13)
        )
        break
      }
      case 'bossHit':
        this.tone('square', 220, 110, 0.18, 0.3)
        this.burst(0.15, 0.3, 4000)
        break
      case 'boom':
        this.burst(1.2, 0.5, 1500)
        this.tone('sine', 120, 30, 1.0, 0.5)
        break
      case 'select':
        this.tone('square', 660, 660, 0.06, 0.12)
        break
      case 'empty':
        this.tone('square', 160, 140, 0.12, 0.15)
        break
      case 'thud':
        this.tone('sine', 90, 40, 0.35, 0.5)
        this.burst(0.3, 0.3, 600)
        break
    }
  }

  // ─────────── 音乐 ───────────

  playMusic(name: string, force = false): void {
    if (!force && name === this.songName && this.timer !== null) return
    this.stopMusic()
    this.songName = name
    const song = SONGS[name]
    if (!song || !this.ctx) return
    this.song = song
    this.step = 0
    this.nextTime = this.ctx.currentTime + 0.08
    this.timer = window.setInterval(() => this.schedule(), 25)
  }

  stopMusic(): void {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    this.song = null
  }

  private schedule(): void {
    const ctx = this.ctx
    const song = this.song
    if (!ctx || !song) return
    const stepDur = 60 / song.bpm / 4
    // 切到后台回来时 currentTime 跳了很远：直接对齐，别补放一大串
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.02
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.note(song, this.step, this.nextTime, stepDur)
      this.step++
      this.nextTime += stepDur
    }
  }

  private note(song: Song, step: number, t: number, dur: number): void {
    const ctx = this.ctx
    const bus = this.musicBus
    if (!ctx || !bus) return
    const bar = Math.floor(step / 16) % song.chords.length
    const s = step % 16
    const chordRoot = song.root + song.chords[bar]
    const third = song.minor ? 3 : 4
    const chord = [0, third, 7, 12]

    const play = (type: OscillatorType, midi: number, len: number, vol: number): void => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = type
      o.frequency.value = mtof(midi)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(vol, t + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0001, t + len)
      o.connect(g)
      g.connect(bus)
      o.start(t)
      o.stop(t + len + 0.02)
    }

    const li = song.lead[s]
    if (li >= 0)
      play(
        song.leadWave,
        chordRoot + 12 + chord[li],
        dur * 1.6,
        song.leadWave === 'triangle' ? 0.22 : 0.08
      )
    const bi = song.bass[s]
    if (bi > 0) play('triangle', chordRoot - 12 + (bi === 2 ? 7 : 0), dur * 1.8, 0.3)
    // 简易鼓：4 拍底鼓 + 反拍沙锤
    if (s % 4 === 0 && this.noise) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.setValueAtTime(140, t)
      o.frequency.exponentialRampToValueAtTime(40, t + 0.1)
      g.gain.setValueAtTime(0.35, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
      o.connect(g)
      g.connect(bus)
      o.start(t)
      o.stop(t + 0.14)
    } else if (s % 2 === 0 && this.noise) {
      const src = ctx.createBufferSource()
      src.buffer = this.noise
      const f = ctx.createBiquadFilter()
      f.type = 'highpass'
      f.frequency.value = 6000
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.08, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
      src.connect(f)
      f.connect(g)
      g.connect(bus)
      src.start(t)
      src.stop(t + 0.05)
    }
  }

  destroy(): void {
    this.stopMusic()
    void this.ctx?.close()
    this.ctx = null
  }
}
