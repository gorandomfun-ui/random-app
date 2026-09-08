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
  size: THREE.Vector3
}

type AssetCacheEntry = { scene: THREE.Group }

const assetCache = new Map<string, Promise<AssetCacheEntry>>()
const MAIN_TARGET_SIZE = 2.62
const MAIN_YAW = THREE.MathUtils.degToRad(45)
const MAIN_PITCH = THREE.MathUtils.degToRad(20)
const MAIN_TURN_LEFT = THREE.MathUtils.degToRad(55)
const MAIN_TURN_RIGHT = THREE.MathUtils.degToRad(55)
const MAIN_ENTRANCE_DURATION = 0.78

type CompanionPlacement = {
  position: readonly [number, number, number]
  size: number
}

const COLOR_PALETTE = ['#ff6a08', '#ff149e', '#174cff'] as const

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(value: string): () => number {
  let state = hashString(value) || 1
  return () => {
    state += 0x6d2b79f5
    let result = state
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

function protectionFor(size: THREE.Vector3 | null): { x: number; y: number; depth: number } {
  if (!size) return { x: 0.76, y: 0.76, depth: 0.3 }
  const sweptHorizontal = Math.hypot(size.x, size.z) / 2
  const projectedVertical = size.y * Math.cos(MAIN_PITCH) / 2 + sweptHorizontal * Math.sin(MAIN_PITCH)
  return {
    x: Math.max(0.76, sweptHorizontal),
    y: Math.max(0.76, projectedVertical),
    depth: Math.max(0.3, Math.hypot(size.x, size.z) / 2),
  }
}

function anglesForSide(count: number, left: boolean, random: () => number): number[] {
  const ranges = count === 1
    ? [[-1.02, 1.02]]
    : count === 2
      ? [[0.28, 1.08], [-1.08, -0.28]]
      : [[0.56, 1.12], [-0.2, 0.2], [-1.12, -0.56]]
  return ranges.slice(0, count).map(([minimum, maximum]) => {
    const sideAngle = minimum + (maximum - minimum) * random()
    return left ? Math.PI - sideAngle : sideAngle
  })
}

function companionAngles(count: number, random: () => number): number[] {
  if (count <= 0) return []
  const leftCount = count === 1
    ? (random() < 0.5 ? 1 : 0)
    : count === 2
      ? 1
      : Math.floor(count / 2) + (count % 2 && random() < 0.5 ? 1 : 0)
  const angles = [
    ...anglesForSide(leftCount, true, random),
    ...anglesForSide(count - leftCount, false, random),
  ]

  for (let index = angles.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = angles[index]
    angles[index] = angles[swapIndex]
    angles[swapIndex] = current
  }
  return angles
}

function layoutFor(
  count: number,
  eventId: string,
  mainSize: THREE.Vector3 | null,
): { placements: CompanionPlacement[]; protection: ReturnType<typeof protectionFor> } {
  const random = seededRandom(`${eventId}:companion`)
  const protection = protectionFor(mainSize)
  const angles = companionAngles(count, random)
  const sizeBands = [0.4, 0.54, 0.46, 0.62]
  const sizeOffset = Math.floor(random() * sizeBands.length)
  const placements = angles.map((angle, index) => {
    const size = sizeBands[(index + sizeOffset) % sizeBands.length] * (0.96 + random() * 0.08)
    const companionRadius = size * 0.54
    const gap = 0.13
    const protectedX = protection.x + companionRadius + gap
    const protectedY = protection.y + companionRadius + gap
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const radius = 1 / Math.sqrt(
      cosine * cosine / (protectedX * protectedX)
      + sine * sine / (protectedY * protectedY),
    )
    return {
      position: [cosine * radius, sine * radius, 0.24 + random() * 0.1] as const,
      size,
    }
  })
  return { placements, protection }
}

function compositionExtents(
  placements: readonly CompanionPlacement[],
  protection: ReturnType<typeof protectionFor>,
): { x: number; y: number; depth: number } {
  let x = protection.x
  let y = protection.y
  let depth = protection.depth

  placements.forEach((placement) => {
    const [anchorX, anchorY, anchorZ] = placement.position
    const radius = placement.size * 0.56
    x = Math.max(x, Math.abs(anchorX) + radius)
    y = Math.max(y, Math.abs(anchorY) + radius)
    depth = Math.max(depth, anchorZ + placement.size * 0.5)
  })

  return { x, y, depth }
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

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3)
}

function easeInOutSine(value: number): number {
  return -(Math.cos(Math.PI * value) - 1) / 2
}

function easeInOutCubic(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2
}

function centralTurn(elapsed: number): number {
  const firstTurnDuration = 0.78
  if (elapsed < firstTurnDuration) {
    return THREE.MathUtils.lerp(0, -MAIN_TURN_LEFT, easeOutCubic(elapsed / firstTurnDuration))
  }

  const sweepDuration = 1.45
  const phase = (elapsed - firstTurnDuration) % (sweepDuration * 2)
  if (phase < sweepDuration) {
    return THREE.MathUtils.lerp(
      -MAIN_TURN_LEFT,
      MAIN_TURN_RIGHT,
      easeInOutSine(phase / sweepDuration),
    )
  }
  return THREE.MathUtils.lerp(
    MAIN_TURN_RIGHT,
    -MAIN_TURN_LEFT,
    easeInOutSine((phase - sweepDuration) / sweepDuration),
  )
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

function shaderColor(color: string): string {
  const value = new THREE.Color(color)
  return `vec3(${value.r.toFixed(4)}, ${value.g.toFixed(4)}, ${value.b.toFixed(4)})`
}

function intensifyTextureColors(
  material: THREE.MeshPhysicalMaterial,
  saturation: number,
  contrast: number,
) {
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
        ${shaderColor(COLOR_PALETTE[0])},
        ${shaderColor(COLOR_PALETTE[1])},
        smoothstep(0.03, 0.55, encourageBand)
      );
      encourageGradient = mix(
        encourageGradient,
        ${shaderColor(COLOR_PALETTE[2])},
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

function makeMaterial(
  source: THREE.Material,
  finish: Encourage3DFinish,
  companion: boolean,
): THREE.Material {
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
  return { root, size: size.multiplyScalar(baseScale) }
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
        const mainEntranceOffset = new THREE.Vector3()
        if (main) {
          mainTiltPivot = new THREE.Group()
          mainTiltPivot.rotation.order = 'YXZ'
          mainTiltPivot.rotation.set(MAIN_PITCH, MAIN_YAW, 0)
          mainEntranceOffset.set(0, 0, -1.24).applyQuaternion(mainTiltPivot.quaternion)
          mainTiltPivot.position.copy(mainEntranceOffset)
          mainSpinPivot = new THREE.Group()
          mainSpinPivot.add(main.root)
          mainTiltPivot.add(mainSpinPivot)
          main.root.scale.setScalar(0.055)
          stage.add(mainTiltPivot)
        }

        const layout = layoutFor(companionEntries.length, event.id, main?.size ?? null)
        const placements = layout.placements
        const viewExtents = compositionExtents(placements, layout.protection)
        const companions = companionEntries.map((entry, index) => {
          const placement = placements[index % placements.length]
          const prepared = prepareAsset(entry, 'color', placement.size, true)
          const target = new THREE.Vector3(...placement.position)
          prepared.root.position.copy(target)
          prepared.root.scale.setScalar(0.025)
          stage.add(prepared.root)
          return {
            ...prepared,
            baseRotation: prepared.root.rotation.clone(),
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
          const halfFovTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
          const fitDistance = Math.max(
            (viewExtents.y + 0.12) / (halfFovTangent * 0.92),
            (viewExtents.x + 0.12) / (halfFovTangent * camera.aspect * 0.92),
          )
          camera.position.z = Math.max(7.2, fitDistance + viewExtents.depth * 0.24)
          camera.updateProjectionMatrix()
        }
        resize()
        const observer = new ResizeObserver(resize)
        observer.observe(host)

        let startedAt = 0
        const render = (now: number) => {
          if (disposed || !renderer) return
          const elapsed = (now - startedAt) / 1000
          const mainProgress = Math.min(1, elapsed / MAIN_ENTRANCE_DURATION)
          const growthProgress = Math.min(1, mainProgress / 0.74)
          const mainScale = mainProgress < 0.74
            ? THREE.MathUtils.lerp(0.055, 1.08, easeInOutCubic(growthProgress))
            : THREE.MathUtils.lerp(1.08, 1, easeOutCubic((mainProgress - 0.74) / 0.26))

          if (main) {
            main.root.scale.setScalar(mainScale)
            if (mainTiltPivot) {
              mainTiltPivot.position.copy(mainEntranceOffset).multiplyScalar(1 - easeOutCubic(mainProgress))
            }
            if (mainSpinPivot) mainSpinPivot.rotation.y = centralTurn(elapsed)
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
            companion.root.scale.setScalar(entranceScale * (1 + pulse))
            companion.root.rotation.copy(companion.baseRotation)
          })

          const flash = Math.exp(-elapsed * 8)
          colorLight.intensity = 4.2 + flash * 3.2
          cyanLight.intensity = 3.6 + flash * 2.8
          renderer.render(scene, camera)
          frame = window.requestAnimationFrame(render)
        }

        try {
          await renderer.compileAsync(scene, camera)
        } catch {
          renderer.compile(scene, camera)
        }
        renderer.render(scene, camera)
        if (disposed) return () => observer.disconnect()

        startedAt = performance.now()
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
          pointer-events: none;
        }
        .encourage-3d--ready {
          animation: encourage-overlay-in 160ms ease-out forwards;
          pointer-events: auto;
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
          transition: opacity 90ms ease-out;
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
