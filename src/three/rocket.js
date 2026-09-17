import * as THREE from 'three'

export const PAD_DECK_Y = 2.4
export const ROCKET_HEIGHT = 98

const HULL_SEGMENTS = 32

function createHullTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 1024
  const ctx = canvas.getContext('2d')

  const base = ctx.createLinearGradient(0, 0, 256, 0)
  base.addColorStop(0, '#8f97a4')
  base.addColorStop(0.28, '#f2f4f7')
  base.addColorStop(0.6, '#d9dee6')
  base.addColorStop(1, '#7d8592')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 256, 1024)

  ctx.strokeStyle = 'rgba(60, 70, 84, 0.34)'
  ctx.lineWidth = 2
  for (let i = 0; i < 26; i += 1) {
    const y = 18 + i * 39
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(256, y)
    ctx.stroke()
  }

  ctx.fillStyle = 'rgba(38, 46, 58, 0.9)'
  ctx.fillRect(0, 940, 256, 84)
  ctx.fillStyle = 'rgba(198, 90, 36, 0.92)'
  ctx.fillRect(0, 892, 256, 34)

  ctx.fillStyle = 'rgba(60, 70, 84, 0.22)'
  for (let i = 0; i < 10; i += 1) {
    ctx.fillRect(20 + i * 24, 120, 3, 760)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function lathe(points, segments) {
  return new THREE.LatheGeometry(points, segments)
}

function engineBellProfile() {
  const points = []
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10
    points.push(new THREE.Vector2(1.05 + 1.55 * Math.pow(t, 1.7), -t * 5.6))
  }
  return points
}

function noseProfile(radius, height) {
  const points = []
  for (let i = 0; i <= 14; i += 1) {
    const t = i / 14
    points.push(new THREE.Vector2(Math.max(radius * Math.pow(1 - t, 0.62), 0.02), t * height))
  }
  return points
}

function finShape() {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(0, 16.5)
  shape.lineTo(5.6, 12.4)
  shape.lineTo(5.6, 4.6)
  shape.lineTo(2.4, 0)
  shape.closePath()
  return shape
}

function buildLattice(beams, material) {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const mesh = new THREE.InstancedMesh(geometry, material, beams.length)
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const midpoint = new THREE.Vector3()
  const direction = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const forward = new THREE.Vector3(0, 0, 1)

  beams.forEach((beam, index) => {
    midpoint.copy(beam.start).add(beam.end).multiplyScalar(0.5)
    direction.copy(beam.end).sub(beam.start)
    const length = direction.length()
    quaternion.setFromUnitVectors(forward, direction.normalize())
    scale.set(beam.width, beam.depth, length)
    matrix.compose(midpoint, quaternion, scale)
    mesh.setMatrixAt(index, matrix)
  })

  mesh.instanceMatrix.needsUpdate = true
  mesh.castShadow = true
  return mesh
}

function createTower() {
  const group = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: '#5b6470', roughness: 0.72, metalness: 0.45 })
  const darkSteel = new THREE.MeshStandardMaterial({ color: '#3a434f', roughness: 0.7, metalness: 0.5 })

  const height = 104
  const half = 7
  const levels = 13
  const beams = []
  const corners = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ]

  corners.forEach(([x, z]) => {
    beams.push({ start: new THREE.Vector3(x, 0, z), end: new THREE.Vector3(x, height, z), width: 1.5, depth: 1.5 })
  })

  const levelHeight = height / levels
  for (let i = 0; i < levels; i += 1) {
    const y = i * levelHeight
    const nextY = y + levelHeight
    corners.forEach(([x, z], cornerIndex) => {
      const [nx, nz] = corners[(cornerIndex + 1) % corners.length]
      beams.push({
        start: new THREE.Vector3(x, y, z),
        end: new THREE.Vector3(nx, y, nz),
        width: 1.1,
        depth: 1.1,
      })
      const flip = (i + cornerIndex) % 2 === 0
      beams.push({
        start: new THREE.Vector3(x, y, z),
        end: new THREE.Vector3(nx, flip ? nextY : y + levelHeight, nz),
        width: 0.7,
        depth: 0.7,
      })
    })
  }

  group.add(buildLattice(beams, steel))

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(22, 6, 22), darkSteel)
  plinth.position.y = -3
  plinth.castShadow = true
  plinth.receiveShadow = true
  group.add(plinth)

  const crown = new THREE.Mesh(new THREE.BoxGeometry(17, 3, 17), darkSteel)
  crown.position.y = height + 1.5
  crown.castShadow = true
  group.add(crown)

  const beaconMaterial = new THREE.MeshStandardMaterial({
    color: '#40120c',
    emissive: '#ff3b1f',
    emissiveIntensity: 2.2,
  })
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), beaconMaterial)
  beacon.position.set(0, height + 4, 0)
  group.add(beacon)

  return { group, steel, darkSteel, beaconMaterial }
}

