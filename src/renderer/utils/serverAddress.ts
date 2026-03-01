function isWildcardHost(host?: string): boolean {
  if (!host) return false
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase()
  return normalized === "0.0.0.0" || normalized === "::" || normalized === "::0"
}

function toHttpUrl(rawAddress: string): URL | null {
  try {
    const withProtocol = /^https?:\/\//i.test(rawAddress) ? rawAddress : `http://${rawAddress}`
    return new URL(withProtocol)
  } catch {
    return null
  }
}

export function resolveReachableServerBaseUrl(params: {
  statusAddress?: string | null
  configHost?: string
  configPort?: number
}): string {
  const fallbackPort = params.configPort ?? 8899

  if (params.statusAddress) {
    const parsed = toHttpUrl(params.statusAddress)
    if (parsed) {
      if (isWildcardHost(parsed.hostname)) {
        parsed.hostname = "localhost"
      }
      if (!parsed.port) {
        parsed.port = String(fallbackPort)
      }
      parsed.pathname = ""
      parsed.search = ""
      parsed.hash = ""
      return parsed.toString().replace(/\/+$/, "")
    }
  }

  const host = isWildcardHost(params.configHost) ? "localhost" : params.configHost || "localhost"
  return `http://${host}:${fallbackPort}`
}
