#!/usr/bin/env bash
# Run from the repository root. The supplied Mongo URI MUST identify a disposable test server.
set -euo pipefail
if [[ -z "${RANDOM_TEST_MONGO_URI:-}" ]]; then
  echo 'Set RANDOM_TEST_MONGO_URI to a disposable local MongoDB instance before running this validation.' >&2
  exit 2
fi
node --import tsx --test --test-concurrency=2 tests/discovery/*.test.ts tests/discovery/*.test.mjs
node tests/discovery/ui.lifecycle.mjs
npx --no-install tsc --noEmit
