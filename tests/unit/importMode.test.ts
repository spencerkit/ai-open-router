import assert from "node:assert/strict"
import { test } from "node:test"

import {
  buildImportRequest,
  canConfirmImportRequest,
  type ImportSource,
} from "../../src/renderer/utils/importMode"

test("buildImportRequest returns file source with empty payload", () => {
  const result = buildImportRequest({
    source: "file" satisfies ImportSource,
    jsonText: "ignored",
  })

  assert.deepEqual(result, {
    source: "file",
    payload: {},
  })
})

test("buildImportRequest returns clipboard source with json text", () => {
  const result = buildImportRequest({
    source: "clipboard" satisfies ImportSource,
    jsonText: '{"groups":[]}',
  })

  assert.deepEqual(result, {
    source: "clipboard",
    payload: {
      jsonText: '{"groups":[]}',
    },
  })
})

test("canConfirmImportRequest requires JSON text only for clipboard imports", () => {
  assert.equal(canConfirmImportRequest({ source: "file", jsonText: "" }), true)
  assert.equal(canConfirmImportRequest({ source: "clipboard", jsonText: "   " }), false)
  assert.equal(canConfirmImportRequest({ source: "clipboard", jsonText: '{"groups":[]}' }), true)
})