function createAccessArm({ y, length, name }) {
  const group = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: '#6a7480', roughness: 0.68, metalness: 0.4 })
  const darkSteel = new THREE.MeshStandardMaterial({ color: '#39424e', roughness: 0.7, metalness: 0.45 })

  const beams = []
  const width = 4.4
  const height = 2.6
  for (let i = 0; i < 6; i += 1) {
    const x0 = (i / 6) * length
    const x1 = ((i + 1) / 6) * length
    beams.push({ start: new THREE.Vector3(x0, height / 2, -width / 2), end: new THREE.Vector3(x1, height / 2, -width / 2), width: 0.6, depth: 0.6 })
    beams.push({ start: new THREE.Vector3(x0, height / 2, width / 2), end: new THREE.Vector3(x1, height / 2, width / 2), width: 0.6, depth: 0.6 })
    beams.push({ start: new THREE.Vector3(x0, -height / 2, -width / 2), end: new THREE.Vector3(x1, -height / 2, -width / 2), width: 0.6, depth: 0.6 })
    beams.push({ start: new THREE.Vector3(x0, -height / 2, width / 2), end: new THREE.Vector3(x1, -height / 2, width / 2), width: 0.6, depth: 0.6 })
    beams.push({ start: new THREE.Vector3(x1, height / 2, -width / 2), end: new THREE.Vector3(x1, -height / 2, width / 2), width: 0.42, depth: 0.42 })
  }

  group.add(buildLattice(beams, steel))

  const room = new THREE.Mesh(new THREE.BoxGeometry(7, 4.6, width + 1.6), darkSteel)
  room.position.set(length * 0.68, height * 0.5, 0)
  room.castShadow = true
  group.add(room)

  const doorMaterial = new THREE.MeshStandardMaterial({ color: '#1c232c', roughness: 0.6, metalness: 0.35 })

  const clamp = new THREE.Mesh(new THREE.BoxGeometry(3.2, 5.4, width + 1.4), doorMaterial)
  clamp.position.set(length - 1.2, 0.4, 0)
  clamp.castShadow = true
  group.add(clamp)

  group.position.set(0, y, 0)
  group.userData.name = name
  return group
}

function createFlameTrench() {
  const group = new THREE.Group()
  const concrete = new THREE.MeshStandardMaterial({ color: '#4a4f57', roughness: 0.94, metalness: 0.05 })
  const scorched = new THREE.MeshStandardMaterial({ color: '#22262c', roughness: 0.95, metalness: 0.08 })
  const steel = new THREE.MeshStandardMaterial({ color: '#4d5764', roughness: 0.7, metalness: 0.45 })

  const deck = new THREE.Mesh(new THREE.CylinderGeometry(30, 33, PAD_DECK_Y, 40), concrete)
  deck.position.y = PAD_DECK_Y / 2
  deck.castShadow = true
  deck.receiveShadow = true
  group.add(deck)

  const opening = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.5, PAD_DECK_Y + 1.2, 28), scorched)
  opening.position.y = PAD_DECK_Y / 2 + 0.4
  group.add(opening)

  const trenchDepth = 26
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(9.6, 11.4, trenchDepth, 28, 1, true), scorched)
  shaft.position.y = -trenchDepth / 2 + 0.6
  shaft.material.side = THREE.BackSide
  group.add(shaft)

  const floor = new THREE.Mesh(new THREE.CircleGeometry(11.4, 28), scorched)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -trenchDepth + 1.2
  group.add(floor)

  const deflector = new THREE.Mesh(new THREE.ConeGeometry(7.6, 12, 4), scorched)
  deflector.position.y = -14
  deflector.rotation.y = Math.PI / 4
  group.add(deflector)

  const truss = []
  const ringRadius = 9.8
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2
    const x = Math.cos(angle) * ringRadius
    const z = Math.sin(angle) * ringRadius
    truss.push({ start: new THREE.Vector3(x, PAD_DECK_Y, z), end: new THREE.Vector3(x * 0.98, PAD_DECK_Y + 3.4, z * 0.98), width: 0.7, depth: 0.7 })
  }
  const trussMesh = buildLattice(truss, steel)
  group.add(trussMesh)

  const mount = new THREE.Mesh(new THREE.CylinderGeometry(8.4, 9.4, 3.2, 28), steel)
  mount.position.y = PAD_DECK_Y + 1.6
  mount.castShadow = true
  mount.receiveShadow = true
  group.add(mount)

  const apron = new THREE.Mesh(new THREE.RingGeometry(30, 108, 44), new THREE.MeshStandardMaterial({ color: '#3c4149', roughness: 0.92, metalness: 0.05 }))
  apron.rotation.x = -Math.PI / 2
  apron.position.y = 0.42
  apron.receiveShadow = true
  group.add(apron)

  const railMaterial = new THREE.MeshStandardMaterial({ color: '#2f3741', roughness: 0.8, metalness: 0.3 })
  const railGeometry = new THREE.TorusGeometry(31.5, 0.5, 6, 44)
  const rail = new THREE.Mesh(railGeometry, railMaterial)
  rail.rotation.x = Math.PI / 2
  rail.position.y = 4.6
  group.add(rail)

  return { group, concrete, scorched, steel, mountTop: PAD_DECK_Y + 3.2 }
}

