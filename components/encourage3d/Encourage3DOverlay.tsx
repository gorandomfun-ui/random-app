'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { X } from 'lucide-react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import type {
  Encourage3DAnimation,
  Encourage3DEvent,
  Encourage3DFinish,
} from '@/lib/encourage3d/catalog'

type Props = {
  event: Encourage3DEvent
  menuTargetRef: RefObject<HTMLButtonElement | null>
  onAward: (points: number) => void
  onComplete: () => void
}

type LoadedModel = {
  root: THREE.Group
  baseScale: number
  offsetY: number
}

type ModelCacheEntry = {
  scene: THREE.Group
}

const modelCache = new Map<string, Promise<ModelCacheEntry>>()

const companionPositions = [
  new THREE.Vector3(-1.62, 0.92, 0.2),
  new THREE.Vector3(1.62, 0.76, 0.1),
  new THREE.Vector3(-1.42, -1.05, 0.35),
  new THREE.Vector3(1.34, -1.08, 0.25),
]

function easeOutBack(value: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2)
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3)
}

function loadModel(src: string): Promise<ModelCacheEntry> {
  const cached = modelCache.get(src)
  if (cached) return cached

  const pending = new Promise<ModelCacheEntry>((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    loader.load(
      src,
      (gltf) => resolve({ scene: gltf.scene }),
      undefined,
      reject,
    )
  })

  modelCache.set(src, pending)
  void pending.catch(() => modelCache.delete(src))
  return pending
}

function makeMaterial(source: THREE.Material, finish: Encourage3DFinish, companion: boolean): THREE.Material {
  const original = source as THREE.MeshStandardMaterial
  const common = {
    normalMap: original.normalMap ?? null,
    side: THREE.DoubleSide,
    envMapIntensity: companion ? 1.9 : 2.3,
  }

  if (finish === 'gold' || finish === 'silver') {
    return new THREE.MeshPhysicalMaterial({
      ...common,
      color: finish === 'gold' ? new THREE.Color('#ffc52e') : new THREE.Color('#d9e3ef'),
      metalness: 0.92,
      roughness: finish === 'gold' ? 0.16 : 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    })
  }

  return new THREE.MeshPhysicalMaterial({
    ...common,
    color: new THREE.Color('#ffffff'),
    map: original.map ?? null,
    roughnessMap: original.roughnessMap ?? null,
    metalnessMap: original.metalnessMap ?? null,
    metalness: 0.04,
    roughness: 0.13,
    transmission: companion ? 0.12 : 0.18,
    thickness: companion ? 0.18 : 0.32,
    ior: 1.44,
    clearcoat: 1,
    clearcoatRoughness: 0.035,
    transparent: true,
    opacity: 0.98,
  })
}

function cloneAndPrepare(
  source: THREE.Group,
  finish: Encourage3DFinish,
  targetSize: number,
  companion = false,
): LoadedModel {
  const root = source.clone(true)
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry = child.geometry
    const sourceMaterial = Array.isArray(child.material) ? child.material[0] : child.material
    child.material = makeMaterial(sourceMaterial, companion ? 'color' : finish, companion)
    child.castShadow = false
    child.receiveShadow = false
  })

  const bounds = new THREE.Box3().setFromObject(root)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const maxDimension = Math.max(size.x, size.y, size.z, 0.001)
  const baseScale = targetSize / maxDimension
  root.position.sub(center)
  root.scale.setScalar(baseScale)

  return {
    root,
    baseScale,
    offsetY: size.y * baseScale * 0.03,
  }
}

