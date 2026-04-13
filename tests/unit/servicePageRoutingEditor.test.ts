import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import type { ProxyConfig, RouteEntry } from "../../src/renderer/types"

const Module = require("node:module") as {
  _resolveFilename: (
    request: string,
    parent: { filename?: string } | undefined,
    isMain: boolean,
    options?: unknown
  ) => string
}

type CssModuleExports = Record<string, string>
type UnknownProps = Record<string, unknown>
type SaveConfigHandler = (config: ProxyConfig) => Promise<unknown>
type ToastCall = { message: string; type: string }

type RoutingEditorProps = {
  providers: ProxyConfig["providers"]
  routes: RouteEntry[]
  onSave: (routes: RouteEntry[]) => void
}

const unitOutDir = path.join(process.cwd(), ".tmp/unit-tests")
const originalResolveFilename = Module._resolveFilename
const originalCssExtension = require.extensions[".css"]

const configStateValue: { current: ProxyConfig | null } = { current: null }
const activeGroupIdValue: { current: string | null } = { current: "dev" }
const saveConfigCalls: ProxyConfig[] = []
const navigationCalls: string[] = []
const toastCalls: ToastCall[] = []
const routingEditorPropsCalls: RoutingEditorProps[] = []
let saveConfigImpl: SaveConfigHandler = async config => config

const translateImpl = (key: string) => key
const navigateImpl = (to: string) => navigationCalls.push(to)
const showToastImpl = (message: string, type: string) => {
  toastCalls.push({ message, type })
}

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
    { prefix: "@/store", target: "src/renderer/store/index" },
    { prefix: "@/", target: "src/" },
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
  if (
    request === "react-router-dom" ||
    request === "@/hooks" ||
    request === "@/store" ||
    request === "@/utils/relax" ||
    request === "@/components" ||
    request === "@/utils/runtime" ||
    request === "@/utils/serverAddress" ||
    request === "./RoutingTableEditor"
  ) {
    return request
  }

  const compiledAliasPath = resolveCompiledAlias(request)
  if (compiledAliasPath) {
    return compiledAliasPath
  }

  if (request.endsWith(".css") && parent?.filename) {
    const compiledCssPath = path.resolve(path.dirname(parent.filename), request)
    const sourceCssPath = compiledCssPath.replace(
      `${unitOutDir}${path.sep}`,
      `${process.cwd()}${path.sep}`
    )
    if (existsSync(sourceCssPath)) {
      return sourceCssPath
    }
  }

  return originalResolveFilename(request, parent, isMain, options)
}

require.extensions[".css"] = module => {
  module.exports = new Proxy<CssModuleExports>({} as CssModuleExports, {
    get: (_target, property) => String(property),
  })
}

require.cache["react-router-dom"] = {
  exports: {
    useNavigate: () => navigateImpl,
  },
  filename: "react-router-dom",
  id: "react-router-dom",
  loaded: true,
} as NodeModule

require.cache["@/hooks"] = {
  exports: {
    useLogs: () => ({ showToast: showToastImpl }),
    useTranslation: () => ({ t: translateImpl }),
  },
  filename: "@/hooks",
  id: "@/hooks",
  loaded: true,
} as NodeModule

require.cache["@/store"] = {
  exports: {
    activeGroupIdState: { key: "activeGroupIdState" },
    addIntegrationTargetAction: { key: "addIntegrationTargetAction" },
    clearIntegrationTargetsAction: { key: "clearIntegrationTargetsAction" },
    configState: { key: "configState" },
    integrationTargetsLoadingState: { key: "integrationTargetsLoadingState" },
    integrationTargetsState: { key: "integrationTargetsState" },
    loadIntegrationTargetsAction: { key: "loadIntegrationTargetsAction" },
    pickIntegrationDirectoryAction: { key: "pickIntegrationDirectoryAction" },
    readAgentConfigAction: { key: "readAgentConfigAction" },
    saveConfigAction: { key: "saveConfigAction" },
    setActiveGroupIdAction: { key: "setActiveGroupIdAction" },
    statusState: { key: "statusState" },
    updateIntegrationTargetAction: { key: "updateIntegrationTargetAction" },
    writeGroupEntryAction: { key: "writeGroupEntryAction" },
  },
  filename: "@/store",
  id: "@/store",
  loaded: true,
} as NodeModule

require.cache["@/utils/relax"] = {
  exports: {
    useRelaxValue: (state: { key?: string }) => {
      if (state?.key === "configState") return configStateValue.current
      if (state?.key === "activeGroupIdState") return activeGroupIdValue.current
      if (state?.key === "integrationTargetsState") return []
      if (state?.key === "integrationTargetsLoadingState") return false
      if (state?.key === "statusState") {
        return {
          address: "http://127.0.0.1:8899",
          lanAddress: "http://192.168.1.10:8899",
          groupRuntime: [],
        }
      }
      return null
    },
    useActions: () => [
      async (config: ProxyConfig) => {
        saveConfigCalls.push(config)
        return saveConfigImpl(config)
      },
      () => {},
      async () => [],
      () => {},
      async () => "",
      async () => ({ id: "target-1" }),
      async () => ({ id: "target-1" }),
      async () => ({ succeeded: 0, failed: 0, items: [] }),
      async () => ({ parsedConfig: { url: "" } }),
    ],
  },
  filename: "@/utils/relax",
  id: "@/utils/relax",
  loaded: true,
} as NodeModule

