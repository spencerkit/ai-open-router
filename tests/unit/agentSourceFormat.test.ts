import assert from "node:assert/strict"
import { test } from "node:test"

import {
  formatAgentSourceDraft,
  getDirtySourceIds,
  getSourceDraftStatus,
  hasDirtySourceDrafts,
  mergeReloadedSourceDrafts,
} from "../../src/renderer/utils/agentSourceFormat"

test("formatAgentSourceDraft pretty prints OpenClaw JSON source", () => {
  const result = formatAgentSourceDraft(
    "openclaw",
    '{"models":{"providers":{"aor_shared":{"api":"openai-responses"}}}}'
  )

  assert.equal(
    result,
    '{\n  "models": {\n    "providers": {\n      "aor_shared": {\n        "api": "openai-responses"\n      }\n    }\n  }\n}'
  )
})

test("getDirtySourceIds returns every changed source tab", () => {
  const result = getDirtySourceIds(
    [
      {
        sourceId: "primary",
        label: "openclaw.json",
        filePath: "/tmp/openclaw.json",
        content: "{}",
      },
      {
        sourceId: "models",
        label: "models.json",
        filePath: "/tmp/models.json",
        content: "{}",
      },
    ],
    {
      primary: "{}",
      models: '{\n  "providers": {}\n}',
    }
  )

  assert.deepEqual(result, ["models"])
})

test("mergeReloadedSourceDrafts preserves inactive dirty tabs after saving another file", () => {
  const result = mergeReloadedSourceDrafts(
    [
      {
        sourceId: "primary",
        label: "openclaw.json",
        filePath: "/tmp/openclaw.json",
        content: "{}",
      },
      {
        sourceId: "models",
        label: "models.json",
        filePath: "/tmp/models.json",
        content: "{}",
      },
    ],
    {
      primary: '{\n  "agents": {}\n}',
      models: '{\n  "providers": {}\n}',
    },
    [
      {
        sourceId: "primary",
        label: "openclaw.json",
        filePath: "/tmp/openclaw.json",
        content: '{\n  "agents": {}\n}',
      },
      {
        sourceId: "models",
        label: "models.json",
        filePath: "/tmp/models.json",
        content: "{}",
      },
    ],
    "primary"
  )

  assert.deepEqual(result, {
    primary: '{\n  "agents": {}\n}',
    models: '{\n  "providers": {}\n}',
  })
})

test("hasDirtySourceDrafts checks all source tabs", () => {
  const result = hasDirtySourceDrafts(
    [
      {
        sourceId: "primary",
        label: "openclaw.json",
        filePath: "/tmp/openclaw.json",
        content: "{}",
      },
      {
        sourceId: "models",
        label: "models.json",
        filePath: "/tmp/models.json",
        content: "{}",
      },
    ],
    {
      primary: "{}",
      models: '{\n  "providers": {}\n}',
    }
  )

  assert.equal(result, true)
})

test("getSourceDraftStatus reports when only another tab is dirty", () => {
  const result = getSourceDraftStatus(
    [
      {
        sourceId: "primary",
        label: "openclaw.json",
        filePath: "/tmp/openclaw.json",
        content: "{}",
      },
      {
        sourceId: "models",
        label: "models.json",
        filePath: "/tmp/models.json",
        content: "{}",
      },
    ],
    {
      primary: "{}",
      models: '{\n  "providers": {}\n}',
    },
    "primary"
  )

  assert.equal(result, "inactive-dirty")
})

test("formatAgentSourceDraft leaves invalid source unchanged", () => {
  const result = formatAgentSourceDraft("openclaw", "{")

  assert.equal(result, "{")
})
