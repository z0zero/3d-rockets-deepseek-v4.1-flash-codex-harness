import * as THREE from 'three'

const COLOR_SPACE_HELPERS = `
vec3 acesFilm(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 linearToSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(0.4166667)) - 0.055, step(vec3(0.0031308), c));
}
`

function createPuffTexture(size = 192) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  let seed = 98765
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }

  for (let i = 0; i < 14; i += 1) {
    const radius = size * (0.16 + random() * 0.16)
    const x = size * 0.5 + (random() - 0.5) * size * 0.36
    const y = size * 0.5 + (random() - 0.5) * size * 0.36
    const alpha = 0.16 + random() * 0.16
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
    gradient.addColorStop(0.6, `rgba(255, 255, 255, ${alpha * 0.45})`)
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

class SmokeField {
  constructor(count, texture) {
    this.count = count
    this.cursor = 0

    const geometry = new THREE.PlaneGeometry(1, 1)
    this.offsets = new Float32Array(count * 3)
    this.opacity = new Float32Array(count)
    this.tint = new Float32Array(count)
    this.rotation = new Float32Array(count)
    this.colors = new Float32Array(count * 3)

    geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(this.offsets, 3))
    geometry.setAttribute('aOpacity', new THREE.InstancedBufferAttribute(this.opacity, 1))
    geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(this.tint, 1))
    geometry.setAttribute('aRotation', new THREE.InstancedBufferAttribute(this.rotation, 1))
    geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(this.colors, 3))

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uFogColor: { value: new THREE.Color('#16233a') },
        uFogDensity: { value: 0.00042 },
      },
      vertexShader: `
        attribute vec3 aOffset;
        attribute float aOpacity;
        attribute float aTint;
        attribute float aRotation;
        attribute vec3 aColor;
        varying vec2 vUv;
        varying float vOpacity;
        varying float vTint;
        varying vec3 vColor;
        varying float vFogDepth;
        void main() {
          vUv = uv;
          vOpacity = aOpacity;
          vTint = aTint;
          vColor = aColor;
          vec2 centered = position.xy;
          float c = cos(aRotation);
          float s = sin(aRotation);
          vec2 rotated = vec2(centered.x * c - centered.y * s, centered.x * s + centered.y * c);
          float size = length(vec3(instanceMatrix[0][0], instanceMatrix[1][0], instanceMatrix[2][0]));
          vec3 center = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 world = center + right * rotated.x * size + up * rotated.y * size;
          vec4 viewPos = viewMatrix * vec4(world, 1.0);
          vFogDepth = -viewPos.z;
          gl_Position = projectionMatrix * viewPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        varying vec2 vUv;
        varying float vOpacity;
        varying float vTint;
        varying vec3 vColor;
        varying float vFogDepth;
        ${COLOR_SPACE_HELPERS}
        void main() {
          float alpha = texture2D(uMap, vUv).a * vOpacity;
          if (alpha < 0.006) discard;
          vec3 lit = vColor * vTint;
          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          vec3 color = mix(lit, uFogColor, clamp(fogFactor, 0.0, 1.0));
          gl_FragColor = vec4(linearToSRGB(acesFilm(color)), alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    })

    this.mesh = new THREE.InstancedMesh(geometry, this.material, count)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 4
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    this.matrix = new THREE.Matrix4()
    this.position = new THREE.Vector3()
    this.velocity = new Float32Array(count * 3)
    this.life = new Float32Array(count)
    this.maxLife = new Float32Array(count)
    this.size = new Float32Array(count)
    this.growth = new Float32Array(count)
    this.spin = new Float32Array(count)
    this.peakOpacity = new Float32Array(count)
    this.baseColor = new Float32Array(count * 3)
    this.rise = new Float32Array(count)
    this.drag = new Float32Array(count)

    for (let i = 0; i < count; i += 1) {
      this.matrix.makeScale(0, 0, 0)
      this.mesh.setMatrixAt(i, this.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  spawn(options) {
    const index = this.cursor
    this.cursor = (this.cursor + 1) % this.count
    const i3 = index * 3

    this.offsets[i3] = options.position.x
    this.offsets[i3 + 1] = options.position.y
    this.offsets[i3 + 2] = options.position.z
    this.velocity[i3] = options.velocity.x
    this.velocity[i3 + 1] = options.velocity.y
    this.velocity[i3 + 2] = options.velocity.z

    this.life[index] = 0
    this.maxLife[index] = options.life
    this.size[index] = options.size
    this.growth[index] = options.growth
    this.spin[index] = options.spin
    this.peakOpacity[index] = options.opacity
    this.rise[index] = options.rise ?? 0
    this.drag[index] = options.drag ?? 0.9

    const color = options.color
    this.baseColor[i3] = color.r
    this.baseColor[i3 + 1] = color.g
    this.baseColor[i3 + 2] = color.b

    this.colors[i3] = color.r
    this.colors[i3 + 1] = color.g
    this.colors[i3 + 2] = color.b
    this.tint[index] = options.tint ?? 1
    this.rotation[index] = options.rotation ?? 0
    this.opacity[index] = 0

    return index
  }

  update(dt) {
    let active = 0
    for (let index = 0; index < this.count; index += 1) {
      if (this.maxLife[index] <= 0) continue
      this.life[index] += dt
      const t = this.life[index] / this.maxLife[index]
      if (t >= 1) {
        this.maxLife[index] = 0
        this.opacity[index] = 0
        this.matrix.makeScale(0, 0, 0)
        this.mesh.setMatrixAt(index, this.matrix)
        continue
      }
      active += 1

      const i3 = index * 3
      const drag = Math.max(0, 1 - this.drag[index] * dt)
      this.velocity[i3] *= drag
      this.velocity[i3 + 2] *= drag
      this.velocity[i3 + 1] = this.velocity[i3 + 1] * drag + this.rise[index] * dt
      this.offsets[i3] += this.velocity[i3] * dt
      this.offsets[i3 + 1] += this.velocity[i3 + 1] * dt
      this.offsets[i3 + 2] += this.velocity[i3 + 2] * dt

      const fadeIn = Math.min(t / 0.12, 1)
      const fadeOut = 1 - Math.pow(t, 1.5)
      this.opacity[index] = this.peakOpacity[index] * fadeIn * fadeOut
      this.tint[index] = 0.55 + 0.45 * (1 - t)
      this.rotation[index] += this.spin[index] * dt

      const size = this.size[index] * (1 + this.growth[index] * t)
      this.position.set(this.offsets[i3], this.offsets[i3 + 1], this.offsets[i3 + 2])
      this.matrix.makeScale(size, size, size)
      this.matrix.setPosition(this.position)
      this.mesh.setMatrixAt(index, this.matrix)
    }

    const geometry = this.mesh.geometry
    geometry.attributes.aOffset.needsUpdate = true
    geometry.attributes.aOpacity.needsUpdate = true
    geometry.attributes.aTint.needsUpdate = true
    geometry.attributes.aRotation.needsUpdate = true
    geometry.attributes.aColor.needsUpdate = true
    this.mesh.instanceMatrix.needsUpdate = true
    this.active = active
  }

  clear() {
    for (let index = 0; index < this.count; index += 1) {
      this.maxLife[index] = 0
      this.life[index] = 0
      this.opacity[index] = 0
      this.matrix.makeScale(0, 0, 0)
      this.mesh.setMatrixAt(index, this.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.active = 0
  }

  get capacity() {
    return this.count
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}

const FLAME_FRAGMENT = `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uStretch;
  uniform vec3 uHot;
  uniform vec3 uCool;
  varying vec2 vUv;
  ${COLOR_SPACE_HELPERS}
  void main() {
    float axial = clamp(vUv.y, 0.0, 1.0);
    float ripple = 0.86 + 0.14 * sin(axial * 24.0 - uTime * 28.0) * sin(uTime * 11.0 + axial * 9.0);
    float flicker = ripple * (0.9 + 0.1 * sin(uTime * 41.0));
    float alpha = pow(1.0 - axial, 1.55) * flicker * uIntensity * (1.0 / uStretch);
    vec3 color = mix(uCool, uHot, pow(1.0 - axial, 2.4));
    gl_FragColor = vec4(linearToSRGB(acesFilm(color * alpha * 1.6)), alpha);
  }
