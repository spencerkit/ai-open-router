export function shouldShowBootstrapLoading(input: {
  bootstrapping: boolean
  bootstrapError: string | null
  hasConfig: boolean
  hasStatus: boolean
  canInitialize: boolean
}): boolean {
  return Boolean(
    input.canInitialize &&
      input.bootstrapping &&
      !input.bootstrapError &&
      !input.hasConfig &&
      !input.hasStatus
  )
}
