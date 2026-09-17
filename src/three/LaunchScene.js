import * as THREE from 'three'

import { createEnvironment } from './environment.js'
import { createLaunchEffects } from './effects.js'
import { createLaunchSite, PAD_DECK_Y, ROCKET_HEIGHT } from './rocket.js'

export const PHASES = {
  READY: 'ready',
  COUNTDOWN: 'countdown',
  IGNITION: 'ignition',
  LIFTOFF: 'liftoff',
  ASCENT: 'ascent',
  COMPLETE: 'complete',
}

export const PAD_VIEW = {
  position: new THREE.Vector3(168, 68, 236),
  target: new THREE.Vector3(0, 34, 0),
}

const COUNTDOWN_DURATION = 6
const THROTTLE_RAMP = 1.25
const CLAMP_RELEASE_DELAY = 1.6
const LIFTOFF_ALTITUDE = 120
const ASCENT_CEILING = 42000
const CAMERA_BLEND_TIME = 2.8
const BASE_FOV = 46
const ZOOM_FOV = 34
const ZOOM_ALTITUDE = 6000
const FOG_BASE_DENSITY = 0.00042
const ROCKET_BASE_Y = PAD_DECK_Y + 3.2
const TELEMETRY_INTERVAL = 0.1

const LIFTOFF_ACCEL = 3.4
const PEAK_ACCEL = 42
const ACCEL_TAU = 13

