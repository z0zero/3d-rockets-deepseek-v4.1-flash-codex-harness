import { useCallback, useEffect, useRef, useState } from 'react'

import { LaunchHud } from './components/LaunchHud.jsx'
import { LaunchScene } from './three/LaunchScene.js'

const INITIAL_TELEMETRY = {
  phase: 'ready',
  countdown: null,
  missionTime: 0,
  altitude: 0,
  velocity: 0,
  throttle: 0,
}

export default function App() {
  const sceneHost = useRef(null)
  const sceneRef = useRef(null)
  const [telemetry, setTelemetry] = useState(INITIAL_TELEMETRY)

  useEffect(() => {
    const host = sceneHost.current
    if (!host) return undefined

    const launchScene = new LaunchScene(host)
    sceneRef.current = launchScene
    launchScene.setTelemetryHandler(setTelemetry)
    launchScene.start()

    return () => {
      sceneRef.current = null
      launchScene.dispose()
    }
  }, [])

  const handleLaunch = useCallback(() => {
    sceneRef.current?.launch()
  }, [])

  const handleReset = useCallback(() => {
    sceneRef.current?.reset()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.repeat) return

      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault()
        sceneRef.current?.launch()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        sceneRef.current?.reset()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="app">
      <div
        className="scene"
        ref={sceneHost}
        role="presentation"
      />
      <div
        className="vignette"
        aria-hidden="true"
      />
      <LaunchHud
        telemetry={telemetry}
        onLaunch={handleLaunch}
        onReset={handleReset}
      />
    </div>
  )
}