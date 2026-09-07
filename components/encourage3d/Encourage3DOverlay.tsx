'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { X } from 'lucide-react'
import * as THREE from 'three'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { useI18n } from '@/providers/I18nProvider'
import { playEncourage3D } from '@/utils/sound'
import type {
  Encourage3DAsset,
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

type AssetCacheEntry = { scene: THREE.Group }

const assetCache = new Map<string, Promise<AssetCacheEntry>>()
const MAIN_TARGET_SIZE = 2.62
const MAIN_YAW = THREE.MathUtils.degToRad(45)
const MAIN_PITCH = THREE.MathUtils.degToRad(20)

type CompanionPlacement = {
  position: readonly [number, number, number]
  size: number
}

const companionLayouts: Record<number, CompanionPlacement[][]> = {
  1: [
    [{ position: [-1.2, 0.72, 0.24], size: 0.62 }],
    [{ position: [1.22, -0.34, 0.26], size: 0.68 }],
    [{ position: [0.94, 0.86, 0.22], size: 0.54 }],
  ],
  2: [
    [
      { position: [-1.2, 0.72, 0.24], size: 0.64 },
      { position: [1.08, -0.8, 0.3], size: 0.48 },
    ],
    [
      { position: [1.22, 0.58, 0.24], size: 0.58 },
      { position: [0.82, -0.94, 0.3], size: 0.7 },
    ],
    [
      { position: [-1.16, -0.6, 0.28], size: 0.7 },
      { position: [1.18, 0.7, 0.24], size: 0.52 },
    ],
  ],
  3: [
    [
      { position: [-1.24, 0.66, 0.22], size: 0.64 },
      { position: [1.2, 0.34, 0.28], size: 0.46 },
      { position: [0.9, -0.94, 0.3], size: 0.72 },
    ],
    [
      { position: [-1.12, 0.88, 0.24], size: 0.48 },
      { position: [-1.18, -0.68, 0.3], size: 0.7 },
      { position: [1.24, 0.5, 0.24], size: 0.58 },
    ],
    [
      { position: [-1.28, 0.22, 0.26], size: 0.58 },
      { position: [0.72, 0.96, 0.22], size: 0.68 },
      { position: [1.18, -0.7, 0.3], size: 0.5 },
    ],
  ],
  4: [
    [
      { position: [-1.2, 0.88, 0.22], size: 0.48 },
      { position: [-1.34, 0.04, 0.28], size: 0.68 },
      { position: [-1.02, -0.9, 0.3], size: 0.42 },
      { position: [1.26, 0.24, 0.26], size: 0.62 },
    ],
    [
      { position: [-1.24, -0.38, 0.28], size: 0.7 },
      { position: [1.08, 0.94, 0.22], size: 0.46 },
      { position: [1.34, 0.08, 0.28], size: 0.66 },
      { position: [1.04, -0.88, 0.3], size: 0.5 },
    ],
    [
      { position: [-1.3, 0.54, 0.24], size: 0.58 },
      { position: [-1.08, -0.76, 0.3], size: 0.44 },
      { position: [0.92, 0.92, 0.22], size: 0.68 },
      { position: [1.3, -0.18, 0.28], size: 0.5 },
    ],
  ],
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function layoutFor(count: number, eventId: string): CompanionPlacement[] {
  const layouts = companionLayouts[Math.max(1, Math.min(4, count))]
  return layouts[hashString(eventId) % layouts.length]
}

function selectCompanions(event: Encourage3DEvent): Encourage3DAsset[] {
  const selected: Encourage3DAsset[] = []
  const instances = new Map<string, number>()
  let cursor = 0

  while (selected.length < event.companionCount && cursor < event.companions.length * event.companionCount) {
    const companion = event.companions[cursor % event.companions.length]
    const used = instances.get(companion.id) ?? 0
    if (used < companion.maxInstances) {
      selected.push(companion)
      instances.set(companion.id, used + 1)
    }
    cursor += 1
  }

  return selected
}

function easeOutBack(value: number, overshoot = 1.70158): number {
  const c1 = overshoot
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2)
}

function loadAsset(asset: Encourage3DAsset): Promise<AssetCacheEntry> {
  const cached = assetCache.get(asset.src)
  if (cached) return cached

  const pending: Promise<AssetCacheEntry> = new Promise((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    loader.load(
      asset.src,
      (gltf) => resolve({ scene: gltf.scene }),
      undefined,
      reject,
    )
  })

  assetCache.set(asset.src, pending)
  void pending.catch(() => assetCache.delete(asset.src))
  return pending
}

export async function preloadEncourage3DEvent(event: Encourage3DEvent): Promise<void> {
  const selectedCompanions = selectCompanions(event)
  const assets = [event.main, ...selectedCompanions].filter((asset): asset is Encourage3DAsset => Boolean(asset))
  const uniqueAssets = [...new Map(assets.map((asset) => [asset.src, asset])).values()]
  await Promise.all(uniqueAssets.map(loadAsset))
}

function intensifyTextureColors(material: THREE.MeshPhysicalMaterial, saturation: number, contrast: number) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 encourageObjectPosition;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      encourageObjectPosition = position;`,
    )
    shader.fragmentShader = `varying vec3 encourageObjectPosition;\n${shader.fragmentShader}`
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float encourageLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 encourageSaturated = mix(vec3(encourageLuma), diffuseColor.rgb, ${saturation.toFixed(2)});
      encourageSaturated = clamp((encourageSaturated - 0.5) * ${contrast.toFixed(2)} + 0.52, 0.0, 1.0);
      float encourageBand = clamp(
        encourageObjectPosition.x * 0.5 + encourageObjectPosition.y * 0.16 + 0.5,
        0.0,
        1.0
      );
      vec3 encourageGradient = mix(
        vec3(1.0, 0.28, 0.015),
        vec3(1.0, 0.015, 0.48),
        smoothstep(0.03, 0.55, encourageBand)
      );
      encourageGradient = mix(
        encourageGradient,
        vec3(0.025, 0.24, 1.0),
        smoothstep(0.52, 0.98, encourageBand)
      );
      float encourageTextureWeight = 0.48 + smoothstep(0.22, 0.72, encourageLuma) * 0.2;
      diffuseColor.rgb = mix(encourageGradient, encourageSaturated, encourageTextureWeight);`,
    )
  }
  material.customProgramCacheKey = () => `encourage-color-${saturation.toFixed(2)}-${contrast.toFixed(2)}`
}