const clamp01 = (value) => Math.min(Math.max(value, 0), 1)
const smoothstep = (value) => {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

export class LaunchScene {
  constructor(host) {
    this.host = host
    this.telemetryHandler = () => {}
    this.timeScale = 1

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    host.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2('#16233a', FOG_BASE_DENSITY)

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 1, 24000)
    this.camera.position.copy(PAD_VIEW.position)

    this.environment = createEnvironment(this.scene)
    this.site = createLaunchSite(this.scene)
    this.effects = createLaunchEffects(this.scene, this.site)

    this.clock = new THREE.Clock()
    this.cameraTarget = PAD_VIEW.target.clone()
    this.flight = this.createFlightState()
    this.running = false
    this.frameId = 0
    this.telemetryAccumulator = 0

    this.trackingShot = { position: new THREE.Vector3(), target: new THREE.Vector3() }
    this.desiredPosition = new THREE.Vector3()
    this.desiredTarget = new THREE.Vector3()
    this.shakeOffset = new THREE.Vector3()

    this.handleResize = this.handleResize.bind(this)
    this.tick = this.tick.bind(this)
    window.addEventListener('resize', this.handleResize)
    this.handleResize()
    this.publishTelemetry()

    if (typeof window !== 'undefined') {
      window.__launch = {
        getState: () => this.telemetrySnapshot(),
        launch: () => this.launch(),
        reset: () => this.reset(),
        setTimeScale: (value) => this.setTimeScale(value),
      }
    }
  }

  createFlightState() {
    return {
      phase: PHASES.READY,
      phaseTime: 0,
      liftoffElapsed: 0,
      altitude: 0,
      velocity: 0,
      throttle: 0,
      stow: 0,
      cameraBlend: 0,
      ignitionShake: 0,
    }
  }

  setTelemetryHandler(handler) {
    this.telemetryHandler = typeof handler === 'function' ? handler : () => {}
  }

  setTimeScale(value) {
    this.timeScale = Math.min(Math.max(value, 0.05), 20)
  }

  launch() {
    if (this.flight.phase === PHASES.COMPLETE) {
      this.reset()
    }
    if (this.flight.phase !== PHASES.READY) return
    this.flight.phase = PHASES.COUNTDOWN
    this.flight.phaseTime = 0
    this.publishTelemetry()
  }

  reset() {
    this.flight = this.createFlightState()
    this.effects.reset()
    this.effects.setThrottle(0)
    this.site.setStow(0)
    this.site.setRocketAltitude(0)
    this.environment.setAltitude(0)
    this.scene.fog.density = FOG_BASE_DENSITY
    this.camera.position.copy(PAD_VIEW.position)
    this.cameraTarget.copy(PAD_VIEW.target)
    this.camera.fov = BASE_FOV
    this.camera.updateProjectionMatrix()
    this.camera.lookAt(this.cameraTarget)
    this.publishTelemetry()
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

  enterIgnition() {
    const state = this.flight
    state.phase = PHASES.IGNITION
    state.phaseTime = 0
    state.ignitionShake = 1
    this.effects.detonate()
    this.publishTelemetry()
  }

  enterComplete() {
    const state = this.flight
    state.phase = PHASES.COMPLETE
    state.phaseTime = 0
    state.altitude = ASCENT_CEILING
    state.cameraBlend = 1
    this.publishTelemetry()
  }

  updateFlight(dt) {
    const state = this.flight
    state.phaseTime += dt
    state.ignitionShake = Math.max(0, state.ignitionShake - dt * 0.5)

    if (state.phase === PHASES.COUNTDOWN) {
      if (COUNTDOWN_DURATION - state.phaseTime <= 0) {
        this.enterIgnition()
      }
      return
    }

    if (state.phase === PHASES.IGNITION) {
      state.throttle = smoothstep(state.phaseTime / THROTTLE_RAMP)
      state.stow = smoothstep(state.phaseTime / 1.7)
      if (state.phaseTime >= CLAMP_RELEASE_DELAY) {
        state.phase = PHASES.LIFTOFF
        state.phaseTime = 0
        state.liftoffElapsed = 0
        this.publishTelemetry()
      }
      return
    }

    if (state.phase === PHASES.LIFTOFF || state.phase === PHASES.ASCENT || state.phase === PHASES.COMPLETE) {
      state.liftoffElapsed += dt
      const accel = LIFTOFF_ACCEL + PEAK_ACCEL * (1 - Math.exp(-state.liftoffElapsed / ACCEL_TAU))
      state.velocity += accel * dt
      state.altitude += state.velocity * dt
      state.throttle = Math.min(1, state.throttle + dt * 1.6)
      state.stow = Math.min(1, state.stow + dt * 0.9)
    }

    if (state.phase === PHASES.LIFTOFF) {
      state.cameraBlend = smoothstep(state.phaseTime / CAMERA_BLEND_TIME)
      if (state.altitude >= LIFTOFF_ALTITUDE) {
        state.phase = PHASES.ASCENT
        state.phaseTime = 0
        this.publishTelemetry()
      }
      return
    }

    if (state.phase === PHASES.ASCENT) {
      state.cameraBlend = 1
      if (state.altitude >= ASCENT_CEILING) {
        this.enterComplete()
      }
      return
    }

    if (state.phase === PHASES.COMPLETE) {
      state.throttle = Math.max(0.55, state.throttle - dt * 0.1)
      state.cameraBlend = 1
    }
  }

  computePadShot(elapsed, out) {
    out.position.set(
      PAD_VIEW.position.x + Math.sin(elapsed * 0.09) * 3,
      PAD_VIEW.position.y + Math.sin(elapsed * 0.16) * 2.2,
      PAD_VIEW.position.z + Math.cos(elapsed * 0.07) * 2.4,
    )
    out.target.set(0, PAD_VIEW.target.y + Math.sin(elapsed * 0.13) * 1.2, 0)
  }

  computeTrackingShot(altitude, elapsed, out) {
    const progress = smoothstep(altitude / ASCENT_CEILING)
    const centerY = ROCKET_BASE_Y + altitude + ROCKET_HEIGHT * 0.5
    const distance = 150 + altitude * 0.148
    const elevation = THREE.MathUtils.lerp(0.2, 0.66, progress)
    const azimuth = 0.62 + progress * 0.34 + Math.sin(elapsed * 0.05) * 0.05
    const horizontal = distance * Math.cos(elevation)

    out.position.set(
      Math.cos(azimuth) * horizontal,
      centerY - distance * Math.sin(elevation) + Math.sin(elapsed * 0.14) * Math.min(1.6, altitude * 0.004),
      Math.sin(azimuth) * horizontal,
    )
    out.target.set(0, centerY + progress * 30, 0)
  }

  updateCamera(dt, elapsed) {
    const state = this.flight
    this.computePadShot(elapsed, this.trackingShot)
    this.desiredPosition.copy(this.trackingShot.position)
    this.desiredTarget.copy(this.trackingShot.target)

    if (state.cameraBlend > 0) {
      this.computeTrackingShot(state.altitude, elapsed, this.trackingShot)
      this.desiredPosition.lerp(this.trackingShot.position, state.cameraBlend)
      this.desiredTarget.lerp(this.trackingShot.target, state.cameraBlend)
    }

    const liftoffShake = state.liftoffElapsed > 0 ? Math.max(0, 1 - state.liftoffElapsed / 7) : 0
    const shakeAmount = (0.12 + liftoffShake * 0.85 + state.ignitionShake * 0.7) * state.throttle
    const shakeScale = 0.6 + state.altitude * 0.0012
    this.shakeOffset
      .set(
        Math.sin(elapsed * 41.3) * 0.7 + Math.sin(elapsed * 17.7) * 0.4,
        Math.sin(elapsed * 33.1) * 0.55 + Math.sin(elapsed * 23.9) * 0.35,
        Math.sin(elapsed * 27.4) * 0.5,
      )
      .multiplyScalar(shakeAmount * shakeScale)

    this.camera.position.copy(this.desiredPosition).add(this.shakeOffset)
    this.cameraTarget.copy(this.desiredTarget)

    const zoom = smoothstep(state.altitude / ZOOM_ALTITUDE)
    const fov = THREE.MathUtils.lerp(BASE_FOV, ZOOM_FOV, zoom)
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }

    this.camera.lookAt(this.cameraTarget)
  }

  telemetrySnapshot() {
    const state = this.flight
    let countdown = null
    if (state.phase === PHASES.READY) countdown = COUNTDOWN_DURATION
    else if (state.phase === PHASES.COUNTDOWN) countdown = Math.max(0, COUNTDOWN_DURATION - state.phaseTime)

    return {
      phase: state.phase,
      countdown,
      missionTime: state.liftoffElapsed,
      altitude: state.altitude,
      velocity: state.velocity,
      throttle: state.throttle,
    }
  }

  publishTelemetry() {
    this.telemetryHandler(this.telemetrySnapshot())
  }

  tick() {
    if (!this.running) return
    this.frameId = requestAnimationFrame(this.tick)
    const rawDt = Math.min(this.clock.getDelta(), 0.05)
    const elapsed = this.clock.elapsedTime
    const dt = rawDt * this.timeScale

    this.updateFlight(dt)

    const state = this.flight
    this.site.setRocketAltitude(state.altitude)
    this.site.setStow(state.stow)
    this.site.update(dt, elapsed, state.throttle)
    this.effects.setThrottle(state.throttle)
    this.effects.update(dt, elapsed, {
      altitude: state.altitude,
      velocity: state.velocity,
      rocketY: ROCKET_BASE_Y + state.altitude,
    })

    this.environment.setAltitude(state.altitude)
    this.scene.fog.density = FOG_BASE_DENSITY * (1 - 0.88 * clamp01(state.altitude / 32000))

    this.updateCamera(dt, elapsed)
    // Runs after the camera so the backdrop rig recentres on the final
    // (post-shake) camera position before this frame is drawn.
    this.environment.update(dt, elapsed, this.camera)
    this.renderer.render(this.scene, this.camera)

    this.telemetryAccumulator += rawDt
    if (this.telemetryAccumulator >= TELEMETRY_INTERVAL) {
      this.telemetryAccumulator = 0
      this.publishTelemetry()
    }
  }

  dispose() {
    this.running = false
    this.telemetryHandler = () => {}
    cancelAnimationFrame(this.frameId)
    window.removeEventListener('resize', this.handleResize)
    if (typeof window !== 'undefined' && window.__launch && window.__launch.getState) {
      const state = window.__launch.getState()
      if (state && state.phase === this.flight.phase) window.__launch = null
    }
    this.effects.dispose()
    this.site.dispose()
    this.environment.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.host) {
      this.host.removeChild(this.renderer.domElement)
    }
  }
}