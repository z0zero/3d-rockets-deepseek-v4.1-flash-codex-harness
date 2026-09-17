import * as THREE from 'three'

import { createCloudDeckTexture, createSoftDiscTexture } from './textures.js'

const SKY_VERTEX = `
  varying vec3 vWorldDirection;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldDirection = worldPosition.xyz - cameraPosition;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SKY_FRAGMENT = `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform float uHazeStrength;
  uniform float uSunStrength;
  varying vec3 vWorldDirection;
  void main() {
    vec3 direction = normalize(vWorldDirection);
    float elevation = direction.y;
    vec3 color = mix(uHorizon, uZenith, pow(clamp(elevation, 0.0, 1.0), 0.58));
    color = mix(color, uGround, smoothstep(0.03, -0.16, elevation));

    float sunAmount = max(dot(direction, normalize(uSunDirection)), 0.0);
    color += uSunColor * pow(sunAmount, 22.0) * uSunStrength;
    color += uSunColor * pow(sunAmount, 3.0) * 0.14 * uSunStrength;

    float haze = exp(-abs(elevation) * 10.0) * uHazeStrength;
    color += uHorizon * haze;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const OCEAN_FRAGMENT = `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uGlint;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec2 vUv;
  varying float vFogDepth;
  void main() {
    vec2 point = vUv * 2.0 - 1.0;
    float distanceFromCenter = clamp(length(point), 0.0, 1.0);
    float swell = sin(point.y * 220.0 + uTime * 0.55) * 0.5 + 0.5;
    float ripple = sin(point.x * 90.0 - uTime * 0.35) * 0.5 + 0.5;
    float glint = smoothstep(0.72, 1.0, swell * 0.65 + ripple * 0.35);
    vec3 color = mix(uDeep, uShallow, smoothstep(0.15, 0.95, distanceFromCenter));
    color += uGlint * glint * 0.16;
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const SUNSET = {
  zenith: new THREE.Color('#0d1b3a'),
  horizon: new THREE.Color('#e98a4a'),
  ground: new THREE.Color('#101a2b'),
  sunColor: new THREE.Color('#ffd2a1'),
  haze: 0.22,
  sun: 1.0,
}

const SPACE = {
  zenith: new THREE.Color('#01030a'),
  horizon: new THREE.Color('#123055'),
  ground: new THREE.Color('#02040a'),
  sunColor: new THREE.Color('#ffd9b0'),
  haze: 0.045,
  sun: 0.75,
}

function createSky() {
  const geometry = new THREE.SphereGeometry(9000, 48, 32)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: SUNSET.zenith.clone() },
      uHorizon: { value: SUNSET.horizon.clone() },
      uGround: { value: SUNSET.ground.clone() },
      uSunColor: { value: SUNSET.sunColor.clone() },
      uSunDirection: { value: new THREE.Vector3(-0.55, 0.12, -0.82).normalize() },
      uHazeStrength: { value: SUNSET.haze },
      uSunStrength: { value: SUNSET.sun },
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = -10
  return mesh
}

function createStars(softDisc) {
  const count = 1500
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  let seed = 987654321
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }

  for (let i = 0; i < count; i += 1) {
    const theta = random() * Math.PI * 2
    const elevation = Math.asin(0.05 + random() * 0.94)
    const radius = 7200
    positions[i * 3] = Math.cos(elevation) * Math.cos(theta) * radius
    positions[i * 3 + 1] = Math.sin(elevation) * radius
    positions[i * 3 + 2] = Math.cos(elevation) * Math.sin(theta) * radius
    sizes[i] = 12 + random() * 26
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

  const material = new THREE.PointsMaterial({
    color: 0xdfe9ff,
    map: softDisc,
    size: 20,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = -9
  return points
}

function createOcean() {
  const geometry = new THREE.PlaneGeometry(26000, 26000, 1, 1)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#081426') },
      uShallow: { value: new THREE.Color('#173352') },
      uGlint: { value: new THREE.Color('#ffb87a') },
      uFogColor: { value: new THREE.Color('#16233a') },
      uFogDensity: { value: 0.00042 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vFogDepth;
      void main() {
        vUv = uv;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vFogDepth = -viewPosition.z;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: OCEAN_FRAGMENT,
    fog: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = -52
  mesh.renderOrder = -8
  return mesh
}

function createTerrain() {
  const group = new THREE.Group()

  const rockMaterial = new THREE.MeshStandardMaterial({
    color: '#2b3340',
    roughness: 0.96,
    metalness: 0.02,
    flatShading: true,
  })
  const plateau = new THREE.Mesh(new THREE.CylinderGeometry(560, 760, 62, 40, 1, true), rockMaterial)
  plateau.position.y = -31
  plateau.receiveShadow = true
  group.add(plateau)

  const surfaceMaterial = new THREE.MeshStandardMaterial({
    color: '#333d49',
    roughness: 0.98,
    metalness: 0.0,
  })
  const surface = new THREE.Mesh(new THREE.CircleGeometry(560, 48), surfaceMaterial)
  surface.rotation.x = -Math.PI / 2
  surface.receiveShadow = true
  group.add(surface)

  const apronMaterial = new THREE.MeshStandardMaterial({
    color: '#20262f',
    roughness: 0.85,
    metalness: 0.05,
  })
  const apron = new THREE.Mesh(new THREE.RingGeometry(52, 250, 48), apronMaterial)
  apron.rotation.x = -Math.PI / 2
  apron.position.y = 0.35
  apron.receiveShadow = true
  group.add(apron)

  return group
}

function createScrub(softDisc) {
  const count = 220
  const geometry = new THREE.ConeGeometry(3.4, 9, 5, 1)
  const material = new THREE.MeshStandardMaterial({
    color: '#26313a',
    roughness: 0.95,
    flatShading: true,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  let seed = 13579
  const random = () => {
    seed = (seed * 48271) % 2147483647
    return seed / 2147483647
  }

  for (let i = 0; i < count; i += 1) {
    const theta = random() * Math.PI * 2
    const radius = 260 + random() * 280
    const height = 0.6 + random() * 1.6
    position.set(Math.cos(theta) * radius, height * 4.2, Math.sin(theta) * radius)
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI)
    scale.set(0.6 + random() * 0.9, height, 0.6 + random() * 0.9)
    matrix.compose(position, quaternion, scale)
    mesh.setMatrixAt(i, matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.castShadow = false
  mesh.receiveShadow = true
  return mesh
}

function createMountainRange() {
  const group = new THREE.Group()
  const geometry = new THREE.ConeGeometry(1, 1, 5, 1)
  const material = new THREE.MeshBasicMaterial({
    color: '#1b2740',
    transparent: true,
    opacity: 0.95,
  })
  const count = 46
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  let seed = 24680
  const random = () => {
    seed = (seed * 48271) % 2147483647
    return seed / 2147483647
  }

  for (let i = 0; i < count; i += 1) {
    const theta = Math.PI * 0.1 + random() * Math.PI * 1.25
    const radius = 3200 + random() * 1500
    const height = 320 + random() * 620
    const width = 520 + random() * 780
    position.set(Math.cos(theta) * radius, height * 0.28 - 60, Math.sin(theta) * radius)
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI)
    scale.set(width, height, width * (0.6 + random() * 0.5))
    matrix.compose(position, quaternion, scale)
    mesh.setMatrixAt(i, matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)
  return group
}

function createCloudDeck(texture, { y, size, opacity, rotation, tint }) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: tint,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.rotation.z = rotation
  mesh.position.y = y
  mesh.renderOrder = -5
  return mesh
}

export function createEnvironment(scene) {
  const group = new THREE.Group()
  const softDisc = createSoftDiscTexture(128, 0.3)
  const cloudTexture = createCloudDeckTexture(512)

  const sky = createSky()
  const stars = createStars(softDisc)
  const ocean = createOcean()
  const terrain = createTerrain()
  const scrub = createScrub(softDisc)
  const mountains = createMountainRange()

  const cloudDecks = [
    createCloudDeck(cloudTexture, { y: 1250, size: 14000, opacity: 0.34, rotation: 0.3, tint: '#b8c6de' }),
    createCloudDeck(cloudTexture, { y: 2600, size: 16000, opacity: 0.24, rotation: 1.1, tint: '#9fb2cf' }),
    createCloudDeck(cloudTexture, { y: 4300, size: 18000, opacity: 0.16, rotation: 2.2, tint: '#8ea6c6' }),
  ]

  const sunGlowMaterial = new THREE.SpriteMaterial({
    map: softDisc,
    color: '#ffbe86',
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
  const sunGlow = new THREE.Sprite(sunGlowMaterial)
  sunGlow.scale.set(2600, 2600, 1)
  sunGlow.position.set(-4200, 180, -6200)
  sunGlow.renderOrder = -7

  // The dome, star field, and sun glow form one backdrop rig that is recentred
  // on the camera every frame. Without it the camera climbs out through the
  // 9000-unit dome during ascent and the sky silently disappears.
  const backdrop = new THREE.Group()
  backdrop.add(sky, stars, sunGlow)

  group.add(backdrop, ocean, terrain, scrub, mountains)
  cloudDecks.forEach((deck) => group.add(deck))
  scene.add(group)

  const hemisphere = new THREE.HemisphereLight('#3f6ba8', '#10151f', 0.75)
  scene.add(hemisphere)

  const keyLight = new THREE.DirectionalLight('#ffc99a', 1.35)
  keyLight.position.set(-180, 90, -260)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(1024, 1024)
  keyLight.shadow.camera.near = 20
  keyLight.shadow.camera.far = 900
  keyLight.shadow.camera.left = -180
  keyLight.shadow.camera.right = 180
  keyLight.shadow.camera.top = 220
  keyLight.shadow.camera.bottom = -60
  keyLight.shadow.bias = -0.0012
  scene.add(keyLight)
  scene.add(keyLight.target)

  const fillLight = new THREE.DirectionalLight('#5f8fc4', 0.5)
  fillLight.position.set(320, 140, 200)
  scene.add(fillLight)

  const skyUniforms = sky.material.uniforms
  const zenith = SUNSET.zenith.clone()
  const horizon = SUNSET.horizon.clone()
  const ground = SUNSET.ground.clone()

  return {
    group,
    keyLight,
    hemisphere,
    cloudDecks,
    /** Blend the sky from dusk toward orbital darkness as the rocket climbs. */
    setAltitude(altitude) {
      const blend = THREE.MathUtils.clamp(altitude / 42000, 0, 1)
      const eased = blend * blend * (3 - 2 * blend)
      skyUniforms.uZenith.value.copy(zenith).lerp(SPACE.zenith, eased)
      skyUniforms.uHorizon.value.copy(horizon).lerp(SPACE.horizon, eased)
      skyUniforms.uGround.value.copy(ground).lerp(SPACE.ground, eased)
      skyUniforms.uHazeStrength.value = THREE.MathUtils.lerp(SUNSET.haze, SPACE.haze, eased)
      skyUniforms.uSunStrength.value = THREE.MathUtils.lerp(SUNSET.sun, SPACE.sun, eased)
      stars.material.opacity = THREE.MathUtils.clamp(eased * 1.25 - 0.06, 0, 0.95)
      sunGlowMaterial.opacity = 0.85 * (1 - eased * 0.9)
      hemisphere.intensity = THREE.MathUtils.lerp(0.75, 0.34, eased)
      keyLight.intensity = THREE.MathUtils.lerp(1.35, 0.5, eased)
    },
    update(dt, elapsed, camera) {
      ocean.material.uniforms.uTime.value = elapsed
      if (camera) backdrop.position.copy(camera.position)
      if (scene.fog) {
        ocean.material.uniforms.uFogColor.value.copy(scene.fog.color)
        ocean.material.uniforms.uFogDensity.value = scene.fog.density
      }
      for (let i = 0; i < cloudDecks.length; i += 1) {
        cloudDecks[i].rotation.z += dt * (0.004 + i * 0.0015)
      }
    },
    dispose() {
      scene.remove(group, hemisphere, keyLight, fillLight, keyLight.target)
      group.traverse((object) => {
        if (object.geometry) object.geometry.dispose()
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => material.dispose())
        }
      })
      softDisc.dispose()
      cloudTexture.dispose()
    },
  }
}
