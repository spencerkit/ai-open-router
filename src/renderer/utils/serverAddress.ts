function isWildcardHost(host?: string): boolean {
  if (!host) return false
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase()
  return normalized === "0.0.0.0" || normalized === "::" || normalized === "::0"
}

function isLoopbackHost(host?: string): boolean {
  if (!host) return false
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase()
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost"
}

function toHttpUrl(rawAddress: string): URL | null {
  try {
    const withProtocol = /^https?:\/\//i.test(rawAddress) ? rawAddress : `http://${rawAddress}`
    return new URL(withProtocol)
  } catch {
    return null
  }
}

function buildBaseUrl(host: string, port: number): string {
  const parsedHost = host.replace(/^\[|\]$/g, "")
  const url = new URL("http://localhost")
  url.hostname = parsedHost
  url.port = String(port)
  url.pathname = ""
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/+$/, "")
}

function normalizeBaseUrl(rawAddress: string, fallbackPort: number): string | null {
  const parsed = toHttpUrl(rawAddress)
  if (!parsed) {
    return null
  }
  if (isWildcardHost(parsed.hostname) || isLoopbackHost(parsed.hostname)) {
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

function dedupeBaseUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const raw of urls) {
    const parsed = toHttpUrl(raw)
    if (!parsed) continue

    const normalizedHost = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase()
    const normalizedPort = parsed.port || (parsed.protocol === "https:" ? "443" : "80")
    const key = `${normalizedHost}:${normalizedPort}`
    if (seen.has(key)) continue

    seen.add(key)
    deduped.push(raw)
  }

  return deduped
}

export interface ResolveServerAddressParams {
  statusAddress?: string | null
  statusLanAddress?: string | null
  configHost?: string
  configPort?: number
}

export function resolveReachableServerBaseUrls(params: ResolveServerAddressParams): string[] {
  const fallbackPort = params.configPort ?? 8899
  const urls: string[] = []

  if (params.statusAddress) {
    const normalized = normalizeBaseUrl(params.statusAddress, fallbackPort)
    if (normalized) {
      urls.push(normalized)
    }
  }

  if (params.statusLanAddress) {
    const normalized = normalizeBaseUrl(params.statusLanAddress, fallbackPort)
    if (normalized) {
      urls.push(normalized)
    }
  }

  if (urls.length === 0) {
    const host =
      isWildcardHost(params.configHost) || isLoopbackHost(params.configHost)
        ? "localhost"
        : params.configHost || "localhost"
    urls.push(buildBaseUrl(host, fallbackPort))
  }

  return dedupeBaseUrls(urls)
}

export function resolveReachableServerBaseUrl(params: ResolveServerAddressParams): string {
  const urls = resolveReachableServerBaseUrls(params)
  return urls[0] || buildBaseUrl("localhost", params.configPort ?? 8899)
}

export function formatServerAddressForDisplay(baseUrl: string): string {
  const parsed = toHttpUrl(baseUrl)
  if (!parsed) {
    return baseUrl
  }

  const host = parsed.hostname
  const displayHost = host.includes(":") ? `[${host}]` : host
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80")
  return `${displayHost}:${port}`
}
