import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { enUS } from "../../src/renderer/i18n/en-US"
import type { Provider, RouteEntry } from "../../src/renderer/types"

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
type TestState<T> = { current: T }

type ReactElementNode = React.ReactElement<UnknownProps>
type InputElementNode = React.ReactElement<React.ComponentProps<"input">>
type SelectElementNode = React.ReactElement<React.ComponentProps<"select">>
type ButtonElementNode = React.ReactElement<React.ComponentProps<"button">>

const unitOutDir = path.join(process.cwd(), ".tmp/unit-tests")
const originalResolveFilename = Module._resolveFilename
const originalCssExtension = require.extensions[".css"]

const onSaveCalls: RouteEntry[][] = []
const propsState: TestState<{
  providers: Provider[]
  routes: RouteEntry[]
}> = {
  current: {
    providers: [],
    routes: [],
  },
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
  if (request === "@/components" || request === "react-i18next") {
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

require.cache["@/components"] = {
  exports: {
    Button: ({ children, ...props }: UnknownProps) =>
      React.createElement(
        "button",
        { type: "button", ...(props as Record<string, unknown>) },
        children as React.ReactNode
      ),
    Input: ({ label, hint, error, endAdornment, ...props }: UnknownProps) =>
      React.createElement(
        React.Fragment,
        null,
        label
          ? React.createElement(
              "label",
              { htmlFor: props.id as string | undefined },
              label as React.ReactNode
            )
          : null,
        React.createElement("input", props),
        endAdornment ? React.createElement("span", null, endAdornment as React.ReactNode) : null,
        error ? React.createElement("p", { role: "alert" }, error as React.ReactNode) : null,
        !error && hint ? React.createElement("p", null, hint as React.ReactNode) : null
      ),
    Select: ({ options, placeholder, value, onChange, ...props }: UnknownProps) =>
      React.createElement(
        "select",
        {
          ...(props as Record<string, unknown>),
          value,
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
            (
              onChange as
                | ((nextValue: string, event: React.ChangeEvent<HTMLSelectElement>) => void)
                | undefined
            )?.(event.target.value, event),
        },
        [
          placeholder
            ? React.createElement(
                "option",
                { key: "__placeholder__", value: "", disabled: value !== "" },
                placeholder as React.ReactNode
              )
            : null,
          ...((options as Array<{ label: string; value: string; disabled?: boolean }>) ?? []).map(
            option =>
              React.createElement(
                "option",
                { key: option.value, value: option.value, disabled: option.disabled },
                option.label
              )
          ),
        ]
      ),
  },
  filename: "@/components",
  id: "@/components",
  loaded: true,
} as NodeModule

require.cache["react-i18next"] = {
  exports: {
    useTranslation: () => ({
      t: (key: string) => {
        // Resolve nested translation keys like "servicePage.routingTable"
        const parts = key.split(".")
        let value: unknown = enUS
        for (const part of parts) {
          if (value && typeof value === "object" && part in value) {
            value = (value as Record<string, unknown>)[part]
          } else {
            return key // Return key if not found
          }
        }
        return typeof value === "string" ? value : key
      },
      i18n: {
        changeLanguage: () => Promise.resolve(),
        language: "en",
      },
    }),
  },
  filename: "react-i18next",
  id: "react-i18next",
  loaded: true,
} as NodeModule

function loadRoutingTableEditor() {
  return require("../../src/renderer/pages/ServicePage/RoutingTableEditor") as typeof import("../../src/renderer/pages/ServicePage/RoutingTableEditor")
}

function createProvider(overrides: Partial<Provider>): Provider {
  return {
    id: overrides.id ?? "provider-1",
    name: overrides.name ?? "Provider One",
    protocol: overrides.protocol ?? "openai",
    token: overrides.token ?? "secret",
    apiAddress: overrides.apiAddress ?? "https://provider.example.com/v1",
    models: overrides.models ?? ["model-a", "model-b"],
    quota: overrides.quota ?? {
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
  }
}

function resolveRenderedTree(node: React.ReactNode): React.ReactNode {
  if (Array.isArray(node)) {
    return node.map(child => resolveRenderedTree(child))
  }
  if (!React.isValidElement(node)) {
    return node
  }

  const element = node as ReactElementNode
  if (typeof element.type === "function") {
    return resolveRenderedTree(
      (element.type as (props: UnknownProps) => React.ReactNode)(element.props)
    )
  }

  const children = resolveRenderedTree(element.props.children as React.ReactNode)
  return React.cloneElement(element, element.props, children)
}

function createComponentHarness() {
  let slots: unknown[] = []
  let effectDependencySlots: Array<readonly unknown[] | undefined> = []

  const renderOnce = () => {
    const originalUseState = React.useState
    const originalUseEffect = React.useEffect
    const originalUseMemo = React.useMemo
    let stateCallIndex = 0
    let effectCallIndex = 0

    React.useState = ((initialState?: unknown) => {
      const slotIndex = stateCallIndex
      stateCallIndex += 1
      if (!(slotIndex in slots)) {
        slots[slotIndex] =
          typeof initialState === "function" ? (initialState as () => unknown)() : initialState
      }
      const setValue = (nextValue: unknown) => {
        slots[slotIndex] =
          typeof nextValue === "function"
            ? (nextValue as (previous: unknown) => unknown)(slots[slotIndex])
            : nextValue
      }
      return [slots[slotIndex], setValue]
    }) as unknown as typeof React.useState
    React.useEffect = ((effect: () => void, dependencies?: readonly unknown[]) => {
      const slotIndex = effectCallIndex
      effectCallIndex += 1

      const previousDependencies = effectDependencySlots[slotIndex]
      const shouldRun =
        !dependencies ||
        !previousDependencies ||
        dependencies.length !== previousDependencies.length ||
        dependencies.some(
          (dependency, index) => !Object.is(dependency, previousDependencies[index])
        )

      effectDependencySlots[slotIndex] = dependencies
      if (shouldRun) {
        effect()
      }
    }) as unknown as typeof React.useEffect
    React.useMemo = ((factory: () => unknown) => factory()) as typeof React.useMemo

    try {
      const { RoutingTableEditor } = loadRoutingTableEditor()
      return resolveRenderedTree(
        React.createElement(RoutingTableEditor, {
          providers: propsState.current.providers,
          routes: propsState.current.routes,
          onSave: (routes: RouteEntry[]) => onSaveCalls.push(routes),
        })
      )
    } finally {
      React.useState = originalUseState
      React.useEffect = originalUseEffect
      React.useMemo = originalUseMemo
    }
  }

  const renderReady = () => {
    let previousTree: React.ReactNode = null
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const tree = renderOnce()
      if (tree === previousTree) {
        return tree
      }
      previousTree = tree
    }
    return previousTree
  }

  return {
    renderReady,
    reset() {
      slots = []
      effectDependencySlots = []
    },
  }
}

function findElement(
  node: React.ReactNode,
  predicate: (element: ReactElementNode) => boolean
): ReactElementNode | null {
  if (!node) return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate)
      if (match) return match
    }
    return null
  }
  if (!React.isValidElement(node)) {
    return null
  }

  const element = node as ReactElementNode
  if (predicate(element)) {
    return element
  }

  return findElement(element.props.children as React.ReactNode, predicate)
}