function createClamps() {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color: '#3d454f', roughness: 0.6, metalness: 0.55 })
  const jawMaterial = new THREE.MeshStandardMaterial({ color: '#8a5a2a', roughness: 0.55, metalness: 0.6 })
  const clamps = []
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
    const pivot = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.4, 3.2), material)
    body.position.set(6.4, 2.2, 0)
    body.castShadow = true
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 3.4), jawMaterial)
    jaw.position.set(4.6, 4.4, 0)
    jaw.castShadow = true
    pivot.add(body, jaw)
    pivot.rotation.y = -angle
    pivot.position.y = PAD_DECK_Y + 3.2
    group.add(pivot)
    clamps.push(pivot)
  }
  return { group, clamps }
}

function createSupportStructures() {
  const group = new THREE.Group()
  const concrete = new THREE.MeshStandardMaterial({ color: '#585d66', roughness: 0.9, metalness: 0.05 })
  const steel = new THREE.MeshStandardMaterial({ color: '#616b78', roughness: 0.7, metalness: 0.4 })
  const shell = new THREE.MeshStandardMaterial({ color: '#c9d0d8', roughness: 0.5, metalness: 0.2 })

  const tankGroup = new THREE.Group()
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(11, 24, 18), shell)
  sphere.position.y = 20
  sphere.castShadow = true
  tankGroup.add(sphere)
  const legs = []
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2
    legs.push({
      start: new THREE.Vector3(Math.cos(angle) * 11, 10, Math.sin(angle) * 11),
      end: new THREE.Vector3(Math.cos(angle) * 9.5, 0, Math.sin(angle) * 9.5),
      width: 1.2,
      depth: 1.2,
    })
  }
  tankGroup.add(buildLattice(legs, steel))
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(16, 17, 2, 24), concrete)
  pad.position.y = -1
  pad.receiveShadow = true
  tankGroup.add(pad)
  tankGroup.position.set(-92, 0, 74)
  group.add(tankGroup)

  const waterTower = new THREE.Group()
  const column = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.6, 46, 16), steel)
  column.position.y = 23
  column.castShadow = true
  waterTower.add(column)
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 12, 20), shell)
  tank.position.y = 52
  tank.castShadow = true
  waterTower.add(tank)
  const cap = new THREE.Mesh(new THREE.ConeGeometry(9, 5, 20), shell)
  cap.position.y = 60.5
  waterTower.add(cap)
  waterTower.position.set(96, 0, 68)
  group.add(waterTower)

  const blockhouse = new THREE.Mesh(new THREE.BoxGeometry(46, 12, 26), concrete)
  blockhouse.position.set(112, 6, -84)
  blockhouse.rotation.y = -0.42
  blockhouse.castShadow = true
  blockhouse.receiveShadow = true
  group.add(blockhouse)

  const mastGroup = new THREE.Group()
  const masts = []
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + 0.6
    const x = Math.cos(angle) * 74
    const z = Math.sin(angle) * 74
    masts.push({ start: new THREE.Vector3(x, 0, z), end: new THREE.Vector3(x, 84, z), width: 1.1, depth: 1.1 })
    masts.push({ start: new THREE.Vector3(x, 24, z), end: new THREE.Vector3(x * 0.92, 24, z * 0.92), width: 0.5, depth: 0.5 })
    masts.push({ start: new THREE.Vector3(x, 52, z), end: new THREE.Vector3(x * 0.92, 52, z * 0.92), width: 0.5, depth: 0.5 })
  }
  mastGroup.add(buildLattice(masts, steel))
  group.add(mastGroup)

  return { group }
}

