const PHASE_LABELS = {
  ready: 'Ready',
  countdown: 'Countdown',
  ignition: 'Ignition',
  liftoff: 'Lift-off',
  ascent: 'Ascent',
  complete: 'Above range',
}

const COUNTDOWN_PHASES = new Set(['ready', 'countdown'])

function formatClock(telemetry) {
  const counting = COUNTDOWN_PHASES.has(telemetry.phase)
  const raw = counting ? telemetry.countdown : telemetry.missionTime
  const seconds = Math.max(0, typeof raw === 'number' ? raw : 0)
  const whole = Math.floor(seconds)
  const tenths = Math.floor((seconds - whole) * 10)
  const minutes = String(Math.floor(whole / 60)).padStart(2, '0')
  const remainder = String(whole % 60).padStart(2, '0')
  return `T${counting ? '-' : '+'}${minutes}:${remainder}.${tenths}`
}

function formatAltitude(meters) {
  if (meters >= 100000) return `${(meters / 1000).toFixed(0)} km`
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`
  return `${Math.round(meters)} m`
}

function formatVelocity(metersPerSecond) {
  if (metersPerSecond >= 1000) return `${(metersPerSecond / 1000).toFixed(2)} km/s`
  return `${Math.round(metersPerSecond)} m/s`
}

export function LaunchHud({ telemetry, onLaunch, onReset }) {
  const atPad = telemetry.phase === 'ready'
  const throttle = Math.min(Math.max(telemetry.throttle, 0), 1)

  return (
    <div className="hud">
      <section className="hud-panel hud-telemetry" aria-label="Vehicle telemetry">
        <p className="hud-phase">
          <span className={`hud-dot hud-dot--${telemetry.phase}`} aria-hidden="true" />
          {PHASE_LABELS[telemetry.phase] ?? telemetry.phase}
        </p>
        <p className="hud-clock">{formatClock(telemetry)}</p>
        <dl className="hud-rows">
          <div className="hud-row">
            <dt>Altitude</dt>
            <dd>{formatAltitude(telemetry.altitude)}</dd>
          </div>
          <div className="hud-row">
            <dt>Velocity</dt>
            <dd>{formatVelocity(telemetry.velocity)}</dd>
          </div>
          <div className="hud-row">
            <dt>Throttle</dt>
            <dd>{Math.round(throttle * 100)}%</dd>
          </div>
        </dl>
        <div className="hud-throttle" aria-hidden="true">
          <span style={{ transform: `scaleX(${throttle})` }} />
        </div>
      </section>

      <section className="hud-panel hud-control" aria-label="Launch control">
        <button
          type="button"
          className="hud-button"
          onClick={atPad ? onLaunch : onReset}
        >
          {atPad ? 'Launch' : 'Reset'}
        </button>
        <p className="hud-hint">
          <kbd>Space</kbd> launch
          <span className="hud-separator" aria-hidden="true">
            /
          </span>
          <kbd>Esc</kbd> reset
        </p>
      </section>
    </div>
  )
}

export default LaunchHud