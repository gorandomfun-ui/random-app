#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs')
const path = require('path')
const Module = require('module')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '..', '..')
const envPath = path.join(projectRoot, '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [key, ...rest] = trimmed.split('=')
    const value = rest.join('=').trim()
    if (key && value && !process.env[key]) process.env[key] = value
  }
}
process.env.NODE_PATH = process.env.NODE_PATH
  ? `${process.env.NODE_PATH}${path.delimiter}${projectRoot}`
  : projectRoot
Module._initPaths()

const compilerOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
  esModuleInterop: true,
  resolveJsonModule: true,
}

require.extensions['.ts'] = function registerTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const transpiled = ts.transpileModule(source, { compilerOptions, fileName: filename })
  return module._compile(transpiled.outputText, filename)
}

require('./backfillWaveProfiles.ts')
