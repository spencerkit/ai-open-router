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
      { requestModel: "opus", targetModel: "claude-opus-3-5" },
      { requestModel: "sonnet", targetModel: "claude-sonnet-4" },
      { requestModel: "haiku", targetModel: "claude-haiku-4" },
    ],
  },
  {
    id: "codex",
    name: "Codex",
    routes: [
      { requestModel: "gpt-5.4", targetModel: "gpt-5.4" },
      { requestModel: "gpt-5.3-codex", targetModel: "gpt-5.3-codex" },
      { requestModel: "gpt-5.2-codex", targetModel: "gpt-5.2-codex" },
      { requestModel: "gpt-5.1-codex", targetModel: "gpt-5.1-codex" },
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
