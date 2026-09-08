#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const { readdirSync, mkdirSync, statSync } = require('node:fs')
const { basename, join } = require('node:path')
const { spawnSync } = require('node:child_process')

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
const productionCompanions = new Set(['flash', 'sparkle', 'star'])

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

async function main() {
  if (!jobs.length) throw new Error('No encouragement assets matched the request.')

  for (const job of jobs) {
    const outputDirectory = join(outputRoot, job.group)
    const outputName = job.filename.replace(/\.glb\.glb$/, '.glb')
    const output = join(outputDirectory, outputName)
    mkdirSync(outputDirectory, { recursive: true })

    console.log(`Optimizing ${job.group}/${job.filename}`)
    const result = spawnSync(cli, [
      'optimize',
      job.input,
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
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