function initialMainTransform(animation: Encourage3DAnimation, root: THREE.Group) {
  if (animation === 'rise') {
    root.position.set(0, -2.7, 0)
    root.rotation.set(0.16, -0.22, -0.16)
  } else if (animation === 'swing') {
    root.position.set(-2.8, 0.2, 0)
    root.rotation.set(0.12, -0.5, -0.55)
  } else if (animation === 'orbit') {
    root.position.set(2.1, 1.2, 0)
    root.rotation.set(-0.15, 1.1, 0.28)
  } else if (animation === 'impact') {
    root.position.set(0, 2.5, 0)
    root.rotation.set(0.35, 0.25, 0.18)
  } else {
    root.position.set(0, 0, 0)
    root.rotation.set(0.18, -0.8, -0.08)
  }
}

export default function Encourage3DOverlay({ event, menuTargetRef, onAward, onComplete }: Props) {
  const canvasHostRef = useRef<HTMLDivElement | null>(null)
  const closeStartedRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [closing, setClosing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [flightTarget, setFlightTarget] = useState({ x: 0, y: 0 })

  const finishLabel = event.finish === 'gold' ? 'GOLD' : event.finish === 'silver' ? 'SILVER' : null
  const rewardStyle = useMemo(() => ({
    '--encourage-flight-x': `${flightTarget.x}px`,
    '--encourage-flight-y': `${flightTarget.y}px`,
  }) as CSSProperties, [flightTarget.x, flightTarget.y])

  const close = useCallback(() => {
    if (closeStartedRef.current) return
    closeStartedRef.current = true
    const target = menuTargetRef.current?.getBoundingClientRect()
    const targetX = target ? target.left + target.width / 2 - window.innerWidth / 2 : -window.innerWidth * 0.42
    const targetY = target ? target.top + target.height / 2 - window.innerHeight / 2 : -window.innerHeight * 0.42
    setFlightTarget({ x: targetX, y: targetY })
    setClosing(true)
    window.setTimeout(() => onAward(event.points), 470)
    window.setTimeout(onComplete, 720)
  }, [event.points, menuTargetRef, onAward, onComplete])

  useEffect(() => {
    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  useEffect(() => {
    const host = canvasHostRef.current
    if (!host) return

    let disposed = false
    let frame = 0
    let renderer: THREE.WebGLRenderer | null = null
    let environment: THREE.Texture | null = null
    const disposables: THREE.Material[] = []

    const start = async () => {
      try {
        const companionSelections = Array.from({ length: event.companionCount }, (_, index) => (
          event.companions[index % event.companions.length]
        ))
        const [mainEntry, ...companionEntries] = await Promise.all([
          loadModel(event.main.src),
          ...companionSelections.map((entry) => loadModel(entry.src)),
        ])
        if (disposed) return

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
        camera.position.set(0, 0, 7.2)

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
        renderer.setClearColor(0x000000, 0)
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.22
        const isTouch = window.matchMedia('(pointer: coarse)').matches
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.15 : 1.5))
        host.appendChild(renderer.domElement)

        const pmrem = new THREE.PMREMGenerator(renderer)
        environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
        scene.environment = environment
        pmrem.dispose()

        const keyLight = new THREE.DirectionalLight(0xffffff, 3.4)
        keyLight.position.set(-3.8, 5.2, 6)
        scene.add(keyLight)
        const colorLight = new THREE.PointLight(0xff2bad, 18, 12)
        colorLight.position.set(3, 1.4, 4)
        scene.add(colorLight)
        const cyanLight = new THREE.PointLight(0x16dfff, 13, 10)
        cyanLight.position.set(-3.2, -1.8, 3.2)
        scene.add(cyanLight)

        const stage = new THREE.Group()
        scene.add(stage)
        const main = cloneAndPrepare(mainEntry.scene, event.finish, 3.4)
        initialMainTransform(event.animation, main.root)
        main.root.scale.multiplyScalar(0.02)
        stage.add(main.root)

        const companions = companionEntries.map((entry, index) => {
          const prepared = cloneAndPrepare(entry.scene, 'color', index % 2 === 0 ? 0.74 : 0.58, true)
          const target = companionPositions[index % companionPositions.length]
          prepared.root.position.copy(target).multiplyScalar(1.9)
          const startPosition = prepared.root.position.clone()
          prepared.root.scale.multiplyScalar(0.02)
          prepared.root.rotation.set(0.2, -0.4 + index * 0.34, index % 2 === 0 ? -0.3 : 0.28)
          stage.add(prepared.root)
          return { ...prepared, startPosition, target: target.clone(), index }
        })

        stage.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return
          const materials = Array.isArray(child.material) ? child.material : [child.material]
          disposables.push(...materials)
        })

        const resize = () => {
          if (!renderer) return
          const rect = host.getBoundingClientRect()
          const width = Math.max(1, Math.round(rect.width))
          const height = Math.max(1, Math.round(rect.height))
          renderer.setSize(width, height, false)
          camera.aspect = width / height
          camera.updateProjectionMatrix()
        }
        resize()
        const observer = new ResizeObserver(resize)
        observer.observe(host)

        const startedAt = performance.now()
        const render = (now: number) => {
          if (disposed || !renderer) return
          const elapsed = (now - startedAt) / 1000
          const mainProgress = Math.min(1, elapsed / 0.82)
          const mainEase = easeOutBack(mainProgress)
          let mainBaseY = 0

          if (event.animation === 'rise') {
            mainBaseY = THREE.MathUtils.lerp(-2.7, main.offsetY, easeOutCubic(mainProgress))
          } else if (event.animation === 'swing') {
            main.root.position.x = THREE.MathUtils.lerp(-2.8, 0, easeOutCubic(mainProgress))
            mainBaseY = 0.2
            main.root.rotation.z = THREE.MathUtils.lerp(-0.55, -0.08, mainProgress)
          } else if (event.animation === 'orbit') {
            const orbitProgress = easeOutCubic(mainProgress)
            main.root.position.x = Math.cos(orbitProgress * Math.PI * 1.5) * (1 - orbitProgress) * 2.2
            mainBaseY = Math.sin(orbitProgress * Math.PI * 1.5) * (1 - orbitProgress) * 1.35
            main.root.rotation.y = 1.1 - orbitProgress * 1.25
          } else if (event.animation === 'impact') {
            mainBaseY = THREE.MathUtils.lerp(2.5, main.offsetY, easeOutCubic(mainProgress))
            main.root.rotation.z = THREE.MathUtils.lerp(0.18, -0.06, mainProgress)
          }

          const mainScale = Math.max(0.02, mainEase)
          main.root.scale.setScalar(main.baseScale * mainScale)
          main.root.position.y = mainBaseY + Math.sin(elapsed * 1.8) * 0.025
          main.root.rotation.y += 0.0026

          companions.forEach((companion) => {
            const delayed = Math.max(0, Math.min(1, (elapsed - 0.2 - companion.index * 0.08) / 0.62))
            const eased = easeOutBack(delayed)
            companion.root.position.lerpVectors(companion.startPosition, companion.target, easeOutCubic(delayed))
            companion.root.scale.setScalar(companion.baseScale * Math.max(0.02, eased))
            companion.root.position.y += Math.sin(elapsed * 2.5 + companion.index) * 0.035
            companion.root.rotation.z += companion.index % 2 === 0 ? 0.004 : -0.003
            companion.root.rotation.y += 0.005
          })

          stage.rotation.z = Math.sin(elapsed * 0.72) * 0.018
          renderer.render(scene, camera)
          frame = window.requestAnimationFrame(render)
        }

        setReady(true)
        frame = window.requestAnimationFrame(render)

        return () => observer.disconnect()
      } catch (error) {
        console.error('[Encourage3D] Unable to render the preview.', error)
        if (!disposed) setFailed(true)
        return undefined
      }
    }

    let disconnect: (() => void) | undefined
    void start().then((cleanup) => {
      disconnect = cleanup
    })

    return () => {
      disposed = true
      disconnect?.()
      window.cancelAnimationFrame(frame)
      disposables.forEach((material) => material.dispose())
      environment?.dispose()
      if (renderer) {
        renderer.dispose()
        renderer.domElement.remove()
      }
    }
  }, [event])

  return (
    <div
      className={`encourage-3d${ready ? ' encourage-3d--ready' : ''}${closing ? ' encourage-3d--closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${event.message}. ${event.points} points.`}
    >
      <div className="encourage-3d__backdrop" aria-hidden="true" />
      <button
        type="button"
        className="encourage-3d__close"
        onClick={close}
        aria-label="Close encouragement"
        disabled={closing}
      >
        <X size={28} strokeWidth={2.2} />
      </button>

      <div className="encourage-3d__stage">
        <div ref={canvasHostRef} className="encourage-3d__canvas" aria-hidden="true" />
        {failed ? <span className="encourage-3d__error">3D preview unavailable</span> : null}
        <div className="encourage-3d__copy">
          {finishLabel ? <span className={`encourage-3d__finish encourage-3d__finish--${event.finish}`}>{finishLabel}</span> : null}
          <p>{event.message}</p>
          <strong>+{event.points} PTS</strong>
        </div>
      </div>

      <div className="encourage-3d__reward-flight" style={rewardStyle} aria-hidden="true">
        <span>+{event.points}</span>
        <i />
        <i />
        <i />
      </div>

      <style jsx>{`
        .encourage-3d {
          position: fixed;
          inset: 0;
          z-index: 180;
          display: grid;
          place-items: center;
          overflow: hidden;
          color: #fffbea;
          opacity: 0;
          animation: encourage-overlay-in 240ms ease-out forwards;
        }
        .encourage-3d__backdrop {
          position: absolute;
          inset: 0;
          background: rgba(3, 3, 7, 0.74);
          backdrop-filter: blur(4px) saturate(1.3);
          -webkit-backdrop-filter: blur(4px) saturate(1.3);
        }
        .encourage-3d__close {
          position: absolute;
          top: max(18px, env(safe-area-inset-top));
          right: max(18px, env(safe-area-inset-right));
          z-index: 4;
          display: inline-flex;
          width: 46px;
          height: 46px;
          align-items: center;
          justify-content: center;
          border: 2px solid rgba(255, 251, 234, 0.82);
          border-radius: 50%;
          color: #fffbea;
          background: rgba(0, 0, 0, 0.34);
          opacity: 0;
          transform: scale(0.76);
          animation: encourage-copy-in 380ms 240ms cubic-bezier(.18,.9,.28,1.18) forwards;
        }
        .encourage-3d__stage {
          position: relative;
          width: min(92vw, 680px);
          height: min(76vh, 720px);
          min-height: 470px;
        }
        .encourage-3d__canvas {
          position: absolute;
          inset: 0 0 104px;
          opacity: 0;
          filter: drop-shadow(0 28px 34px rgba(0,0,0,.32));
          transition: opacity 160ms ease-out;
        }
        .encourage-3d--ready .encourage-3d__canvas {
          opacity: 1;
        }
        .encourage-3d__canvas :global(canvas) {
          display: block;
          width: 100%;
          height: 100%;
        }
        .encourage-3d__copy {
          position: absolute;
          left: 10px;
          right: 10px;
          bottom: 18px;
          z-index: 2;
          display: flex;
          min-height: 96px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 7px;
          text-align: center;
          opacity: 0;
          transform: translate3d(0, 14px, 0);
          animation: encourage-copy-in 420ms 520ms cubic-bezier(.18,.9,.28,1.08) forwards;
        }
        .encourage-3d__copy p {
          max-width: 560px;
          font-family: var(--font-tomorrow), sans-serif;
          font-size: clamp(19px, 4.7vw, 30px);
          font-weight: 700;
          line-height: 1.08;
          text-transform: uppercase;
        }
        .encourage-3d__copy strong {
          color: #fff36b;
          font-family: var(--font-tomorrow), sans-serif;
          font-size: clamp(15px, 3.4vw, 21px);
          letter-spacing: 0;
        }
        .encourage-3d__finish {
          padding: 5px 9px;
          border: 1px solid currentColor;
          font-family: var(--font-tomorrow), sans-serif;
          font-size: 11px;
          font-weight: 700;
        }
        .encourage-3d__finish--gold { color: #ffd34f; }
        .encourage-3d__finish--silver { color: #dcecff; }
        .encourage-3d__error {
          position: absolute;
          inset: 0 0 104px;
          display: grid;
          place-items: center;
          font-family: var(--font-inter-tight), sans-serif;
          opacity: .72;
        }
        .encourage-3d__reward-flight {
          position: fixed;
          top: 50%;
          left: 50%;
          z-index: 8;
          display: grid;
          width: 86px;
          height: 86px;
          place-items: center;
          border: 2px solid rgba(255, 251, 234, 0.9);
          border-radius: 50%;
          background: linear-gradient(135deg, #ff2bad, #ff8a00 52%, #00dfff);
          box-shadow: 0 0 36px rgba(255,43,173,.6);
          font-family: var(--font-tomorrow), sans-serif;
          font-size: 21px;
          font-weight: 700;
          opacity: 0;
          transform: translate(-50%, -50%) scale(.5);
          pointer-events: none;
        }
        .encourage-3d__reward-flight i {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #fffbea;
          box-shadow: 0 0 12px currentColor;
        }
        .encourage-3d__reward-flight i:nth-of-type(1) { top: -17px; left: 12px; color: #ff2bad; }
        .encourage-3d__reward-flight i:nth-of-type(2) { right: -18px; top: 18px; color: #00dfff; }
        .encourage-3d__reward-flight i:nth-of-type(3) { bottom: -14px; left: 23px; color: #ffd34f; }
        .encourage-3d--closing .encourage-3d__stage,
        .encourage-3d--closing .encourage-3d__close {
          animation: encourage-stage-out 260ms ease-in forwards;
        }
        .encourage-3d--closing .encourage-3d__backdrop {
          animation: encourage-backdrop-out 620ms ease-in forwards;
        }
        .encourage-3d--closing .encourage-3d__reward-flight {
          animation: encourage-reward-flight 680ms cubic-bezier(.3,.72,.23,1) forwards;
        }
        @keyframes encourage-overlay-in {
          to { opacity: 1; }
        }
        @keyframes encourage-copy-in {
          to { opacity: 1; transform: translate3d(0,0,0) scale(1); }
        }
        @keyframes encourage-stage-out {
          to { opacity: 0; transform: scale(.88); }
        }
        @keyframes encourage-backdrop-out {
          to { opacity: 0; }
        }
        @keyframes encourage-reward-flight {
          0% { opacity: 0; transform: translate(-50%,-50%) scale(.45); }
          14% { opacity: 1; transform: translate(-50%,-50%) scale(1.12); }
          32% { opacity: 1; transform: translate(-50%,-50%) scale(.94); }
          100% {
            opacity: 0;
            transform: translate(calc(-50% + var(--encourage-flight-x)), calc(-50% + var(--encourage-flight-y))) scale(.18) rotate(-18deg);
          }
        }
        @media (max-width: 640px) {
          .encourage-3d__stage {
            width: 100vw;
            height: min(78vh, 680px);
            min-height: 460px;
          }
          .encourage-3d__canvas { inset: 20px 0 108px; }
          .encourage-3d__copy { left: 22px; right: 22px; bottom: 14px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .encourage-3d,
          .encourage-3d__close,
          .encourage-3d__copy,
          .encourage-3d--closing .encourage-3d__stage,
          .encourage-3d--closing .encourage-3d__backdrop,
          .encourage-3d--closing .encourage-3d__reward-flight {
            animation-duration: 1ms !important;
            animation-delay: 0ms !important;
          }
        }
      `}</style>
    </div>
  )
}
