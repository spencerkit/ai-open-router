import type { AgentSourceFile, IntegrationClientKind } from "@/types"

export function formatAgentSourceDraft(kind: IntegrationClientKind, source: string): string {
  if (kind !== "openclaw") {
    return source
  }

  try {
    return JSON.stringify(JSON.parse(source), null, 2)
  } catch {
    return source
  }
}

export function getDirtySourceIds(
  sourceFiles: AgentSourceFile[],
  sourceDrafts: Record<string, string>
): string[] {
  return sourceFiles
    .filter(file => (sourceDrafts[file.sourceId] ?? file.content) !== file.content)
    .map(file => file.sourceId)
}

export function hasDirtySourceDrafts(
  sourceFiles: AgentSourceFile[],
  sourceDrafts: Record<string, string>
): boolean {
  return getDirtySourceIds(sourceFiles, sourceDrafts).length > 0
}

export type SourceDraftStatus = "clean" | "active-dirty" | "inactive-dirty"

export function getSourceDraftStatus(
  sourceFiles: AgentSourceFile[],
  sourceDrafts: Record<string, string>,
  activeSourceId?: string
): SourceDraftStatus {
  const dirtySourceIds = getDirtySourceIds(sourceFiles, sourceDrafts)
  if (dirtySourceIds.length === 0) {
    return "clean"
  }
  if (activeSourceId && dirtySourceIds.includes(activeSourceId)) {
    return "active-dirty"
  }
  return "inactive-dirty"
}

export function mergeReloadedSourceDrafts(
  previousSourceFiles: AgentSourceFile[],
  previousSourceDrafts: Record<string, string>,
  nextSourceFiles: AgentSourceFile[],
  savedSourceId?: string
): Record<string, string> {
  const previousFilesById = new Map(previousSourceFiles.map(file => [file.sourceId, file]))

  return Object.fromEntries(
    nextSourceFiles.map(file => {
      if (file.sourceId === savedSourceId) {
        return [file.sourceId, file.content]
      }

      const previousFile = previousFilesById.get(file.sourceId)
      const previousDraft = previousSourceDrafts[file.sourceId]
      const previousWasDirty =
        previousFile !== undefined &&
        previousDraft !== undefined &&
        previousDraft !== previousFile.content

      return [file.sourceId, previousWasDirty ? previousDraft : file.content]
    })
  )
}
