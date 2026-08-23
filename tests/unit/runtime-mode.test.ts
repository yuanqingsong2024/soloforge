import test from 'node:test'
import assert from 'node:assert/strict'
import { isE2ETestMode, isPackagedRuntime } from '../../src/main/runtime-mode'

test('packaged runtime is controlled by the runtime marker', () => {
  const previous = process.env.SOLOFORGE_PACKAGED
  try {
    process.env.SOLOFORGE_PACKAGED = '1'
    assert.equal(isPackagedRuntime(), true)
    process.env.SOLOFORGE_PACKAGED = '0'
    assert.equal(isPackagedRuntime(), false)
  } finally {
    if (previous === undefined) delete process.env.SOLOFORGE_PACKAGED
    else process.env.SOLOFORGE_PACKAGED = previous
  }
})

test('E2E bypass is disabled for packaged runtime', () => {
  const previousPackaged = process.env.SOLOFORGE_PACKAGED
  const previousE2e = process.env.SOLOFORGE_E2E
  try {
    process.env.SOLOFORGE_E2E = '1'
    process.env.SOLOFORGE_PACKAGED = '0'
    assert.equal(isE2ETestMode(), true)
    process.env.SOLOFORGE_PACKAGED = '1'
    assert.equal(isE2ETestMode(), false)
  } finally {
    if (previousPackaged === undefined) delete process.env.SOLOFORGE_PACKAGED
    else process.env.SOLOFORGE_PACKAGED = previousPackaged
    if (previousE2e === undefined) delete process.env.SOLOFORGE_E2E
    else process.env.SOLOFORGE_E2E = previousE2e
  }
})