function createStudioEnvironment(): THREE.Scene {
  const studio = new THREE.Scene()
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const room = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#30263b'),
      roughness: 1,
      metalness: 0,
      side: THREE.BackSide,
    }),
  )
  room.scale.setScalar(12)
  studio.add(room)

  const addPanel = (
    color: THREE.ColorRepresentation,
    intensity: number,
    position: readonly [number, number, number],
    scale: readonly [number, number, number],
    rotation: readonly [number, number, number] = [0, 0, 0],
  ) => {
    const panel = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({
        color: 0x000000,
        emissive: new THREE.Color(color),
        emissiveIntensity: intensity,
        side: THREE.DoubleSide,
      }),
    )
    panel.position.set(...position)
    panel.scale.set(...scale)
    panel.rotation.set(...rotation)
    studio.add(panel)
  }

  addPanel(0xffffff, 9, [-4.8, 1.4, 4.5], [0.12, 3.8, 1.2], [0, -0.18, 0])
  addPanel(0xffffff, 8, [0.6, 4.8, 2.2], [3.2, 0.1, 1.6])
  addPanel(0xffffff, 7, [4.7, -0.3, 2.8], [0.12, 2.6, 1.4], [0, 0.2, 0])
  addPanel(0xffd7f4, 5, [3.8, 2.1, -2.6], [0.12, 1.7, 2.3])
  addPanel(0x54e9ff, 4.5, [-4.1, -2.2, -1.4], [0.12, 1.5, 2.8])
  addPanel(0xffffff, 6, [-0.8, -4.7, -2], [2.8, 0.1, 1.8])
  return studio
}

