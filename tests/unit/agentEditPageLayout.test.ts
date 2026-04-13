import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import type { TranslateFunction } from "../../src/renderer/hooks/useTranslation"
import type { AgentSourceFile, IntegrationClientKind } from "../../src/renderer/types"

const Module = require("node:module") as {
  _resolveFilename: (
    request: string,
    parent: { filename?: string } | undefined,
    isMain: boolean,
    options?: unknown
  ) => string
}

type CssModuleExports = Record<string, string>

const unitOutDir = path.join(process.cwd(), ".tmp/unit-tests")
const originalResolveFilename = Module._resolveFilename
const originalCssExtension = require.extensions[".css"]

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

function loadAgentSourceTabs() {
  return require("../../src/renderer/pages/AgentEditPage/AgentSourceTabs") as typeof import("../../src/renderer/pages/AgentEditPage/AgentSourceTabs")
}

const t: TranslateFunction = (key, options) => {
  if (options && "format" in options) {
    return `${key}:${String(options.format)}`
  }
  return key
}

function renderSourceTabs(input: {
  kind: IntegrationClientKind
  sourceFiles?: AgentSourceFile[]
  activeSourceFile?: AgentSourceFile
  sourceContent?: string
  sourcePlaceholder?: string
  metaFormat?: string
  dirtySourceIds?: string[]
}) {
  const sourceFiles = input.sourceFiles ?? [
    {
      sourceId: "primary",
      label: "openclaw.json",
      filePath: "/tmp/openclaw.json",
      content: "{}",
    },
  ]

  const { AgentSourceTabs } = loadAgentSourceTabs()

  return renderToStaticMarkup(
    React.createElement(AgentSourceTabs, {
      kind: input.kind,
      sourceFiles,
      activeSourceFile: input.activeSourceFile ?? sourceFiles[0],
      sourceContent: input.sourceContent ?? sourceFiles[0]?.content ?? "",
      sourcePlaceholder: input.sourcePlaceholder ?? "{}",
      metaFormat: input.metaFormat ?? "config.json",
      dirtySourceIds: input.dirtySourceIds ?? [],
      t,
      onSourceSelect: () => {},
      onSourceChange: () => {},
    })
  )
}

test("agent edit page is source-only", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/renderer/pages/AgentEditPage/AgentEditPage.tsx"),
    "utf8"
  )

  assert.doesNotMatch(source, /writeAgentConfigAction/)
  assert.doesNotMatch(source, /handleSaveForm/)
  assert.doesNotMatch(source, /\beditMode\b/)
  assert.doesNotMatch(source, /agentManagement\.formEditor/)
  assert.doesNotMatch(source, /AgentEditContent/)
  assert.match(source, /agentManagement\.sourceEditor/)
  assert.match(source, /agentManagement\.saveCurrentFile/)
})

test("source-only page keeps load callback independent from draft state", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/renderer/pages/AgentEditPage/AgentEditPage.tsx"),
    "utf8"
  )

  assert.match(source, /\[readAgentConfig, targetId\]/)
})

test("source-only page distinguishes inactive dirty tabs from the current file", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/renderer/pages/AgentEditPage/AgentEditPage.tsx"),
    "utf8"
  )

  assert.match(source, /agentManagement\.otherSourceChangesPending/)
  assert.match(source, /getSourceDraftStatus/)
})

test("shows format action in OpenClaw source editor", () => {
  const markup = renderSourceTabs({
    kind: "openclaw",
    sourceFiles: [
      {
        sourceId: "primary",
        label: "openclaw.json",
        filePath: "/tmp/openclaw.json",
        content: "{}",
      },
    ],
    sourceContent: "{}",
    metaFormat: "openclaw.json + agent files",
  })

  assert.match(markup, /agentManagement\.sourceEditor/)
  assert.match(markup, /agentManagement\.formatCurrentFile/)
})

test("shows OpenClaw source hint about validating related files", () => {
  const markup = renderSourceTabs({
    kind: "openclaw",
    sourceFiles: [
      {
        sourceId: "models",
        label: "models.json",
        filePath: "/tmp/agents/workspace-alpha/agent/models.json",
        content: "{}",
      },
    ],
    sourceContent: "{}",
    metaFormat: "openclaw.json + agent files",
  })

  assert.match(markup, /agentManagement\.openclawSourceValidationHint/)
})

test("marks dirty OpenClaw source tabs", () => {
  const markup = renderSourceTabs({
    kind: "openclaw",
    sourceFiles: [
      {
        sourceId: "primary",
        label: "openclaw.json",
        filePath: "/tmp/openclaw.json",
        content: "{}",
      },
      {
        sourceId: "models",
        label: "models.json",
        filePath: "/tmp/agents/workspace-alpha/agent/models.json",
        content: "{}",
      },
    ],
    activeSourceFile: {
      sourceId: "primary",
      label: "openclaw.json",
      filePath: "/tmp/openclaw.json",
      content: "{}",
    },
    sourceContent: "{}",
    metaFormat: "openclaw.json + agent files",
    dirtySourceIds: ["models"],
  })

  assert.match(markup, /models\.json \*/)
})

test("shows OpenClaw source files and active source hint", () => {
  const markup = renderSourceTabs({
    kind: "openclaw",
    sourceFiles: [
      {
        sourceId: "primary",
        label: "openclaw.json",
        filePath: "/tmp/openclaw.json",
        content: "{}",
      },
      {
        sourceId: "models",
        label: "models.json",
        filePath: "/tmp/agents/workspace-alpha/agent/models.json",
        content: "{}",
      },
    ],
    sourceContent: "{}",
    metaFormat: "openclaw.json + agent files",
  })

  assert.match(markup, /agentManagement\.sourceEditor/)
  assert.match(markup, /openclaw\.json/)
  assert.match(markup, /models\.json/)
  assert.match(markup, /agentManagement\.sourceHint:openclaw\.json/)
})

process.on("exit", () => {
  Module._resolveFilename = originalResolveFilename
  if (originalCssExtension) {
    require.extensions[".css"] = originalCssExtension
    return
  }
  delete require.extensions[".css"]
})
