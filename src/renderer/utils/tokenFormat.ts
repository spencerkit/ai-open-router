const TOKEN_MILLION = 1_000_000

export function formatTokenMillions(value: number | null | undefined): string {
  const safe = Number.isFinite(value) ? Number(value) : 0
  return `${(safe / TOKEN_MILLION).toFixed(2)}M`
}
