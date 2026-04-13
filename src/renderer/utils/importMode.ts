export type ImportSource = "file" | "clipboard"

export type ImportRequest =
  | {
      source: "file"
      payload: Record<string, never>
    }
  | {
      source: "clipboard"
      payload: {
        jsonText: string
      }
    }

export function buildImportRequest(input: {
  source: ImportSource
  jsonText: string
}): ImportRequest {
  if (input.source === "file") {
    return {
      source: "file",
      payload: {},
    }
  }

  return {
    source: "clipboard",
    payload: {
      jsonText: input.jsonText,
    },
  }
}

export function canConfirmImportRequest(input: {
  source: ImportSource
  jsonText: string
}): boolean {
  return input.source === "file" || input.jsonText.trim().length > 0
}
