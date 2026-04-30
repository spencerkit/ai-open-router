import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import type { AuthSessionStatus } from "../../src/renderer/types"

const Module = require("node:module") as {
  _resolveFilename: (
    request: string,
    parent: { filename?: string } | undefined,
    isMain: boolean,
    options?: unknown
  ) => string
}

type UnknownProps = Record<string, unknown>
type LocationShape = {
  pathname: string
  search: string
}

const repoRoot = path.resolve(__dirname, "../../../..")
const unitOutDir = path.join(repoRoot, ".tmp/unit-tests")
const originalResolveFilename = Module._resolveFilename

let currentLocation: LocationShape = {
  pathname: "/settings",
  search: "",
}
let renderedNavigateProps: UnknownProps | null = null
let renderedLoginProps: { onSubmit: (password: string) => Promise<void> } | null = null
const navigateCalls: Array<{ to: string; options?: unknown }> = []

function resolveCompiledAlias(request: string): string | null {
  const aliasPrefixes = [
    { prefix: "@/pages/", target: "src/renderer/pages/" },
    { prefix: "@/types/", target: "src/renderer/types/" },
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
    if (resolved) {
      return resolved
    }
  }

  return null
}

Module._resolveFilename = (request, parent, isMain, options) => {
  if (request === "react-router-dom" || request === "@/components") {
    return request
  }

  const compiledAliasPath = resolveCompiledAlias(request)
  if (compiledAliasPath) {
    return compiledAliasPath
  }

  return originalResolveFilename(request, parent, isMain, options)
}

require.cache["react-router-dom"] = {
  exports: {
    Navigate: (props: UnknownProps) => {
      renderedNavigateProps = props
      return React.createElement("mock-navigate", props)
    },
    useLocation: () => currentLocation,
    useNavigate: () => (to: string, options?: unknown) => {
      navigateCalls.push({ to, options })
    },
  },
  filename: "react-router-dom",
  id: "react-router-dom",
  loaded: true,
} as NodeModule

require.cache["@/components"] = {
  exports: {
    RemoteManagementLogin: (props: { onSubmit: (password: string) => Promise<void> }) => {
      renderedLoginProps = props
      return React.createElement("mock-login")
    },
  },
  filename: "@/components",
  id: "@/components",
  loaded: true,
} as NodeModule

function loadManagementAuthModule() {
  return require("../../src/renderer/pages/ManagementAuthPage/ManagementAuthPage") as typeof import("../../src/renderer/pages/ManagementAuthPage/ManagementAuthPage")
}

function resetHarness() {
  currentLocation = {
    pathname: "/settings",
    search: "",
  }
  renderedNavigateProps = null
  renderedLoginProps = null
  navigateCalls.length = 0
}

const lockedSession: AuthSessionStatus = {
  authenticated: false,
  remoteRequest: true,
  passwordConfigured: true,
}

test("RequireManagementAuth redirects locked management routes to /auth with next", () => {
  resetHarness()
  currentLocation = {
    pathname: "/settings",
    search: "?tab=advanced",
  }

  const { RequireManagementAuth } = loadManagementAuthModule()

  renderToStaticMarkup(
    React.createElement(
      RequireManagementAuth,
      {
        authSession: lockedSession,
        isHeadlessRuntime: true,
      },
      React.createElement("div", null, "protected")
    )
  )

  assert.equal(renderedNavigateProps?.to, "/auth?next=%2Fsettings%3Ftab%3Dadvanced")
  assert.equal(renderedNavigateProps?.replace, true)
})

test("ManagementAuthPage renders the login form for locked remote sessions", () => {
  resetHarness()
  currentLocation = {
    pathname: "/auth",
    search: "?next=%2Fmanagement%2Fsettings",
  }

  const { ManagementAuthPage } = loadManagementAuthModule()

  renderToStaticMarkup(
    React.createElement(ManagementAuthPage, {
      authSession: lockedSession,
      isHeadlessRuntime: true,
      onSubmit: async () => undefined,
    })
  )

  assert.ok(renderedLoginProps)
})

test("ManagementAuthPage navigates to sanitized next target after successful login", async () => {
  resetHarness()
  currentLocation = {
    pathname: "/auth",
    search: "?next=%2Fmanagement%2Fsettings",
  }

  let submittedPassword = ""
  const { ManagementAuthPage } = loadManagementAuthModule()

  renderToStaticMarkup(
    React.createElement(ManagementAuthPage, {
      authSession: lockedSession,
      isHeadlessRuntime: true,
      onSubmit: async (password: string) => {
        submittedPassword = password
      },
    })
  )

  assert.ok(renderedLoginProps)
  await renderedLoginProps?.onSubmit("Passw0rd!")

  assert.equal(submittedPassword, "Passw0rd!")
  assert.deepEqual(navigateCalls, [
    {
      to: "/settings",
      options: { replace: true },
    },
  ])
})