function disposeSceneResources(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    geometries.add(child.geometry)
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material]
    childMaterials.forEach((material) => materials.add(material))
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
}

function makeMaterial(source: THREE.Material, finish: Encourage3DFinish, companion: boolean): THREE.Material {
  const original = source as THREE.MeshStandardMaterial
  const common = {
    normalMap: null,
    side: THREE.DoubleSide,
    envMapIntensity: companion ? 2.25 : 2.6,
  }

  if (finish === 'gold' || finish === 'silver') {
    return new THREE.MeshPhysicalMaterial({
      ...common,
      color: finish === 'gold' ? new THREE.Color('#ffb000') : new THREE.Color('#dcecff'),
      metalness: 0.78,
      roughness: finish === 'gold' ? 0.09 : 0.075,
      clearcoat: 1,
      clearcoatRoughness: 0.025,
      specularIntensity: 1,
      iridescence: 0.12,
      iridescenceIOR: 1.3,
    })
  }

  const material = new THREE.MeshPhysicalMaterial({
    ...common,
    color: original.color?.clone() ?? new THREE.Color('#ffffff'),
    map: original.map ?? null,
    metalness: 0.04,
    roughness: companion ? 0.09 : 0.075,
    transmission: 0,
    thickness: companion ? 0.2 : 0.28,
    attenuationDistance: companion ? 0.82 : 0.74,
    attenuationColor: new THREE.Color('#ffffff'),
    ior: 1.52,
    dispersion: companion ? 0.012 : 0.022,
    iridescence: companion ? 0.08 : 0.12,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [120, 300] as [number, number],
    clearcoat: 1,
    clearcoatRoughness: 0.025,
    specularIntensity: 1,
    specularColor: new THREE.Color('#ffffff'),
    transparent: true,
    opacity: companion ? 0.95 : 0.93,
  })
  intensifyTextureColors(material, companion ? 1.32 : 1.4, 1.01)
  return material
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
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => makeMaterial(material, companion ? 'color' : finish, companion))
      : makeMaterial(child.material, companion ? 'color' : finish, companion)
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

function prepareAsset(
  entry: AssetCacheEntry,
  finish: Encourage3DFinish,
  targetSize: number,
  companion = false,
): LoadedModel {
  return cloneAndPrepare(entry.scene, finish, targetSize, companion)
}

