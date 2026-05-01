import assert from "node:assert/strict"
import { test } from "node:test"

test("shouldShowBootstrapLoading hides bootstrap spinner when remote auth blocks initialization", () => {
  const guards = require("../../src/renderer/appViewGuards") as {
    shouldShowBootstrapLoading: (input: {
      bootstrapping: boolean
      bootstrapError: string | null
      hasConfig: boolean
      hasStatus: boolean
      canInitialize: boolean
    }) => boolean
  }

  assert.equal(
    guards.shouldShowBootstrapLoading({
      bootstrapping: true,
      bootstrapError: null,
      hasConfig: false,
      hasStatus: false,
      canInitialize: false,
    }),
    false
  )
})

test("shouldShowBootstrapLoading keeps bootstrap spinner for normal initialization", () => {
  const guards = require("../../src/renderer/appViewGuards") as {
    shouldShowBootstrapLoading: (input: {
      bootstrapping: boolean
      bootstrapError: string | null
      hasConfig: boolean
      hasStatus: boolean
      canInitialize: boolean
    }) => boolean
  }

  assert.equal(
    guards.shouldShowBootstrapLoading({
      bootstrapping: true,
      bootstrapError: null,
      hasConfig: false,
      hasStatus: false,
      canInitialize: true,
    }),
    true
  )
})
