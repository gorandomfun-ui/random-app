'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { X } from 'lucide-react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { useI18n } from '@/providers/I18nProvider'
import { playEncourage3D } from '@/utils/sound'
import type {
  Encourage3DAnimation,
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
  flat: boolean
  ownedGeometries: THREE.BufferGeometry[]
}

type AssetCacheEntry =
  | { kind: 'model'; scene: THREE.Group }
  | { kind: 'image'; texture: THREE.Texture; aspect: number }

const assetCache = new Map<string, Promise<AssetCacheEntry>>()

type CompanionPlacement = {
  position: readonly [number, number, number]
  size: number
  rotation: readonly [number, number, number]
}

const companionLayouts: Record<number, CompanionPlacement[][]> = {
  1: [
    [{ position: [-1.2, 0.72, 0.24], size: 0.62, rotation: [0.18, -0.28, -0.24] }],
    [{ position: [1.22, -0.34, 0.26], size: 0.68, rotation: [0.16, 0.34, 0.28] }],
    [{ position: [0.94, 0.86, 0.22], size: 0.54, rotation: [0.2, -0.18, 0.16] }],
  ],
  2: [
    [
      { position: [-1.2, 0.72, 0.24], size: 0.64, rotation: [0.18, -0.3, -0.24] },
      { position: [1.08, -0.8, 0.3], size: 0.48, rotation: [0.16, 0.34, 0.25] },
    ],
    [
      { position: [1.22, 0.58, 0.24], size: 0.58, rotation: [0.16, 0.26, 0.24] },
      { position: [0.82, -0.94, 0.3], size: 0.7, rotation: [0.2, -0.22, -0.18] },
    ],
    [
      { position: [-1.16, -0.6, 0.28], size: 0.7, rotation: [0.18, 0.3, -0.3] },
      { position: [1.18, 0.7, 0.24], size: 0.52, rotation: [0.16, -0.3, 0.2] },
    ],
  ],
  3: [
    [
      { position: [-1.24, 0.66, 0.22], size: 0.64, rotation: [0.18, -0.32, -0.28] },
      { position: [1.2, 0.34, 0.28], size: 0.46, rotation: [0.14, 0.28, 0.24] },
      { position: [0.9, -0.94, 0.3], size: 0.72, rotation: [0.2, -0.18, -0.2] },
    ],
    [
      { position: [-1.12, 0.88, 0.24], size: 0.48, rotation: [0.18, 0.28, -0.2] },
      { position: [-1.18, -0.68, 0.3], size: 0.7, rotation: [0.2, -0.28, 0.28] },
      { position: [1.24, 0.5, 0.24], size: 0.58, rotation: [0.16, 0.26, 0.22] },
    ],
    [
      { position: [-1.28, 0.22, 0.26], size: 0.58, rotation: [0.18, -0.32, -0.26] },
      { position: [0.72, 0.96, 0.22], size: 0.68, rotation: [0.16, 0.2, 0.18] },
      { position: [1.18, -0.7, 0.3], size: 0.5, rotation: [0.2, -0.24, 0.3] },
    ],
  ],
  4: [
    [
      { position: [-1.24, 0.72, 0.22], size: 0.58, rotation: [0.18, -0.3, -0.24] },
      { position: [-1.06, -0.72, 0.3], size: 0.42, rotation: [0.16, 0.3, 0.3] },
      { position: [1.24, 0.34, 0.26], size: 0.7, rotation: [0.2, -0.22, 0.24] },
      { position: [0.84, -0.98, 0.3], size: 0.5, rotation: [0.16, 0.24, -0.2] },
    ],
    [
      { position: [-1.28, 0.28, 0.26], size: 0.68, rotation: [0.18, 0.28, -0.3] },
      { position: [-0.72, 0.98, 0.22], size: 0.44, rotation: [0.14, -0.24, 0.18] },
      { position: [1.18, 0.7, 0.24], size: 0.54, rotation: [0.18, 0.3, 0.24] },
      { position: [1.12, -0.78, 0.3], size: 0.72, rotation: [0.2, -0.2, -0.24] },
    ],
    [
      { position: [-1.18, 0.82, 0.22], size: 0.5, rotation: [0.16, -0.28, -0.24] },
      { position: [-1.22, -0.5, 0.3], size: 0.72, rotation: [0.2, 0.28, 0.26] },
      { position: [0.72, 0.96, 0.24], size: 0.62, rotation: [0.18, -0.2, 0.18] },
      { position: [1.24, -0.62, 0.28], size: 0.44, rotation: [0.16, 0.3, -0.3] },
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

function easeOutBack(value: number, overshoot = 1.70158): number {
  const c1 = overshoot
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2)
}

function loadImageTexture(src: string): Promise<Extract<AssetCacheEntry, { kind: 'image' }>> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      try {
        const scanCanvas = document.createElement('canvas')
        scanCanvas.width = image.naturalWidth
        scanCanvas.height = image.naturalHeight
        const scanContext = scanCanvas.getContext('2d', { willReadFrequently: true })
        if (!scanContext) throw new Error('Canvas 2D context unavailable')
        scanContext.drawImage(image, 0, 0)
        const pixels = scanContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height).data
        let minX = scanCanvas.width
        let minY = scanCanvas.height
        let maxX = -1
        let maxY = -1
        const stride = 2
        for (let y = 0; y < scanCanvas.height; y += stride) {
          for (let x = 0; x < scanCanvas.width; x += stride) {
            if (pixels[(y * scanCanvas.width + x) * 4 + 3] < 8) continue
            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x)
            maxY = Math.max(maxY, y)
          }
        }

        if (maxX < minX || maxY < minY) throw new Error(`Empty transparent image: ${src}`)
        const visibleWidth = maxX - minX + 1
        const visibleHeight = maxY - minY + 1
        const padding = Math.ceil(Math.max(visibleWidth, visibleHeight) * 0.025)
        const sourceX = Math.max(0, minX - padding)
        const sourceY = Math.max(0, minY - padding)
        const sourceWidth = Math.min(scanCanvas.width - sourceX, visibleWidth + padding * 2)
        const sourceHeight = Math.min(scanCanvas.height - sourceY, visibleHeight + padding * 2)
        const scale = Math.min(1, 1024 / Math.max(sourceWidth, sourceHeight))
        const textureCanvas = document.createElement('canvas')
        textureCanvas.width = Math.max(1, Math.round(sourceWidth * scale))
        textureCanvas.height = Math.max(1, Math.round(sourceHeight * scale))
        const textureContext = textureCanvas.getContext('2d')
        if (!textureContext) throw new Error('Canvas 2D context unavailable')
        textureContext.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          textureCanvas.width,
          textureCanvas.height,
        )

        scanCanvas.width = 1
        scanCanvas.height = 1
        const texture = new THREE.CanvasTexture(textureCanvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.minFilter = THREE.LinearMipmapLinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.generateMipmaps = true
        texture.needsUpdate = true
        resolve({ kind: 'image', texture, aspect: textureCanvas.width / textureCanvas.height })
      } catch (error) {
        reject(error)
      }
    }
    image.onerror = () => reject(new Error(`Unable to load image: ${src}`))
    image.src = src
  })
}

