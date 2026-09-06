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
}

type ModelCacheEntry = {
  scene: THREE.Group
}

const modelCache = new Map<string, Promise<ModelCacheEntry>>()

const companionPositions = [
  new THREE.Vector3(-1.18, 0.76, 0.3),
  new THREE.Vector3(1.18, 0.68, 0.22),
  new THREE.Vector3(-1.04, -0.86, 0.38),
  new THREE.Vector3(1.02, -0.88, 0.32),
]

function easeOutBack(value: number, overshoot = 1.70158): number {
  const c1 = overshoot
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2)
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
    envMapIntensity: companion ? 2.25 : 2.65,
  }

  if (finish === 'gold' || finish === 'silver') {
    return new THREE.MeshPhysicalMaterial({
      ...common,
      color: finish === 'gold' ? new THREE.Color('#ffc229') : new THREE.Color('#dce8f5'),
      metalness: 0.86,
      roughness: finish === 'gold' ? 0.12 : 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.025,
    })
  }

  return new THREE.MeshPhysicalMaterial({
    ...common,
    color: new THREE.Color('#ffffff'),
    map: original.map ?? null,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: original.map ?? null,
    emissiveIntensity: companion ? 0.12 : 0.16,
    roughnessMap: original.roughnessMap ?? null,
    metalnessMap: original.metalnessMap ?? null,
    metalness: 0.02,
    roughness: companion ? 0.09 : 0.075,
    transmission: companion ? 0.035 : 0.065,
    thickness: companion ? 0.12 : 0.2,
    ior: 1.46,
    clearcoat: 1,
    clearcoatRoughness: 0.018,
    specularIntensity: 1,
    specularColor: new THREE.Color('#ffffff'),
    transparent: true,
    opacity: companion ? 0.95 : 0.94,
  })
}

function cloneAndPrepare(
  source: THREE.Group,
  finish: Encourage3DFinish,
  targetSize: number,
  companion = false,
): LoadedModel {
  const content = source.clone(true)
  content.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry = child.geometry
    const sourceMaterial = Array.isArray(child.material) ? child.material[0] : child.material
    child.material = makeMaterial(sourceMaterial, companion ? 'color' : finish, companion)
    child.castShadow = false
    child.receiveShadow = false
  })

  const bounds = new THREE.Box3().setFromObject(content)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const maxDimension = Math.max(size.x, size.y, size.z, 0.001)
  const planarMax = Math.max(size.x, size.y, 0.001)
  const planarAspect = Math.min(size.x, size.y) / planarMax
  const occupancyScale = companion
    ? 1
    : Math.min(1, Math.max(0.78, Math.sqrt(0.48 / Math.max(0.001, planarAspect))))
  const baseScale = (targetSize * occupancyScale) / maxDimension
  content.position.sub(center)

  const normalized = new THREE.Group()
  normalized.scale.setScalar(baseScale)
  normalized.add(content)

  const root = new THREE.Group()
  root.add(normalized)
  return { root }
}

function initialMainTransform(animation: Encourage3DAnimation, root: THREE.Group) {
  if (animation === 'rise') {
    root.rotation.set(0.11, -0.3, -0.1)
  } else if (animation === 'swing') {
    root.rotation.set(0.1, -0.52, -0.22)
  } else if (animation === 'orbit') {
    root.rotation.set(-0.1, 0.72, 0.16)
  } else if (animation === 'impact') {
    root.rotation.set(0.18, 0.18, 0.08)
  } else {
    root.rotation.set(0.12, -0.68, -0.06)
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
        const [mainEntry, companionEntries] = await Promise.all([
          event.main ? loadModel(event.main.src) : Promise.resolve(null),
          Promise.all(companionSelections.map((entry) => loadModel(entry.src))),
        ])
        if (disposed) return

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
        camera.position.set(0, 0, 7.2)

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
        renderer.setClearColor(0x000000, 0)
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.NeutralToneMapping
        renderer.toneMappingExposure = 1.08
        const isTouch = window.matchMedia('(pointer: coarse)').matches
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.15 : 1.5))
        host.appendChild(renderer.domElement)

        const pmrem = new THREE.PMREMGenerator(renderer)
        environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
        scene.environment = environment
        pmrem.dispose()

        const keyLight = new THREE.DirectionalLight(0xffffff, 3.8)
        keyLight.position.set(-3.8, 5.2, 6)
        scene.add(keyLight)
        const colorLight = new THREE.PointLight(0xff149e, 21, 12)
        colorLight.position.set(3, 1.4, 4)
        scene.add(colorLight)
        const cyanLight = new THREE.PointLight(0x00cfff, 16, 10)
        cyanLight.position.set(-3.2, -1.8, 3.2)
        scene.add(cyanLight)

        const stage = new THREE.Group()
        scene.add(stage)
        const main = mainEntry ? cloneAndPrepare(mainEntry.scene, event.finish, 2.38) : null
        if (main) {
          initialMainTransform(event.animation, main.root)
          main.root.scale.setScalar(0.025)
          stage.add(main.root)
        }

        const companions = companionEntries.map((entry, index) => {
          const targetSize = main ? (index % 2 === 0 ? 0.62 : 0.5) : (index % 2 === 0 ? 0.82 : 0.68)
          const prepared = cloneAndPrepare(entry.scene, 'color', targetSize, true)
          const spread = main ? 1 : 0.92
          const target = companionPositions[index % companionPositions.length].clone().multiplyScalar(spread)
          const startPosition = target.clone().multiplyScalar(0.08)
          startPosition.z = -1.2 - index * 0.08
          prepared.root.position.copy(startPosition)
          prepared.root.scale.setScalar(0.025)
          prepared.root.rotation.set(0.2, -0.4 + index * 0.34, index % 2 === 0 ? -0.3 : 0.28)
          stage.add(prepared.root)
          return {
            ...prepared,
            baseRotation: prepared.root.rotation.clone(),
            startPosition,
            target,
            index,
          }
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
          const mainProgress = Math.min(1, elapsed / 0.46)
          const mainEase = easeOutBack(mainProgress, 2.25)

          if (main) {
            const settled = Math.max(0, elapsed - 0.46)
            main.root.scale.setScalar(Math.max(0.025, mainEase))
            main.root.position.y = Math.sin(settled * 1.65) * 0.018
            main.root.rotation.y += settled > 0 ? 0.0021 : 0
          }

          companions.forEach((companion) => {
            const delay = (main ? 0.1 : 0.04) + companion.index * 0.045
            const duration = 0.38
            const progress = Math.max(0, Math.min(1, (elapsed - delay) / duration))
            const burstEase = easeOutBack(progress, 2.7)
            const settled = Math.max(0, elapsed - delay - duration)
            companion.root.position.lerpVectors(companion.startPosition, companion.target, burstEase)
            companion.root.position.y += Math.sin(settled * 3.2 + companion.index * 1.4) * 0.018
            companion.root.scale.setScalar(Math.max(0.025, burstEase) * (1 + Math.sin(settled * 4.2 + companion.index) * 0.022))
            companion.root.rotation.copy(companion.baseRotation)
          })

          const flash = Math.exp(-elapsed * 8)
          colorLight.intensity = 21 + flash * 18
          cyanLight.intensity = 16 + flash * 12
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
      data-main={event.main?.id ?? 'companions'}
      data-finish={event.finish}
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
          filter: saturate(1.34) contrast(1.06) drop-shadow(0 24px 30px rgba(0,0,0,.34));
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
          animation: encourage-copy-in 360ms 360ms cubic-bezier(.18,.9,.28,1.08) forwards;
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
