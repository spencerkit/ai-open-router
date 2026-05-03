import assert from "node:assert/strict"
import { test } from "node:test"

import { httpApi } from "../../src/renderer/utils/http"

type FetchCall = {
  input: string | URL | Request
  init?: RequestInit
}

const originalFetch = globalThis.fetch
const originalWindow = globalThis.window

function installHttpHarness(calls: FetchCall[]) {
  ;(globalThis as { window?: unknown }).window = {
    location: {
      protocol: "http:",
      origin: "http://example.test:8899",
    },
    __AOR_HTTP_BASE__: "http://example.test:8899",
  } as Window & { __AOR_HTTP_BASE__?: string }

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input, init })
    return new Response(
      JSON.stringify({
        dimension: "rule",
        hours: 24,
        ruleKey: null,
        ruleKeys: ["group-a::provider-1", "group-b::provider-2"],
        requests: 0,
        errors: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalCost: 0,
        costCurrency: null,
        inputTps: 0,
        outputTps: 0,
        peakInputTps: 0,
        peakOutputTps: 0,
        comparison: null,
        breakdowns: null,
        hourly: [],
        options: [],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    )
  }) as typeof fetch
}

function restoreHttpHarness() {
  globalThis.fetch = originalFetch
  if (originalWindow === undefined) {
    ;(globalThis as { window?: unknown }).window = undefined
  } else {
    ;(globalThis as { window?: unknown }).window = originalWindow
  }
}

test("httpApi.getLogsStatsSummary serializes ruleKeys as a single CSV query field", async () => {
  const calls: FetchCall[] = []
  installHttpHarness(calls)

  try {
    await httpApi.getLogsStatsSummary(
      24,
      ["group-a::provider-1", "group-b::provider-2"],
      undefined,
      "rule",
      true,
      "gpt-5.5"
    )
  } finally {
    restoreHttpHarness()
  }

  assert.equal(calls.length, 1)
  assert.equal(
    String(calls[0]?.input),
    "http://example.test:8899/api/logs/stats/summary?hours=24&ruleKeys=group-a%3A%3Aprovider-1%2Cgroup-b%3A%3Aprovider-2&dimension=rule&enableComparison=true&model=gpt-5.5"
  )
  assert.equal(calls[0]?.init?.method, "GET")
})
