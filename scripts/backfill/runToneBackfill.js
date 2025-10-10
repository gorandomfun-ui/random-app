#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..', '..');

// Enable resolving from project root
const nodePath = process.env.NODE_PATH ? `${process.env.NODE_PATH}${path.delimiter}${projectRoot}` : projectRoot;
process.env.NODE_PATH = nodePath;
Module._initPaths();

const compilerOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
  esModuleInterop: true,
  resolveJsonModule: true,
};

require.extensions['.ts'] = function registerTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions,
    fileName: filename,
  });
  return module._compile(transpiled.outputText, filename);
};

require('./backfillTone.ts');