require.cache["@/components"] = {
  exports: {
    Button: ({ children, ...props }: UnknownProps) =>
      React.createElement(
        "button",
        { type: "button", ...(props as Record<string, unknown>) },
        children as React.ReactNode
      ),
    Input: (props: UnknownProps) => React.createElement("input", props),
    Modal: ({ children, open }: UnknownProps) =>
      open ? React.createElement("div", null, children as React.ReactNode) : null,
  },
  filename: "@/components",
  id: "@/components",
  loaded: true,
} as NodeModule

require.cache["@/utils/runtime"] = {
  exports: {
    isHeadlessHttpRuntime: () => false,
  },
  filename: "@/utils/runtime",
  id: "@/utils/runtime",
  loaded: true,
} as NodeModule

require.cache["@/utils/serverAddress"] = {
  exports: {
    resolveReachableServerBaseUrls: () => ["http://127.0.0.1:8899"],
  },
  filename: "@/utils/serverAddress",
  id: "@/utils/serverAddress",
  loaded: true,
} as NodeModule

require.cache["./RoutingTableEditor"] = {
  exports: {
    RoutingTableEditor: (props: RoutingEditorProps) => {
      routingEditorPropsCalls.push({
        providers: props.providers,
        routes: props.routes.map(route => ({ ...route })),
        onSave: props.onSave,
      })
      return React.createElement("section", { "data-testid": "routing-editor" }, "Routing editor")
    },
  },
  filename: "./RoutingTableEditor",
  id: "./RoutingTableEditor",
  loaded: true,
} as NodeModule

function loadServicePage() {
  return require("../../src/renderer/pages/ServicePage/ServicePage") as typeof import("../../src/renderer/pages/ServicePage/ServicePage")
}

function createConfig(): ProxyConfig {
  return {
    server: {
      host: "127.0.0.1",
      port: 8899,
      authEnabled: false,
      localBearerToken: "",
    },
    compat: {
      strictMode: false,
      textToolCallFallbackEnabled: true,
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
        id: "provider-1",
        name: "Provider One",
        protocol: "openai",
        token: "secret",
        apiAddress: "https://provider.example.com/v1",
        defaultModel: "model-a",
        models: ["model-a", "model-b"],
        modelMappings: {},
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
      },
    ],
    groups: [
      {
        id: "dev",
        name: "Development",
        routingTable: [
          { requestModel: "default", providerId: "provider-1", targetModel: "model-a" },
        ],
      },
    ],
  }
}

function resetHarness() {
  configStateValue.current = createConfig()
  activeGroupIdValue.current = "dev"
  saveConfigCalls.length = 0
  navigationCalls.length = 0
  toastCalls.length = 0
  routingEditorPropsCalls.length = 0
  saveConfigImpl = async config => config
}

test("renders routing table editor instead of provider list and passes active group routes", () => {
  resetHarness()
  const { ServicePage } = loadServicePage()

  const markup = renderToStaticMarkup(React.createElement(ServicePage))

  assert.match(markup, /Routing editor/)
  assert.equal(routingEditorPropsCalls.length, 1)
  const firstRenderProps = routingEditorPropsCalls[0]
  assert.ok(firstRenderProps)
  assert.deepEqual(firstRenderProps.routes, [
    { requestModel: "default", providerId: "provider-1", targetModel: "model-a" },
  ])
  const firstRenderProviders = firstRenderProps.providers ?? []
  assert.equal(firstRenderProviders[0]?.id, "provider-1")
  assert.doesNotMatch(markup, /Test All/)
})

test("saves routing table edits back into the active group only", async () => {
  resetHarness()
  const sourceConfig = createConfig()
  sourceConfig.groups.push({
    id: "prod",
    name: "Production",
    routingTable: [{ requestModel: "default", providerId: "", targetModel: "" }],
  })
  configStateValue.current = sourceConfig

  const { ServicePage } = loadServicePage()
  renderToStaticMarkup(React.createElement(ServicePage))

  const latestProps = routingEditorPropsCalls.at(-1)
  assert.ok(latestProps)

  await latestProps.onSave([
    { requestModel: "default", providerId: "provider-1", targetModel: "model-b" },
    { requestModel: "sonnet", providerId: "provider-1", targetModel: "model-a" },
  ])

  assert.equal(saveConfigCalls.length, 1)
  assert.deepEqual(saveConfigCalls[0]?.groups[0]?.routingTable, [
    { requestModel: "default", providerId: "provider-1", targetModel: "model-b" },
    { requestModel: "sonnet", providerId: "provider-1", targetModel: "model-a" },
  ])
  assert.deepEqual(saveConfigCalls[0]?.groups[1]?.routingTable, [
    { requestModel: "default", providerId: "", targetModel: "" },
  ])
  assert.deepEqual(sourceConfig.groups[0]?.routingTable, [
    { requestModel: "default", providerId: "provider-1", targetModel: "model-a" },
  ])
  assert.deepEqual(toastCalls.at(-1), { message: "toast.groupUpdated", type: "success" })
})

process.on("exit", () => {
  Module._resolveFilename = originalResolveFilename
  if (originalCssExtension) {
    require.extensions[".css"] = originalCssExtension
    return
  }
  delete require.extensions[".css"]
})
