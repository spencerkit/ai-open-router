import type { RouteEntry } from "../types/proxy"

export interface RoutingTemplate {
  id: string
  name: string
  routes: Array<{
    requestModel: string
    targetModel: string
  }>
}

export const ROUTING_TEMPLATES: RoutingTemplate[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    routes: [
      { requestModel: "claude-opus-4-7", targetModel: "claude-opus-4-7" },
      { requestModel: "claude-sonnet-4-6", targetModel: "claude-sonnet-4-6" },
      { requestModel: "claude-haiku-4-5", targetModel: "claude-haiku-4-5" },
    ],
  },
  {
    id: "codex",
    name: "Codex",
    routes: [
      { requestModel: "gpt-5.5", targetModel: "gpt-5.5" },
      { requestModel: "gpt-5-codex", targetModel: "gpt-5-codex" },
      { requestModel: "gpt-5.4-mini", targetModel: "gpt-5.4-mini" },
      { requestModel: "gpt-5.4-nano", targetModel: "gpt-5.4-nano" },
    ],
  },
  {
    id: "gemini",
    name: "Gemini",
    routes: [
      { requestModel: "gemini-2.5-pro", targetModel: "gemini-2.5-pro" },
      { requestModel: "gemini-2.5-flash", targetModel: "gemini-2.5-flash" },
      { requestModel: "gemini-2.0-flash", targetModel: "gemini-2.0-flash" },
    ],
  },
]

export function applyTemplateToRoutes(
  templateId: string,
  existingRoutes: RouteEntry[]
): RouteEntry[] {
  const template = ROUTING_TEMPLATES.find(t => t.id === templateId)
  if (!template) return existingRoutes

  const existingRequestModels = new Set(existingRoutes.map(r => r.requestModel))
  const newRoutes = template.routes
    .filter(route => !existingRequestModels.has(route.requestModel))
    .map(route => ({
      requestModel: route.requestModel,
      providerId: "",
      targetModel: route.targetModel,
    }))

  return [...existingRoutes, ...newRoutes]
}

/**
 * Find the best matching route for an incoming model using fuzzy (contains) matching.
 * If multiple routes match, the one with the longest requestModel wins (most specific).
 * Falls back to the "default" route if no match is found.
 */
export function findRoute(routes: RouteEntry[], incomingModel: string): RouteEntry | null {
  const matches = routes.filter(route => incomingModel.includes(route.requestModel))

  if (matches.length === 0) {
    return routes.find(route => route.requestModel === "default") ?? null
  }

  return matches.reduce((best, current) =>
    current.requestModel.length > best.requestModel.length ? current : best
  )
}