function createFloodlights() {
  const group = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: '#586170', roughness: 0.75, metalness: 0.35 })
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: '#3a3524',
    emissive: '#ffdca6',
    emissiveIntensity: 1.6,
  })
  const lamps = []
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + Math.PI / 6
    const pole = new THREE.Group()
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 18, 8), steel)
    mast.position.y = 9
    mast.castShadow = true
    pole.add(mast)
    for (let j = 0; j < 3; j += 1) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.2), lampMaterial)
      lamp.position.set((j - 1) * 2.6, 18.4, 0)
      lamp.rotation.x = 0.5
      pole.add(lamp)
    }
    pole.position.set(Math.cos(angle) * 42, 0, Math.sin(angle) * 42)
    pole.rotation.y = -angle + Math.PI / 2
    group.add(pole)
    lamps.push(pole)
  }
  return { group, lampMaterial, lamps }
}

export function createRocket() {
  const root = new THREE.Group()
  const hullTexture = createHullTexture()

  const hullMaterial = new THREE.MeshStandardMaterial({
    map: hullTexture,
    color: '#ffffff',
    roughness: 0.52,
    metalness: 0.18,
  })
  const upperMaterial = new THREE.MeshStandardMaterial({ color: '#e8ebef', roughness: 0.46, metalness: 0.22 })
  const accentMaterial = new THREE.MeshStandardMaterial({ color: '#c2571f', roughness: 0.55, metalness: 0.2 })
  const darkMaterial = new THREE.MeshStandardMaterial({ color: '#2b323b', roughness: 0.62, metalness: 0.4 })
  const engineMaterial = new THREE.MeshStandardMaterial({
    color: '#4b525c',
    roughness: 0.36,
    metalness: 0.85,
    side: THREE.DoubleSide,
  })
  const nozzleMaterial = new THREE.MeshStandardMaterial({
    color: '#2a2f36',
    roughness: 0.5,
    metalness: 0.7,
    side: THREE.DoubleSide,
  })

  const engines = new THREE.Group()
  const bellGeometry = lathe(engineBellProfile(), 20)
  const bellPositions = [
    [0, 0],
    [4.6, 0],
    [-4.6, 0],
    [0, 4.6],
    [0, -4.6],
  ]
  bellPositions.forEach(([x, z]) => {
    const bell = new THREE.Mesh(bellGeometry, engineMaterial)
    bell.position.set(x, -0.4, z)
    bell.castShadow = true
    engines.add(bell)
    const chamber = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 16), nozzleMaterial)
    chamber.position.set(x, 1.4, z)
    engines.add(chamber)
  })

  const core = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 44, HULL_SEGMENTS, 1, true), hullMaterial)
  core.position.y = 22
  core.castShadow = true
  core.receiveShadow = true

  const coreCap = new THREE.Mesh(new THREE.CircleGeometry(4.1, HULL_SEGMENTS), darkMaterial)
  coreCap.rotation.x = Math.PI / 2
  coreCap.position.y = 0.02

  const rings = new THREE.Group()
  ;[0.6, 22.2, 43.4].forEach((y) => {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.19, 4.19, 1.1, HULL_SEGMENTS, 1, true), accentMaterial)
    ring.position.y = y
    rings.add(ring)
  })

  const cableTray = new THREE.Mesh(new THREE.BoxGeometry(1.1, 40, 1.6), darkMaterial)
  cableTray.position.set(4.2, 22, 0)
  cableTray.castShadow = true

  const finGeometry = new THREE.ExtrudeGeometry(finShape(), { depth: 0.55, bevelEnabled: false })
  const fins = new THREE.Group()
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
    const fin = new THREE.Mesh(finGeometry, darkMaterial)
    fin.rotation.y = -angle
    fin.position.set(Math.cos(angle) * 4.05, 0.8, Math.sin(angle) * 4.05)
    fin.castShadow = true
    fins.add(fin)
  }

  const interstage = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 3.6, HULL_SEGMENTS, 1, true), darkMaterial)
  interstage.position.y = 45.8
  interstage.castShadow = true

  const upperStage = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 30, HULL_SEGMENTS, 1, true), upperMaterial)
  upperStage.position.y = 62.6
  upperStage.castShadow = true

  const upperRings = new THREE.Group()
  ;[49.4, 63.5, 76.6].forEach((y) => {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.58, 3.58, 0.9, HULL_SEGMENTS, 1, true), accentMaterial)
    ring.position.y = y
    upperRings.add(ring)
  })

  const adapter = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 1.4, HULL_SEGMENTS, 1, true), darkMaterial)
  adapter.position.y = 78.3

  const nose = new THREE.Mesh(lathe(noseProfile(3.5, 19), HULL_SEGMENTS), upperMaterial)
  nose.position.y = 78.9
  nose.castShadow = true

  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), darkMaterial)
  noseTip.position.y = 97.8

  const beaconMaterial = new THREE.MeshStandardMaterial({
    color: '#3a0f0a',
    emissive: '#ff4a24',
    emissiveIntensity: 2,
  })
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), beaconMaterial)
  beacon.position.set(3.55, 51.4, 0)

  root.add(
    engines,
    core,
    coreCap,
    rings,
    cableTray,
    fins,
    interstage,
    upperStage,
    upperRings,
    adapter,
    nose,
    noseTip,
    beacon,
  )

  root.position.y = PAD_DECK_Y + 3.2

  return {
    root,
    beaconMaterial,
    engineMount: new THREE.Vector3(0, PAD_DECK_Y + 3.2 - 5.8, 0),
    dispose() {
      root.traverse((object) => {
        if (object.geometry) object.geometry.dispose()
      })
      hullTexture.dispose()
      hullMaterial.dispose()
      upperMaterial.dispose()
      accentMaterial.dispose()
      darkMaterial.dispose()
      engineMaterial.dispose()
      nozzleMaterial.dispose()
      beaconMaterial.dispose()
    },
  }
}