function findAllElements(
  node: React.ReactNode,
  predicate: (element: ReactElementNode) => boolean,
  results: ReactElementNode[] = []
): ReactElementNode[] {
  if (!node) return results
  if (Array.isArray(node)) {
    for (const child of node) {
      findAllElements(child, predicate, results)
    }
    return results
  }
  if (!React.isValidElement(node)) {
    return results
  }

  const element = node as ReactElementNode
  if (predicate(element)) {
    results.push(element)
  }

  findAllElements(element.props.children as React.ReactNode, predicate, results)
  return results
}

function createInputChangeEvent(value: string): React.ChangeEvent<HTMLInputElement> {
  return { target: { value } } as unknown as React.ChangeEvent<HTMLInputElement>
}

function createSelectChangeEvent(value: string): React.ChangeEvent<HTMLSelectElement> {
  return { target: { value } } as unknown as React.ChangeEvent<HTMLSelectElement>
}

function resetHarness({
  providers,
  routes,
}: {
  providers?: Provider[]
  routes?: RouteEntry[]
} = {}) {
  propsState.current = {
    providers: providers ?? [],
    routes: routes ?? [{ requestModel: "default", providerId: "", targetModel: "" }],
  }
  onSaveCalls.length = 0
}

function _findInputs(tree: React.ReactNode): InputElementNode[] {
  return findAllElements(tree, node => node.type === "input") as InputElementNode[]
}

