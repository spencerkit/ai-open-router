import assert from "node:assert/strict"
import { test } from "node:test"

import type { AuthSessionStatus } from "../../src/renderer/types"

type CustomEventInitLike<T> = {
  detail?: T
}

type CustomEventLike<T> = Event & {
  detail: T
}

const originalFetch = globalThis.fetch
const originalWindow = globalThis.window
const originalCustomEvent = globalThis.CustomEvent
const Module = require("node:module") as {
  _resolveFilename: (
    request: string,
    parent: { filename?: string } | undefined,
    isMain: boolean,
    options?: unknown
  ) => string
}
const originalResolveFilename = Module._resolveFilename

Module._resolveFilename = (request, parent, isMain, options) => {
  if (request === "@/utils/authSession") {
    return request
  }
  return originalResolveFilename(request, parent, isMain, options)
}

require.cache["@/utils/authSession"] = {
  exports: {
    emitAuthSessionChanged: (status: AuthSessionStatus) => {
      window.dispatchEvent(new CustomEvent("aor:auth-session-changed", { detail: status }))
    },
  },
  filename: "@/utils/authSession",
  id: "@/utils/authSession",
  loaded: true,
} as NodeModule

function loadHttpModule() {
  return require("../../src/renderer/utils/http") as typeof import("../../src/renderer/utils/http")
}

function installHttpHarness(events: Event[]) {
  class TestCustomEvent<T> extends Event {
    detail: T

    constructor(type: string, init?: CustomEventInitLike<T>) {
      super(type)
      this.detail = (init?.detail ?? null) as T
    }
  }

  globalThis.CustomEvent = TestCustomEvent as unknown as typeof CustomEvent
  ;(globalThis as { window?: unknown }).window = {
    location: {
      protocol: "http:",
      origin: "http://example.test:8899",
    },
    __AOR_HTTP_BASE__: "http://example.test:8899",
    dispatchEvent(event: Event) {
      events.push(event)
      return true
    },
  } as Window & { __AOR_HTTP_BASE__?: string }

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        error: {
          code: "authentication_required",
          message: "Remote management password required",
        },
      }),
      {
        status: 401,
        headers: {
          "content-type": "application/json",
        },
      }
    )
  }) as typeof fetch
}

function restoreHttpHarness() {
  globalThis.fetch = originalFetch
  globalThis.CustomEvent = originalCustomEvent
  if (originalWindow === undefined) {
    ;(globalThis as { window?: unknown }).window = undefined
  } else {
    ;(globalThis as { window?: unknown }).window = originalWindow
  }
}

test("httpApi preserves authentication_required metadata and broadcasts locked auth session", async () => {
  const events: Event[] = []
  installHttpHarness(events)

  try {
    const { HttpApiError, httpApi, isAuthenticationRequiredError } = loadHttpModule()
    await assert.rejects(
      () => httpApi.getConfig(),
      (error: unknown) => {
        assert.ok(error instanceof HttpApiError)
        assert.equal(error.status, 401)
        assert.equal(error.code, "authentication_required")
        assert.equal(error.message, "Remote management password required")
        assert.equal(isAuthenticationRequiredError(error), true)
        return true
      }
    )
  } finally {
    restoreHttpHarness()
  }

  assert.equal(events.length, 1)
  const session = (events[0] as CustomEventLike<AuthSessionStatus>).detail
  assert.deepEqual(session, {
    authenticated: false,
    remoteRequest: true,
    passwordConfigured: true,
  })
})
