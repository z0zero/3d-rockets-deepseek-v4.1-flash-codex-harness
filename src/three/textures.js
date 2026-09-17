import * as THREE from 'three'

function createCanvas(size) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  return canvas
}

/** Soft radial falloff used for glows, stars, and smoke puffs. */
export function createSoftDiscTexture(size = 128, hardness = 0.35) {
  const canvas = createCanvas(size)
  const ctx = canvas.getContext('2d')
  const center = size / 2
  const gradient = ctx.createRadialGradient(center, center, center * hardness * 0.4, center, center, center)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(hardness, 'rgba(255, 255, 255, 0.72)')
  gradient.addColorStop(0.72, 'rgba(255, 255, 255, 0.18)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Cloudy, softly broken disc for cloud decks and high-altitude haze. */
export function createCloudDeckTexture(size = 512) {
  const canvas = createCanvas(size)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(0, 0, 0, 0)'
  ctx.fillRect(0, 0, size, size)

  let seed = 20240917
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }

  for (let i = 0; i < 190; i += 1) {
    const radius = size * (0.03 + random() * 0.12)
    const x = random() * size
    const y = random() * size
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    const alpha = 0.05 + random() * 0.14
    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
    gradient.addColorStop(0.55, `rgba(255, 255, 255, ${alpha * 0.4})`)
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

/** Vertical streak sprite for exhaust trails. */
export function createStreakTexture(size = 128) {
  const canvas = createCanvas(size)
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, 0, size)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
  gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.5)')
  gradient.addColorStop(0.62, 'rgba(255, 255, 255, 0.85)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(size * 0.3, 0, size * 0.4, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