function _findSelects(tree: React.ReactNode): SelectElementNode[] {
  return findAllElements(tree, node => node.type === "select") as SelectElementNode[]
}

function findButtons(tree: React.ReactNode): ButtonElementNode[] {
  return findAllElements(tree, node => node.type === "button") as ButtonElementNode[]
}

function findSelectByLabel(tree: React.ReactNode, ariaLabel: string): SelectElementNode {
  const select = findElement(
    tree,
    node => node.type === "select" && node.props["aria-label"] === ariaLabel
  ) as SelectElementNode | null
  assert.ok(select)
  return select
}

function findInputByLabel(tree: React.ReactNode, ariaLabel: string): InputElementNode {
  const input = findElement(
    tree,
    node => node.type === "input" && node.props["aria-label"] === ariaLabel
  ) as InputElementNode | null
  assert.ok(input)
  return input
}

function findButtonByText(tree: React.ReactNode, text: string): ButtonElementNode {
  const button = findButtons(tree).find(item => renderToStaticMarkup(item).includes(text))
  assert.ok(button)
  return button
}

function findButtonByAriaLabel(tree: React.ReactNode, ariaLabel: string): ButtonElementNode {
  const button = findElement(
    tree,
    node => node.type === "button" && node.props["aria-label"] === ariaLabel
  ) as ButtonElementNode | null
  assert.ok(button)
  return button
}

test("renders default route with disabled target model until provider is selected", () => {
  resetHarness()
  const harness = createComponentHarness()

  const tree = harness.renderReady()
  const requestModelInput = findInputByLabel(tree, "Request model 1")
  const targetModelSelect = findSelectByLabel(tree, "Target model 1")
  const markup = renderToStaticMarkup(tree as React.ReactElement)

  assert.equal(requestModelInput.props.value, "default")
  assert.equal(requestModelInput.props.readOnly, true)
  assert.equal(targetModelSelect.props.disabled, true)
  assert.match(markup, /Routing Table/)
  assert.match(markup, /Save/)
})

test("keeps target model disabled when selected provider has no models", () => {
  resetHarness({
    providers: [createProvider({ id: "empty", name: "Empty Provider", models: [] })],
    routes: [{ requestModel: "default", providerId: "empty", targetModel: "" }],
  })
  const harness = createComponentHarness()

  const tree = harness.renderReady()
  const targetModelSelect = findSelectByLabel(tree, "Target model 1")
  const markup = renderToStaticMarkup(tree as React.ReactElement)

  assert.equal(targetModelSelect.props.disabled, true)
  assert.match(markup, />Target Model</)
  assert.doesNotMatch(markup, /model-a/)
})