`

const FLAME_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

function createFlameCone({ radius, length, hot, cool, intensity }) {
  const geometry = new THREE.ConeGeometry(radius, 1, 26, 1, true)
  geometry.translate(0, -0.5, 0)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uStretch: { value: 1 },
      uHot: { value: new THREE.Color(hot) },
      uCool: { value: new THREE.Color(cool) },
    },
    vertexShader: FLAME_VERTEX,
    fragmentShader: FLAME_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.length = length
  mesh.userData.baseIntensity = intensity
  mesh.frustumCulled = false
  return mesh
}

export function createLaunchEffects(scene, site) {
  const group = new THREE.Group()
  const puffTexture = createPuffTexture(192)
  const softDisc = createPuffTexture(128)

  const smoke = new SmokeField(300, puffTexture)

  const flameGroup = new THREE.Group()
  const coreFlame = createFlameCone({ radius: 3.1, length: 34, hot: '#ffffff', cool: '#ffd8a0', intensity: 2.4 })
  const midFlame = createFlameCone({ radius: 5.6, length: 52, hot: '#ffd08a', cool: '#ff7326', intensity: 1.5 })
  const outerFlame = createFlameCone({ radius: 9.2, length: 74, hot: '#ff9a44', cool: '#c03a12', intensity: 0.75 })
  coreFlame.position.y = -5.6
  midFlame.position.y = -5.2
  outerFlame.position.y = -4.8
  flameGroup.add(coreFlame, midFlame, outerFlame)

  const glowMaterial = new THREE.SpriteMaterial({
    map: softDisc,
    color: '#ffbe86',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const glow = new THREE.Sprite(glowMaterial)
  glow.scale.set(30, 30, 1)
  glow.position.y = -4
  flameGroup.add(glow)

  const engineLight = new THREE.PointLight('#ff9a4d', 0, 420, 2)
  engineLight.position.y = -8
  flameGroup.add(engineLight)

  const padFireLight = new THREE.PointLight('#ff8a3c', 0, 360, 2)
  padFireLight.position.set(0, 6, 0)

  const shockwaveMaterial = new THREE.MeshBasicMaterial({
    color: '#ffd7ab',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const shockwave = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 64), shockwaveMaterial)
  shockwave.rotation.x = -Math.PI / 2
  shockwave.position.y = 4.2
  shockwave.visible = false

  const steamLight = new THREE.PointLight('#cfe2ff', 0, 260, 2)
  steamLight.position.set(0, 8, 0)

  site.rocket.root.add(flameGroup)
  group.add(smoke.mesh, shockwave, padFireLight, steamLight)
  scene.add(group)

  const puffColorDark = new THREE.Color('#5b6068')
  const puffColorLit = new THREE.Color('#d8d2cb')
  const puffColorWhite = new THREE.Color('#eef3fb')
  const puffColorEmber = new THREE.Color('#c98b53')

  const state = {
    throttle: 0,
    ignitionBoost: 0,
    shockwaveTime: -1,
    smokeBudget: 0,
    spawnAccumulator: 0,
    trailAccumulator: 0,
    elapsed: 0,
  }

  function spawnGroundSmoke(dt, strength) {
    state.spawnAccumulator += dt
    const interval = 0.012 / Math.max(strength, 0.05)
    while (state.spawnAccumulator > interval) {
      state.spawnAccumulator -= interval
      const angle = Math.random() * Math.PI * 2
      const radius = 6 + Math.random() * 16
      const speed = 14 + Math.random() * 26 * strength
      const position = new THREE.Vector3(Math.cos(angle) * radius, 3 + Math.random() * 6, Math.sin(angle) * radius)
      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        5 + Math.random() * 13 * strength,
        Math.sin(angle) * speed,
      )
      const lit = Math.random()
      smoke.spawn({
        position,
        velocity,
        life: 5.5 + Math.random() * 6.5,
        size: 12 + Math.random() * 12,
        growth: 2.4 + Math.random() * 2.2,
        spin: (Math.random() - 0.5) * 0.5,
        rotation: Math.random() * Math.PI * 2,
        opacity: 0.34 + Math.random() * 0.3,
        rise: 1.5 + Math.random() * 2.4,
        drag: 0.55 + Math.random() * 0.4,
        color: lit > 0.72 ? puffColorLit : lit > 0.34 ? puffColorDark : puffColorEmber,
        tint: 0.8 + Math.random() * 0.35,
      })
    }
  }

  function spawnDelugeSteam(dt, strength) {
    if (Math.random() > strength * 0.9) return
    const angle = Math.random() * Math.PI * 2
    const radius = 12 + Math.random() * 30
    smoke.spawn({
      position: new THREE.Vector3(Math.cos(angle) * radius, 1 + Math.random() * 3, Math.sin(angle) * radius),
      velocity: new THREE.Vector3(Math.cos(angle) * (5 + Math.random() * 9), 1.4 + Math.random() * 2.6, Math.sin(angle) * (5 + Math.random() * 9)),
      life: 8 + Math.random() * 7,
      size: 16 + Math.random() * 14,
      growth: 2.6,
      spin: (Math.random() - 0.5) * 0.3,
      rotation: Math.random() * Math.PI * 2,
      opacity: 0.2 + Math.random() * 0.18,
      rise: 1.1,
      drag: 0.7,
      color: puffColorWhite,
      tint: 1.05,
    })
  }

  function spawnExhaustTrail(dt, rocketY, velocity, throttle) {
    state.trailAccumulator += dt
    const interval = 0.028 / Math.max(throttle, 0.05)
    while (state.trailAccumulator > interval) {
      state.trailAccumulator -= interval
      const angle = Math.random() * Math.PI * 2
      const radius = Math.random() * 7
      const position = new THREE.Vector3(
        Math.cos(angle) * radius,
        rocketY - 10 - Math.random() * 14,
        Math.sin(angle) * radius,
      )
      smoke.spawn({
        position,
        velocity: new THREE.Vector3(
          Math.cos(angle) * (4 + Math.random() * 7),
          -velocity * 0.12 + (Math.random() - 0.5) * 6,
          Math.sin(angle) * (4 + Math.random() * 7),
        ),
        life: 3.4 + Math.random() * 4.2,
        size: 10 + Math.random() * 10,
        growth: 2.2,
        spin: (Math.random() - 0.5) * 0.4,
        rotation: Math.random() * Math.PI * 2,
        opacity: 0.22 + Math.random() * 0.2,
        rise: 0.6,
        drag: 0.5,
        color: Math.random() > 0.6 ? puffColorLit : puffColorDark,
        tint: 0.85,
      })
    }
  }

  return {
    group,
    smoke,
    flameGroup,
    setThrottle(value) {
      state.throttle = THREE.MathUtils.clamp(value, 0, 1)
    },
    reset() {
      state.throttle = 0
      state.ignitionBoost = 0
      state.shockwaveTime = 0
      state.spawnAccumulator = 0
      state.trailAccumulator = 0
      shockwave.visible = false
      shockwaveMaterial.opacity = 0
      smoke.clear()
    },
    detonate() {
      state.shockwaveTime = 0
      state.ignitionBoost = 1
      shockwave.visible = true
    },
    update(dt, elapsed, context) {
      state.elapsed = elapsed
      const throttle = state.throttle
      const altitude = context.altitude ?? 0
      const velocity = context.velocity ?? 0

      if (scene.fog) {
        smoke.material.uniforms.uFogColor.value.copy(scene.fog.color)
        smoke.material.uniforms.uFogDensity.value = scene.fog.density
      }

      state.ignitionBoost = Math.max(0, state.ignitionBoost - dt * 0.35)

      const stretch = 0.5 + 0.5 * Math.min(altitude / 140, 1)
      const flicker = 1 + Math.sin(elapsed * 37) * 0.045 + Math.sin(elapsed * 61) * 0.03
      const cones = [coreFlame, midFlame, outerFlame]
      cones.forEach((cone) => {
        const uniforms = cone.material.uniforms
        uniforms.uTime.value = elapsed
        uniforms.uStretch.value = stretch
        uniforms.uIntensity.value = throttle * cone.userData.baseIntensity * flicker
        cone.scale.set(1 + (1 - stretch) * 0.35, cone.userData.length * stretch, 1 + (1 - stretch) * 0.35)
      })

      glowMaterial.opacity = throttle * 0.75 * flicker
      glow.scale.setScalar(24 + throttle * 22)
      glow.position.y = -5 - stretch * 6

      engineLight.intensity = throttle * 900 * flicker
      engineLight.distance = 300 + altitude * 0.2
      padFireLight.intensity = throttle * 420 * flicker * (state.ignitionBoost * 0.7 + 0.35) * Math.max(0, 1 - altitude / 260)
      steamLight.intensity = throttle * 120 * Math.max(0, 1 - altitude / 400)

      if (state.shockwaveTime >= 0) {
        state.shockwaveTime += dt
        const t = state.shockwaveTime / 2.4
        if (t >= 1) {
          state.shockwaveTime = -1
          shockwave.visible = false
          shockwaveMaterial.opacity = 0
        } else {
          const scale = 24 + t * 320
          shockwave.scale.set(scale, scale, 1)
          shockwaveMaterial.opacity = 0.55 * (1 - t) * (1 - t)
        }
      }

      if (throttle > 0.02 && altitude < 220) {
        spawnGroundSmoke(dt, Math.min(throttle, 1) * (1 - altitude / 220))
      }
      if (throttle > 0.35 && altitude < 320) {
        spawnDelugeSteam(dt, Math.min(throttle, 1) * (1 - altitude / 320))
      }
      if (throttle > 0.4 && altitude > 60) {
        spawnExhaustTrail(dt, context.rocketY ?? 0, velocity, throttle)
      }

      smoke.update(dt)
    },
    dispose() {
      site.rocket.root.remove(flameGroup)
      scene.remove(group)
      flameGroup.traverse((object) => {
        if (object.geometry) object.geometry.dispose()
        if (object.material) object.material.dispose()
      })
      shockwave.geometry.dispose()
      shockwaveMaterial.dispose()
      glowMaterial.dispose()
      softDisc.dispose()
      puffTexture.dispose()
      smoke.dispose()
    },
  }
}