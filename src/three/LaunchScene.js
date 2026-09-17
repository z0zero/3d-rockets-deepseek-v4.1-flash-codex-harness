import * as THREE from 'three'

import { createEnvironment } from './environment.js'

export const PHASES = {
  READY: 'ready',
  COUNTDOWN: 'countdown',
  IGNITION: 'ignition',
  LIFTOFF: 'liftoff',
  ASCENT: 'ascent',
  COMPLETE: 'complete',
}

const PAD_VIEW = {
  position: new THREE.Vector3(168, 68, 236),
  target: new THREE.Vector3(0, 34, 0),
}

export class LaunchScene {
  constructor(host) {
    this.host = host
    this.telemetryHandler = () => {}

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    host.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2('#16233a', 0.00042)

    this.camera = new THREE.PerspectiveCamera(46, 1, 1, 24000)
    this.camera.position.copy(PAD_VIEW.position)

    this.environment = createEnvironment(this.scene)

    this.clock = new THREE.Clock()
    this.cameraTarget = PAD_VIEW.target.clone()
    this.running = false
    this.frameId = 0
    this.telemetryClock = 0

    this.handleResize = this.handleResize.bind(this)
    this.tick = this.tick.bind(this)
    window.addEventListener('resize', this.handleResize)
    this.handleResize()
  }

  setTelemetryHandler(handler) {
    this.telemetryHandler = handler
  }

  start() {
    if (this.running) return
    this.running = true
    this.clock.start()
    this.frameId = requestAnimationFrame(this.tick)
  }

  handleResize() {
    const width = this.host.clientWidth || window.innerWidth
    const height = this.host.clientHeight || window.innerHeight
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  updateCamera(dt, elapsed) {
    const drift = Math.sin(elapsed * 0.09) * 0.5
    const desiredPosition = new THREE.Vector3(
      PAD_VIEW.position.x + drift * 6,
      PAD_VIEW.position.y + Math.sin(elapsed * 0.16) * 2.2,
      PAD_VIEW.position.z,
    )
    const damping = 1 - Math.pow(0.001, dt)
    this.camera.position.lerp(desiredPosition, damping)
    this.cameraTarget.lerp(PAD_VIEW.target, damping)
    this.camera.lookAt(this.cameraTarget)
  }

  tick() {
    this.frameId = requestAnimationFrame(this.tick)
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const elapsed = this.clock.elapsedTime

    this.environment.update(dt, elapsed)
    this.environment.setAltitude(0)
    this.updateCamera(dt, elapsed)
    this.renderer.render(this.scene, this.camera)

    this.telemetryClock += dt
    if (this.telemetryClock > 0.1) {
      this.telemetryClock = 0
    }
  }

  dispose() {
    this.running = false
    cancelAnimationFrame(this.frameId)
    window.removeEventListener('resize', this.handleResize)
    this.environment.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.host) {
      this.host.removeChild(this.renderer.domElement)
    }
  }
}