test("clears target model when provider changes to one that does not support it", () => {
  resetHarness({
    providers: [
      createProvider({ id: "p1", name: "Provider One", models: ["model-a", "model-b"] }),
      createProvider({ id: "p2", name: "Provider Two", models: ["model-c"] }),
    ],
    routes: [{ requestModel: "default", providerId: "p1", targetModel: "model-b" }],
  })
  const harness = createComponentHarness()

  let tree = harness.renderReady()
  findSelectByLabel(tree, "Provider 1").props.onChange?.(createSelectChangeEvent("p2"))

  tree = harness.renderReady()
  const providerSelect = findSelectByLabel(tree, "Provider 1")
  const targetModelSelect = findSelectByLabel(tree, "Target model 1")

  assert.equal(providerSelect.props.value, "p2")
  assert.equal(targetModelSelect.props.value, "")
  const optionMarkup = renderToStaticMarkup(targetModelSelect as React.ReactElement)
  assert.match(optionMarkup, /model-c/)
  assert.doesNotMatch(optionMarkup, /model-b/)
})

test("applies template routes, adds route, and removes non-default route", () => {
  resetHarness({
    providers: [createProvider({ id: "p1", models: ["claude-opus-3-5", "claude-sonnet-4"] })],
  })
  const harness = createComponentHarness()

  let tree = harness.renderReady()
  findSelectByLabel(tree, "Routing template").props.onChange?.(
    createSelectChangeEvent("claude-code")
  )

  tree = harness.renderReady()
  let markup = renderToStaticMarkup(tree as React.ReactElement)
  assert.match(markup, /opus/)
  assert.match(markup, /sonnet/)
  assert.match(markup, /haiku/)

  const addButton = findButtonByText(tree, "Add Route")
  addButton.props.onClick?.({} as React.MouseEvent<HTMLButtonElement>)

  tree = harness.renderReady()
  findButtonByAriaLabel(tree, "Remove Route").props.onClick?.(
    {} as React.MouseEvent<HTMLButtonElement>
  )

  tree = harness.renderReady()
  markup = renderToStaticMarkup(tree as React.ReactElement)
  assert.doesNotMatch(markup, /request-model-1" value="opus"/)
})

test("prevents save when default route is missing and surfaces validation message", () => {
  resetHarness({
    routes: [{ requestModel: "sonnet", providerId: "", targetModel: "" }],
  })
  const harness = createComponentHarness()

  const tree = harness.renderReady()
  const saveButton = findButtonByText(tree, "Save")
  saveButton.props.onClick?.({} as React.MouseEvent<HTMLButtonElement>)

  const updatedTree = harness.renderReady()
  const markup = renderToStaticMarkup(updatedTree as React.ReactElement)

  assert.equal(onSaveCalls.length, 0)
  assert.match(markup, /Routing table must contain a default rule/)
})

test("saves current draft routes after edits", () => {
  resetHarness({
    providers: [createProvider({ id: "p1", models: ["model-a", "model-b"] })],
  })
  const harness = createComponentHarness()

  let tree = harness.renderReady()
  const addButton = findButtonByText(tree, "Add Route")
  addButton.props.onClick?.({} as React.MouseEvent<HTMLButtonElement>)

  tree = harness.renderReady()
  findInputByLabel(tree, "Request model 2").props.onChange?.(createInputChangeEvent("sonnet"))

  tree = harness.renderReady()
  findSelectByLabel(tree, "Provider 2").props.onChange?.(createSelectChangeEvent("p1"))

  tree = harness.renderReady()
  findSelectByLabel(tree, "Target model 2").props.onChange?.(createSelectChangeEvent("model-b"))

  tree = harness.renderReady()
  const saveButton = findButtonByText(tree, "Save")
  saveButton.props.onClick?.({} as React.MouseEvent<HTMLButtonElement>)

  assert.deepEqual(onSaveCalls[0], [
    { requestModel: "default", providerId: "", targetModel: "" },
    { requestModel: "sonnet", providerId: "p1", targetModel: "model-b" },
  ])
})

process.on("exit", () => {
  Module._resolveFilename = originalResolveFilename
  if (originalCssExtension) {
    require.extensions[".css"] = originalCssExtension
    return
  }
  delete require.extensions[".css"]
})
