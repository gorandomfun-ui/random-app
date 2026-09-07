#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const { existsSync, readdirSync, mkdirSync, statSync, unlinkSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { basename, join } = require('node:path')
const { spawnSync } = require('node:child_process')
const { NodeIO } = require('@gltf-transform/core')

const root = join(__dirname, '..')
const sourceRoot = join(root, 'public', 'encourage', 'default')
const outputRoot = join(root, 'public', 'encourage', 'runtime', 'default')
const cli = join(root, 'node_modules', '.bin', 'gltf-transform')
const requested = new Set(
  (process.argv.find((argument) => argument.startsWith('--only='))?.slice('--only='.length) || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
)
const productionCompanions = new Set(['flash', 'shine', 'sparkle', 'star'])

function collect(directory) {
  return readdirSync(directory)
    .filter((filename) => filename.endsWith('.glb'))
    .map((filename) => ({
      filename,
      id: filename.replace(/\.glb(?:\.glb)?$/, '').split('__')[0],
      input: join(directory, filename),
    }))
}

const jobs = [
  ...collect(join(sourceRoot, 'main')).map((job) => ({ ...job, group: 'main' })),
  ...collect(join(sourceRoot, 'companions'))
    .filter((job) => productionCompanions.has(job.id))
    .map((job) => ({ ...job, group: 'companions' })),
].filter((job) => requested.size === 0 || requested.has(job.id) || requested.has(basename(job.input)))

async function extractSingleShine(input, output) {
  const io = new NodeIO()
  const document = await io.read(input)
  const primitive = document.getRoot().listMeshes()[0]?.listPrimitives()[0]
  const positionAccessor = primitive?.getAttribute('POSITION')
  const positions = positionAccessor?.getArray()
  const sourceIndices = primitive?.getIndices()?.getArray()
  if (!primitive || !positions) throw new Error('The shine source mesh is unavailable.')

  const corners = sourceIndices
    ?? Uint32Array.from({ length: positions.length / 3 }, (_, index) => index)
  const selectedCorners = []

  // The source is a fused burst. This region contains one complete upright stroke.
  for (let index = 0; index < corners.length; index += 3) {
    let centerX = 0
    let centerY = 0
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = corners[index + corner]
      centerX += positions[vertex * 3]
      centerY += positions[vertex * 3 + 1]
    }
    centerX /= 3
    centerY /= 3
    if (centerX >= 0.22 && centerX <= 0.42 && centerY >= 0.49 && centerY <= 0.89) {
      selectedCorners.push(corners[index], corners[index + 1], corners[index + 2])
    }
  }

  if (!selectedCorners.length) throw new Error('No geometry was extracted from the shine source.')

  const remap = new Map()
  const compactIndices = new Uint32Array(selectedCorners.length)
  for (let index = 0; index < selectedCorners.length; index += 1) {
    const sourceIndex = selectedCorners[index]
    let targetIndex = remap.get(sourceIndex)
    if (targetIndex === undefined) {
      targetIndex = remap.size
      remap.set(sourceIndex, targetIndex)
    }
    compactIndices[index] = targetIndex
  }

  const buffer = document.getRoot().listBuffers()[0]
  for (const semantic of primitive.listSemantics()) {
    const source = primitive.getAttribute(semantic)
    const sourceArray = source.getArray()
    const elementSize = source.getElementSize()
    const targetArray = new sourceArray.constructor(remap.size * elementSize)
    for (const [sourceIndex, targetIndex] of remap) {
      for (let component = 0; component < elementSize; component += 1) {
        targetArray[targetIndex * elementSize + component] = sourceArray[sourceIndex * elementSize + component]
      }
    }
    primitive.setAttribute(
      semantic,
      document.createAccessor(`${semantic.toLowerCase()}-shine-single`)
        .setType(source.getType())
        .setNormalized(source.getNormalized())
        .setArray(targetArray)
        .setBuffer(buffer),
    )
  }

  primitive.setIndices(
    document.createAccessor('indices-shine-single')
      .setType('SCALAR')
      .setArray(compactIndices)
      .setBuffer(buffer),
  )
  await io.write(output, document)
}

async function main() {
  if (!jobs.length) throw new Error('No encouragement assets matched the request.')

  for (const job of jobs) {
    const outputDirectory = join(outputRoot, job.group)
    const outputName = job.filename.replace(/\.glb\.glb$/, '.glb')
    const output = join(outputDirectory, outputName)
    const extractedShine = job.id === 'shine'
      ? join(tmpdir(), `random-shine-single-${process.pid}.glb`)
      : null
    mkdirSync(outputDirectory, { recursive: true })

    try {
      if (extractedShine) await extractSingleShine(job.input, extractedShine)
      console.log(`Optimizing ${job.group}/${job.filename}`)
      const result = spawnSync(cli, [
        'optimize',
        extractedShine ?? job.input,
        output,
        '--compress', 'meshopt',
        '--meshopt-level', 'high',
        '--texture-compress', 'webp',
        '--texture-size', '512',
        '--simplify', 'true',
        '--simplify-ratio', '0.08',
        '--simplify-error', '1',
        '--flatten', 'true',
        '--join', 'true',
        '--weld', 'true',
      ], { stdio: 'inherit' })

      if (result.status !== 0) process.exit(result.status || 1)
      console.log(`Created ${job.group}/${outputName} (${Math.ceil(statSync(output).size / 1024)} KB)`)
    } finally {
      if (extractedShine && existsSync(extractedShine)) unlinkSync(extractedShine)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
