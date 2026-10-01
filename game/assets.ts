/**
 * 资源加载 —— 只有 ComfyUI（Z-Image Turbo）生成的大幅背景图，
 * 角色 / 敌人 / 道具全部在 sprites.ts 里程序化绘制。
 */

export interface GameAssets {
  /** bg1..bg5 关卡背景 + title 标题图 */
  backgrounds: Record<string, HTMLImageElement>
}

const urls = import.meta.glob('../assets/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`claudeadv image failed: ${url}`))
    img.src = url
  })
}

export async function loadGameAssets(): Promise<GameAssets> {
  const entries = await Promise.all(
    Object.entries(urls).map(async ([path, url]) => {
      const name = path.replace(/^.*\//, '').replace(/\.jpg$/, '')
      return [name, await loadImage(url)] as const
    })
  )
  return { backgrounds: Object.fromEntries(entries) }
}
