import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"

import type { ProxyConfig } from "../../src/renderer/types"
import type { RuleCostConfig } from "../../src/renderer/types/proxy"

const Module = require("node:module") as {
  _resolveFilename: (
    request: string,
    parent: { filename?: string } | undefined,
    isMain: boolean,
    options?: unknown
  ) => string
}

const repoRoot = path.resolve(__dirname, "../../../..")
const unitOutDir = path.join(repoRoot, ".tmp/unit-tests")
const originalResolveFilename = Module._resolveFilename

function resolveCompiledAlias(request: string): string | null {
  const aliasPrefixes = [
    { prefix: "@/components/", target: "src/renderer/components/" },
    { prefix: "@/hooks/", target: "src/renderer/hooks/" },
    { prefix: "@/types/", target: "src/renderer/types/" },
    { prefix: "@/utils/", target: "src/renderer/utils/" },
    { prefix: "@/contexts/", target: "src/renderer/contexts/" },
    { prefix: "@/i18n/", target: "src/renderer/i18n/" },
    { prefix: "@/pages/", target: "src/renderer/pages/" },
    { prefix: "@/renderer/", target: "src/renderer/" },
    { prefix: "@/", target: "src/renderer/" },
  ] as const

  for (const { prefix, target } of aliasPrefixes) {
    if (!request.startsWith(prefix)) continue

    const relativeModulePath = request.slice(prefix.length)
    const candidates = [
      path.join(unitOutDir, target, `${relativeModulePath}.js`),
      path.join(unitOutDir, target, relativeModulePath, "index.js"),
    ]

    const resolved = candidates.find(candidate => existsSync(candidate))
    if (resolved) return resolved
  }

  return null
}

Module._resolveFilename = (request, parent, isMain, options) => {
  const compiledAliasPath = resolveCompiledAlias(request)
  if (compiledAliasPath) {
    return compiledAliasPath
  }

  return originalResolveFilename(request, parent, isMain, options)
}

function loadProxyActions() {
  return require("../../src/renderer/store/proxyActions") as typeof import("../../src/renderer/store/proxyActions")
}

function createCost(overrides: Partial<RuleCostConfig> = {}): RuleCostConfig {
  return {
    enabled: overrides.enabled ?? true,
    inputPricePerM: overrides.inputPricePerM ?? 1.25,
    outputPricePerM: overrides.outputPricePerM ?? 6.5,
    cacheInputPricePerM: overrides.cacheInputPricePerM ?? 0.5,
    cacheOutputPricePerM: overrides.cacheOutputPricePerM ?? 0.25,
    currency: overrides.currency ?? "USD",
    template: overrides.template ?? null,
  }
}

function createConfig(): ProxyConfig {
  const legacyTopLevelCost = createCost()
  const staleCost = createCost({
    inputPricePerM: 99,
    outputPricePerM: 99,
    cacheInputPricePerM: 99,
    cacheOutputPricePerM: 99,
    currency: "JPY",
  })

  return {
    server: {
      host: "0.0.0.0",
      port: 8899,
      authEnabled: false,
      localBearerToken: "",
    },
    compat: {
      strictMode: false,
      textToolCallFallbackEnabled: true,
      headerPassthroughEnabled: true,
    },
    logging: {
      captureBody: false,
    },
    ui: {
      theme: "light",
      locale: "en-US",
      localeMode: "auto",
      launchOnStartup: false,
      autoStartServer: true,
      closeToTray: true,
      quotaAutoRefreshMinutes: 5,
      autoUpdateEnabled: true,
    },
    remoteGit: {
      enabled: false,
      repoUrl: "",
      token: "",
      branch: "main",
    },
    providers: [
      {
        id: "provider-top-level",
        name: "Provider Top Level",
        protocol: "openai",
        token: "secret",
        apiAddress: "https://example.com/v1",
        models: [" gpt-4.1 ", "gpt-4o-mini", "gpt-4.1"],
        quota: {
          enabled: false,
          provider: "",
          endpoint: "",
          method: "GET",
          useRuleToken: false,
          customToken: "",
          authHeader: "Authorization",
          authScheme: "Bearer",
          customHeaders: {},
          unitType: "percentage",
          lowThresholdPercent: 20,
          response: {},
        },
        cost: legacyTopLevelCost,
      },
      {
        id: "provider-model-costs",
        name: "Provider Model Costs",
        protocol: "anthropic",
        token: "secret",
        apiAddress: "https://example.com/v1",
        models: ["claude-sonnet-4", "claude-opus-4"],
        quota: {
          enabled: false,
          provider: "",
          endpoint: "",
          method: "GET",
          useRuleToken: false,
          customToken: "",
          authHeader: "Authorization",
          authScheme: "Bearer",
          customHeaders: {},
          unitType: "percentage",
          lowThresholdPercent: 20,
          response: {},
        },
        cost: createCost({
          enabled: false,
          inputPricePerM: 0,
          outputPricePerM: 0,
          cacheInputPricePerM: 0,
          cacheOutputPricePerM: 0,
        }),
        modelCosts: {
          " claude-sonnet-4 ": createCost({
            inputPricePerM: 3,
            outputPricePerM: 15,
            cacheInputPricePerM: 0,
            cacheOutputPricePerM: 0,
          }),
          stale: staleCost,
        },
      },
    ],
    groups: [],
  }
}

test("normalizeConfig migrates legacy provider cost and prunes stale modelCosts entries", () => {
  const { __testNormalizeConfig } = loadProxyActions()
  const normalized = __testNormalizeConfig(createConfig())

  assert.deepEqual(normalized.providers?.[0]?.models, ["gpt-4.1", "gpt-4o-mini"])
  assert.deepEqual(normalized.providers?.[0]?.modelCosts, {
    "gpt-4.1": createCost(),
    "gpt-4o-mini": createCost(),
  })
  assert.deepEqual(normalized.providers?.[1]?.modelCosts, {
    "claude-sonnet-4": createCost({
      inputPricePerM: 3,
      outputPricePerM: 15,
      cacheInputPricePerM: 0,
      cacheOutputPricePerM: 0,
    }),
  })
  assert.ok(!(" claude-sonnet-4 " in (normalized.providers?.[1]?.modelCosts ?? {})))
})