export function createLaunchSite(scene) {
  const group = new THREE.Group()
  const rocket = createRocket()
  const towerParts = createTower()
  const trench = createFlameTrench()
  const clamps = createClamps()
  const support = createSupportStructures()
  const floodlights = createFloodlights()

  const tower = towerParts.group
  tower.position.set(-22.5, 0, 0)

  const crewArm = createAccessArm({ y: 62, length: 15.5, name: 'crew' })
  const umbilicalArm = createAccessArm({ y: 34, length: 15.5, name: 'umbilical' })
  tower.add(crewArm, umbilicalArm)

  group.add(
    trench.group,
    rocket.root,
    tower,
    clamps.group,
    support.group,
    floodlights.group,
  )
  scene.add(group)

  const restingY = PAD_DECK_Y + 3.2
  let stow = 0

  return {
    group,
    rocket,
    tower,
    crewArm,
    umbilicalArm,
    setRocketAltitude(altitude) {
      rocket.root.position.y = restingY + Math.max(altitude, 0)
    },
    /** stow 0 -> 1 retracts the service arms and releases the hold-down clamps. */
    setStow(value) {
      stow = THREE.MathUtils.clamp(value, 0, 1)
      const swing = stow * Math.PI * 0.62
      crewArm.rotation.y = swing
      umbilicalArm.rotation.y = swing * 1.08
      clamps.clamps.forEach((clamp, index) => {
        clamp.rotation.z = -(stow * 1.35) * (index % 2 === 0 ? 1 : -1)
        clamp.rotation.y = -((index / 4) * Math.PI * 2 + Math.PI / 4)
      })
    },
    update(dt, elapsed, intensity) {
      const flicker = 0.85 + Math.sin(elapsed * 9.3) * 0.08 + Math.sin(elapsed * 21.7) * 0.06
      floodlights.lampMaterial.emissiveIntensity = 1.35 * flicker * (1 + intensity * 2.4)
      rocket.beaconMaterial.emissiveIntensity = 1.4 + Math.sin(elapsed * 3.4) * 0.9
    },
    dispose() {
      scene.remove(group)
      group.traverse((object) => {
        if (object.geometry) object.geometry.dispose()
      })
      rocket.dispose()
      ;[
        towerParts.steel,
        towerParts.darkSteel,
        towerParts.beaconMaterial,
        trench.concrete,
        trench.scorched,
        trench.steel,
      ]
        .filter(Boolean)
        .forEach((material) => material.dispose())
    },
  }
}