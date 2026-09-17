import { useEffect, useRef } from 'react'

export default function App() {
  const sceneHost = useRef(null)

  useEffect(() => {
    const host = sceneHost.current
    if (!host) return undefined

    // The renderer attaches here in the next milestone; for now the shell
    // simply owns and releases the canvas host element.
    return () => {
      host.replaceChildren()
    }
  }, [])

  return (
    <div className="app">
      <div
        className="scene"
        ref={sceneHost}
        role="img"
        aria-label="Stylized rocket launch site rendered in 3D"
      />
      <div className="vignette" aria-hidden="true" />
      <p className="boot-message">Preparing launch site…</p>
    </div>
  )
}