export default function Encourage3DOverlay({ event, menuTargetRef, onAward, onComplete }: Props) {
  const { t } = useI18n()
  const canvasHostRef = useRef<HTMLDivElement | null>(null)
  const closeStartedRef = useRef(false)
  const soundPlayedRef = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  const [closing, setClosing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [flightTarget, setFlightTarget] = useState({ x: 0, y: 0 })

  const finishLabel = event.finish === 'gold'
    ? t('encourage.goldLabel', 'Gold')
    : event.finish === 'silver'
      ? t('encourage.silverLabel', 'Silver')
      : null
  const pointsLabel = t('encourage.pointsLabel', 'pts')
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
        const companionSelections = selectCompanions(event)
        const [mainEntry, allCompanionEntries] = await Promise.all([
          event.main ? loadAsset(event.main) : Promise.resolve(null),
          Promise.all(companionSelections.map(loadAsset)),
        ])
        if (disposed) return

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
        camera.position.set(0, 0, 7.2)

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
        renderer.setClearColor(0x000000, 0)
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.NeutralToneMapping
        renderer.toneMappingExposure = 1.06
        const isTouch = window.matchMedia('(pointer: coarse)').matches
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.15 : 1.5))
        host.appendChild(renderer.domElement)

        const pmrem = new THREE.PMREMGenerator(renderer)
        const studioEnvironment = createStudioEnvironment()
        try {
          environment = pmrem.fromScene(studioEnvironment, 0.025).texture
          scene.environment = environment
        } finally {
          disposeSceneResources(studioEnvironment)
          pmrem.dispose()
        }

        RectAreaLightUniformsLib.init()
        const keyPanel = new THREE.RectAreaLight(0xffffff, 7, 2.2, 5.2)
        keyPanel.position.set(-3.8, 3.8, 5.2)
        keyPanel.lookAt(0, 0, 0)
        scene.add(keyPanel)
        const fillPanel = new THREE.RectAreaLight(0xffd9f5, 4.5, 3.2, 1.3)
        fillPanel.position.set(4, 1.4, 4.6)
        fillPanel.lookAt(0, 0, 0)
        scene.add(fillPanel)
        const rimPanel = new THREE.RectAreaLight(0x66edff, 3.8, 1.4, 3.4)
        rimPanel.position.set(-3.8, -2.4, 3.2)
        rimPanel.lookAt(0, 0, 0)
        scene.add(rimPanel)
        scene.add(new THREE.AmbientLight(0xffffff, 0.42))

        const colorLight = new THREE.PointLight(0xff149e, 4.2, 12)
        colorLight.position.set(3, 1.4, 4)
        scene.add(colorLight)
        const cyanLight = new THREE.PointLight(0x00dfff, 3.6, 10)
        cyanLight.position.set(-3.2, -1.8, 3.2)
        scene.add(cyanLight)

        const stage = new THREE.Group()
        scene.add(stage)
        const featuredCompanionEntry = mainEntry ? null : allCompanionEntries[0] ?? null
        const companionEntries = mainEntry ? allCompanionEntries : allCompanionEntries.slice(1)
        const centralEntry = mainEntry ?? featuredCompanionEntry
        const main = centralEntry
          ? prepareAsset(centralEntry, mainEntry ? event.finish : 'color', mainEntry ? MAIN_TARGET_SIZE : 2.29, !mainEntry)
          : null
        let mainTiltPivot: THREE.Group | null = null
        let mainSpinPivot: THREE.Group | null = null
        if (main) {
          mainTiltPivot = new THREE.Group()
          mainTiltPivot.rotation.order = 'YXZ'
          mainTiltPivot.rotation.set(MAIN_PITCH, MAIN_YAW, 0)
          mainSpinPivot = new THREE.Group()
          mainSpinPivot.add(main.root)
          mainTiltPivot.add(mainSpinPivot)
          main.root.scale.setScalar(0.025)
          stage.add(mainTiltPivot)
        }

        const placements = layoutFor(companionEntries.length, event.id)
        const companions = companionEntries.map((entry, index) => {
          const placement = placements[index % placements.length]
          const prepared = prepareAsset(entry, 'color', placement.size, true)
          const target = new THREE.Vector3(...placement.position)
          const isShine = companionSelections[index]?.id === 'shine'
          const radialRotation = isShine
            ? Math.atan2(-target.y, -target.x) - Math.PI / 2
            : 0
          prepared.root.position.copy(target)
          prepared.root.scale.setScalar(0.025)
          prepared.root.rotation.set(0, 0, radialRotation)
          stage.add(prepared.root)
          return {
            ...prepared,
            baseRotation: prepared.root.rotation.clone(),
            isShine,
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
            main.root.position.set(0, 0, 0)
            if (mainTiltPivot) mainTiltPivot.position.set(0, 0, 0)
            if (mainSpinPivot) mainSpinPivot.rotation.y = settled * 0.28
          }

          companions.forEach((companion) => {
            const delay = (main ? 0.1 : 0.04) + companion.index * 0.045
            const duration = 0.26
            const progress = Math.max(0, Math.min(1, (elapsed - delay) / duration))
            const burstEase = easeOutBack(progress, 2.7)
            const settled = Math.max(0, elapsed - delay - duration)
            const pulseCycle = (settled + companion.index * 0.23) % 1.6
            const pulse = pulseCycle < 0.16 ? Math.sin((pulseCycle / 0.16) * Math.PI) * 0.085 : 0
            const entranceScale = Math.max(0.025, burstEase)
            companion.root.position.copy(companion.target)
            if (companion.isShine) {
              const lengthCycle = (settled + companion.index * 0.19) % 1.45
              const lengthPulse = lengthCycle < 0.18
                ? Math.sin((lengthCycle / 0.18) * Math.PI) * 0.16
                : 0
              companion.root.scale.set(entranceScale, entranceScale * (1 + lengthPulse), entranceScale)
            } else {
              companion.root.scale.setScalar(entranceScale * (1 + pulse))
            }
            companion.root.rotation.copy(companion.baseRotation)
          })

          const flash = Math.exp(-elapsed * 8)
          colorLight.intensity = 4.2 + flash * 3.2
          cyanLight.intensity = 3.6 + flash * 2.8
          renderer.render(scene, camera)
          frame = window.requestAnimationFrame(render)
        }

        if (soundPlayedRef.current !== event.id) {
          soundPlayedRef.current = event.id
          playEncourage3D(event.intensity, event.finish)
        }
        setReady(true)
        frame = window.requestAnimationFrame(render)

        return () => observer.disconnect()
      } catch (error) {
        console.error('[Encourage3D] Unable to render the preview.', error)
        if (!disposed) {
          setFailed(true)
          setReady(true)
        }
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
      data-companion={event.companions[0]?.id ?? 'none'}
      data-companion-count={event.companionCount}
      data-finish={event.finish}
      role="dialog"
      aria-modal="true"
      aria-label={`${event.message}. ${event.points} ${pointsLabel}.`}
    >
      <div className="encourage-3d__backdrop" aria-hidden="true" />
      <button
        type="button"
        className="encourage-3d__close"
        onClick={close}
        aria-label={t('encourage.closeLabel', 'Close encouragement')}
        disabled={closing}
      >
        <X size={28} strokeWidth={2.2} />
      </button>

      <div className="encourage-3d__stage">
        <div ref={canvasHostRef} className="encourage-3d__canvas" aria-hidden="true" />
        {failed ? <span className="encourage-3d__error">{t('encourage.unavailableLabel', '3D effect unavailable')}</span> : null}
        <div className="encourage-3d__copy">
          {finishLabel ? <span className={`encourage-3d__finish encourage-3d__finish--${event.finish}`}>{finishLabel}</span> : null}
          <p>{event.message}</p>
          <strong>+{event.points} {pointsLabel}</strong>
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
        }
        .encourage-3d--ready {
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
        }
        .encourage-3d--ready .encourage-3d__close {
          animation: encourage-copy-in 380ms 240ms cubic-bezier(.18,.9,.28,1.18) forwards;
        }
        .encourage-3d__stage {
          position: relative;
          width: min(92vw, 680px);
          height: min(76vh, 720px);
          height: min(76dvh, 720px);
          max-height: calc(100dvh - max(76px, env(safe-area-inset-top)) - max(28px, env(safe-area-inset-bottom)));
        }
        .encourage-3d__canvas {
          position: absolute;
          inset: 0 0 104px;
          opacity: 0;
          filter: saturate(1.24) contrast(1.08) drop-shadow(0 24px 30px rgba(0,0,0,.34));
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
        }
        .encourage-3d--ready .encourage-3d__copy {
          animation: encourage-copy-in 360ms 360ms cubic-bezier(.18,.9,.28,1.08) forwards;
        }
        .encourage-3d__copy p {
          max-width: 560px;
          font-family: var(--font-tomorrow), sans-serif;
          font-size: clamp(19px, 4.7vw, 30px);
          font-weight: 700;
          line-height: 1.08;
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
            height: min(78dvh, 680px);
            max-height: calc(100dvh - max(70px, env(safe-area-inset-top)) - max(20px, env(safe-area-inset-bottom)));
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