function loadAsset(asset: Encourage3DAsset): Promise<AssetCacheEntry> {
  const cached = assetCache.get(asset.src)
  if (cached) return cached

  const pending: Promise<AssetCacheEntry> = asset.kind === 'image'
    ? loadImageTexture(asset.src)
    : new Promise((resolve, reject) => {
        const loader = new GLTFLoader()
        loader.setMeshoptDecoder(MeshoptDecoder)
        loader.load(
          asset.src,
          (gltf) => resolve({ kind: 'model', scene: gltf.scene }),
          undefined,
          reject,
        )
      })

  assetCache.set(asset.src, pending)
  void pending.catch(() => assetCache.delete(asset.src))
  return pending
}

export async function preloadEncourage3DEvent(event: Encourage3DEvent): Promise<void> {
  const assets = [event.main, ...event.companions].filter((asset): asset is Encourage3DAsset => Boolean(asset))
  const uniqueAssets = [...new Map(assets.map((asset) => [asset.src, asset])).values()]
  await Promise.all(uniqueAssets.map(loadAsset))
}

function intensifyTextureColors(material: THREE.MeshPhysicalMaterial, saturation: number) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float encourageLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = clamp(mix(vec3(encourageLuma), diffuseColor.rgb, ${saturation.toFixed(2)}), 0.0, 1.0);`,
    )
  }
  material.customProgramCacheKey = () => `encourage-color-${saturation.toFixed(2)}`
}

function makeMaterial(source: THREE.Material, finish: Encourage3DFinish, companion: boolean): THREE.Material {
  const original = source as THREE.MeshStandardMaterial
  const common = {
    normalMap: original.normalMap ?? null,
    normalScale: original.normalScale?.clone() ?? new THREE.Vector2(1, 1),
    side: THREE.DoubleSide,
    envMapIntensity: companion ? 1.9 : 2.15,
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

  const material = new THREE.MeshPhysicalMaterial({
    ...common,
    color: original.color?.clone() ?? new THREE.Color('#ffffff'),
    map: original.map ?? null,
    metalness: 0,
    roughness: companion ? 0.11 : 0.09,
    transmission: companion ? 0.32 : 0.38,
    thickness: companion ? 0.42 : 0.58,
    attenuationDistance: companion ? 1.1 : 0.9,
    attenuationColor: new THREE.Color('#ffffff'),
    ior: 1.48,
    iridescence: companion ? 0.2 : 0.38,
    iridescenceIOR: 1.32,
    iridescenceThicknessRange: [110, 390] as [number, number],
    clearcoat: 1,
    clearcoatRoughness: 0.025,
    specularIntensity: 1,
    specularColor: new THREE.Color('#ffffff'),
    transparent: true,
    opacity: companion ? 0.86 : 0.84,
  })
  intensifyTextureColors(material, companion ? 1.52 : 1.68)
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
  return { root, flat: false, ownedGeometries: [] }
}

function prepareImage(
  entry: Extract<AssetCacheEntry, { kind: 'image' }>,
  targetSize: number,
): LoadedModel {
  const geometry = new THREE.PlaneGeometry(entry.aspect, 1)
  const material = new THREE.MeshBasicMaterial({
    map: entry.texture,
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    alphaTest: 0.015,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  const normalized = new THREE.Group()
  normalized.scale.setScalar(targetSize / Math.max(entry.aspect, 1))
  normalized.add(mesh)
  const root = new THREE.Group()
  root.add(normalized)
  return { root, flat: true, ownedGeometries: [geometry] }
}

function prepareAsset(
  entry: AssetCacheEntry,
  finish: Encourage3DFinish,
  targetSize: number,
  companion = false,
): LoadedModel {
  return entry.kind === 'model'
    ? cloneAndPrepare(entry.scene, finish, targetSize, companion)
    : prepareImage(entry, targetSize)
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

function initialFlatMainTransform(animation: Encourage3DAnimation, root: THREE.Group) {
  const direction = animation === 'swing' || animation === 'impact' ? -1 : 1
  root.rotation.set(0.02 * direction, 0.08 * direction, animation === 'orbit' ? 0.08 : -0.035 * direction)
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
    const disposableGeometries: THREE.BufferGeometry[] = []

    const start = async () => {
      try {
        const companionSelections = Array.from({ length: event.companionCount }, (_, index) => (
          event.companions[index % event.companions.length]
        ))
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
        renderer.toneMappingExposure = 1.12
        const isTouch = window.matchMedia('(pointer: coarse)').matches
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.15 : 1.5))
        host.appendChild(renderer.domElement)

        const pmrem = new THREE.PMREMGenerator(renderer)
        environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
        scene.environment = environment
        pmrem.dispose()

        const keyLight = new THREE.DirectionalLight(0xffffff, 3.6)
        keyLight.position.set(-3.8, 5.2, 6)
        scene.add(keyLight)
        const colorLight = new THREE.PointLight(0xff149e, 12, 12)
        colorLight.position.set(3, 1.4, 4)
        scene.add(colorLight)
        const cyanLight = new THREE.PointLight(0x00cfff, 9, 10)
        cyanLight.position.set(-3.2, -1.8, 3.2)
        scene.add(cyanLight)

        const stage = new THREE.Group()
        scene.add(stage)
        const featuredCompanionEntry = mainEntry ? null : allCompanionEntries[0] ?? null
        const companionEntries = mainEntry ? allCompanionEntries : allCompanionEntries.slice(1)
        const centralEntry = mainEntry ?? featuredCompanionEntry
        const main = centralEntry
          ? prepareAsset(centralEntry, mainEntry ? event.finish : 'color', mainEntry ? 2.38 : 2.08, !mainEntry)
          : null
        let mainBaseRotation: THREE.Euler | null = null
        if (main) {
          if (main.flat) initialFlatMainTransform(event.animation, main.root)
          else initialMainTransform(event.animation, main.root)
          mainBaseRotation = main.root.rotation.clone()
          disposableGeometries.push(...main.ownedGeometries)
          main.root.scale.setScalar(0.025)
          stage.add(main.root)
        }

        const placements = layoutFor(companionEntries.length, event.id)
        const companions = companionEntries.map((entry, index) => {
          const placement = placements[index % placements.length]
          const prepared = prepareAsset(entry, 'color', placement.size, true)
          const target = new THREE.Vector3(...placement.position)
          const startPosition = target.clone().multiplyScalar(0.08)
          startPosition.z = -1.2 - index * 0.08
          prepared.root.position.copy(startPosition)
          prepared.root.scale.setScalar(0.025)
          prepared.root.rotation.set(...placement.rotation)
          disposableGeometries.push(...prepared.ownedGeometries)
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
            main.root.position.set(0, 0, 0)
            if (mainBaseRotation) {
              main.root.rotation.copy(mainBaseRotation)
              if (main.flat) {
                main.root.rotation.y += Math.sin(settled * 0.8) * 0.08
                main.root.rotation.z += settled * 0.075
              } else {
                main.root.rotation.y += settled * 0.28
              }
            }
          }

          companions.forEach((companion) => {
            const delay = (main ? 0.1 : 0.04) + companion.index * 0.045
            const duration = 0.38
            const progress = Math.max(0, Math.min(1, (elapsed - delay) / duration))
            const burstEase = easeOutBack(progress, 2.7)
            const settled = Math.max(0, elapsed - delay - duration)
            const pulseCycle = (settled + companion.index * 0.31) % 1.9
            const pulse = pulseCycle < 0.34 ? Math.sin((pulseCycle / 0.34) * Math.PI) * 0.065 : 0
            companion.root.position.lerpVectors(companion.startPosition, companion.target, burstEase)
            companion.root.scale.setScalar(Math.max(0.025, burstEase) * (1 + pulse))
            companion.root.rotation.copy(companion.baseRotation)
          })

          const flash = Math.exp(-elapsed * 8)
          colorLight.intensity = 12 + flash * 8
          cyanLight.intensity = 9 + flash * 6
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
      disposableGeometries.forEach((geometry) => geometry.dispose())
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
          min-height: 470px;
        }
        .encourage-3d__canvas {
          position: absolute;
          inset: 0 0 104px;
          opacity: 0;
          filter: saturate(1.12) contrast(1.04) drop-shadow(0 24px 30px rgba(0,0,0,.34));
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
