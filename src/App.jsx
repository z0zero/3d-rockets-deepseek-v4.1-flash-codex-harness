import { useEffect, useRef } from 'react'

import { LaunchScene } from './three/LaunchScene.js'

export default function App() {
  const sceneHost = useRef(null)

  useEffect(() => {
    const host = sceneHost.current
    if (!host) return undefined

    const launchScene = new LaunchScene(host)
    launchScene.start()

    return () => {
      launchScene.dispose()
    }
  }, [])

  return (
    <div className="app">
      <div
        className="scene"
        ref={sceneHost}
        role="presentation"
      />
      <div className="vignette" aria-hidden="true" />
    </div>
  )
}
