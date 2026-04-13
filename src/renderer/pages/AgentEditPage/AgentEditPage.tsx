import { ArrowLeft, Bot, Braces, Code2, Save, Workflow } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/common/Button"
import { useTranslation } from "@/hooks"
import { readAgentConfigAction, writeAgentConfigSourceAction } from "@/store"
import type { AgentConfigFile, AgentSourceFile, IntegrationClientKind } from "@/types"
import {
  formatAgentSourceDraft,
  getDirtySourceIds,
  getSourceDraftStatus,
  mergeReloadedSourceDrafts,
} from "@/utils/agentSourceFormat"
import { useActions } from "@/utils/relax"
import styles from "./AgentEditPage.module.css"
import { AgentSourceTabs } from "./AgentSourceTabs"

const AGENT_EDIT_ACTIONS = [readAgentConfigAction, writeAgentConfigSourceAction] as const

const AGENT_META: Record<
  IntegrationClientKind,
  {
    icon: typeof Bot
    format: string
  }
> = {
  claude: {
    icon: Bot,
    format: "settings.json",
  },
  codex: {
    icon: Braces,
    format: "config.toml",
  },
  openclaw: {
    icon: Workflow,
    format: "openclaw.json + agent files",
  },
  opencode: {
    icon: Code2,
    format: "opencode.json(c)",
  },
}

function formatUpdatedAt(raw: string): string {
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function buildSourcePlaceholder(kind: IntegrationClientKind, sourceId: string): string {
  switch (kind) {
    case "claude":
      return '{\n  "env": {\n    "ANTHROPIC_BASE_URL": "http://localhost:8080/oc/your-group"\n  }\n}\n'
    case "codex":
      if (sourceId === "auth") {
        return '{\n  "OPENAI_API_KEY": "sk-..."\n}\n'
      }
      return 'model_provider = "your_provider"\n\n[model_providers.your_provider]\nbase_url = "http://localhost:8080/oc/your-group"\n'
    case "openclaw":
      if (sourceId === "auth-profiles") {
        return '{\n  "profiles": {\n    "aor_shared": {\n      "apiKey": "sk-..."\n    }\n  }\n}\n'
      }
      if (sourceId === "models") {
        return '{\n  "providers": {\n    "aor_shared": {\n      "api": "openai-responses",\n      "baseUrl": "http://localhost:8080/oc/your-group/v1",\n      "apiKey": "sk-..."\n    }\n  }\n}\n'
      }
      return '{\n  "agents": {\n    "defaults": {\n      "model": {\n        "primary": "gpt-4.1-mini",\n        "fallbacks": ["gpt-4o-mini"]\n      }\n    }\n  },\n  "models": {\n    "providers": {\n      "aor_shared": {\n        "api": "openai-responses",\n        "baseUrl": "http://localhost:8080/oc/your-group/v1",\n        "apiKey": "sk-..."\n      }\n    }\n  }\n}\n'
    case "opencode":
      return '{\n  "provider": {\n    "aor_shared": {\n      "options": {\n        "baseURL": "http://localhost:8080/oc/your-group",\n        "apiKey": "sk-..."\n      }\n    }\n  }\n}\n'
  }
}

function buildSourceFiles(configFile?: AgentConfigFile | null): AgentSourceFile[] {
  if (!configFile) return []
  if (configFile.sourceFiles?.length) return configFile.sourceFiles

  const filePathParts = configFile.filePath.split(/[\\/]/)
  const fileName = filePathParts[filePathParts.length - 1] || "config"

  return [
    {
      sourceId: "primary",
      label: fileName,
      filePath: configFile.filePath,
      content: configFile.content,
    },
  ]
}

export const AgentEditPage: React.FC = () => {
  const { targetId } = useParams<{ targetId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [readAgentConfig, writeAgentConfigSource] = useActions(AGENT_EDIT_ACTIONS)

  const [loading, setLoading] = useState(true)
  const [configFile, setConfigFile] = useState<AgentConfigFile | null>(null)
  const [saveMode, setSaveMode] = useState<"source" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeSourceId, setActiveSourceId] = useState("primary")
  const [sourceDrafts, setSourceDrafts] = useState<Record<string, string>>({})

  const sourceFiles = useMemo(() => buildSourceFiles(configFile), [configFile])
  const sourceFilesRef = useRef<AgentSourceFile[]>([])

  useEffect(() => {
    sourceFilesRef.current = sourceFiles
  }, [sourceFiles])

  const loadConfig = useCallback(
    async (options?: { savedSourceId?: string }) => {
      if (!targetId) return

      setLoading(true)
      setError(null)
      try {
        const result = await readAgentConfig({ targetId })
        setConfigFile(result)

        const nextSourceFiles = buildSourceFiles(result)
        setActiveSourceId(current =>
          nextSourceFiles.some(file => file.sourceId === current)
            ? current
            : (nextSourceFiles[0]?.sourceId ?? "primary")
        )
        setSourceDrafts(current =>
          mergeReloadedSourceDrafts(
            sourceFilesRef.current,
            current,
            nextSourceFiles,
            options?.savedSourceId
          )
        )
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    },
    [readAgentConfig, targetId]
  )

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const kind = configFile?.kind ?? "claude"
  const meta = AGENT_META[kind]
  const KindIcon = meta.icon
  const activeSourceFile = useMemo(
    () => sourceFiles.find(file => file.sourceId === activeSourceId) ?? sourceFiles[0],
    [activeSourceId, sourceFiles]
  )
  const sourceContent = activeSourceFile
    ? (sourceDrafts[activeSourceFile.sourceId] ?? activeSourceFile.content)
    : ""
  const sourcePlaceholder = buildSourcePlaceholder(kind, activeSourceFile?.sourceId ?? "primary")
  const dirtySourceIds = getDirtySourceIds(sourceFiles, sourceDrafts)
  const sourceDraftStatus = getSourceDraftStatus(
    sourceFiles,
    sourceDrafts,
    activeSourceFile?.sourceId
  )
  const isSourceDirty = sourceDraftStatus !== "clean"
  const isActiveSourceDirty = sourceDraftStatus === "active-dirty"
  const statusMessage =
    sourceDraftStatus === "active-dirty"
      ? t("agentManagement.unsavedChanges")
      : sourceDraftStatus === "inactive-dirty"
        ? t("agentManagement.otherSourceChangesPending")
        : t("agentManagement.allChangesSaved")

  const handleSaveSource = async () => {
    if (!targetId || !activeSourceFile || !isActiveSourceDirty) return

    setSaveMode("source")
    setError(null)
    setSuccess(null)
    try {
      await writeAgentConfigSource({
        targetId,
        content: sourceContent,
        sourceId: activeSourceFile.sourceId,
      })
      await loadConfig({ savedSourceId: activeSourceFile.sourceId })
      setSuccess(t("agentManagement.saveSuccess"))
    } catch (err) {
      setError(String(err))
    } finally {
      setSaveMode(null)
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <p>{t("app.statusLoading")}</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <section className="app-sub-header">
        <div className="app-sub-header-top">
          <button type="button" className="app-sub-header-back" onClick={() => navigate("/agents")}>
            <ArrowLeft size={16} strokeWidth={2} />
            <span>{t("agentManagement.back")}</span>
          </button>
          <div className="app-sub-header-actions">
            <span className={styles.kindBadge}>
              <KindIcon size={14} strokeWidth={2} />
              <span>{t(`agentManagement.${kind}`)}</span>
            </span>
            <span className={styles.formatBadge}>{meta.format}</span>
          </div>
        </div>

        <div className="app-sub-header-main">
          <h1 className="app-sub-header-title">{t("agentManagement.editConfig")}</h1>
          <p className={`app-sub-header-subtitle ${styles.subtitle}`}>
            {t("agentManagement.editSubtitle")}
          </p>
        </div>

        <div className={styles.headerMetaGrid}>
          <div className={styles.headerMetaItem}>
            <span className={styles.headerMetaLabel}>{t("agentManagement.configDir")}</span>
            <code className={styles.headerMetaValue}>{configFile?.configDir || "-"}</code>
          </div>
          <div className={styles.headerMetaItem}>
            <span className={styles.headerMetaLabel}>{t("agentManagement.configFile")}</span>
            <code className={styles.headerMetaValue}>
              {activeSourceFile?.filePath || configFile?.filePath || "-"}
            </code>
          </div>
          <div className={styles.headerMetaItem}>
            <span className={styles.headerMetaLabel}>{t("agentManagement.updatedAt")}</span>
            <code className={styles.headerMetaValue}>
              {configFile?.updatedAt ? formatUpdatedAt(configFile.updatedAt) : "-"}
            </code>
          </div>
        </div>
      </section>

      <section className={styles.editorCard}>
        <div className={styles.editorHeader}>
          <div className={styles.tabs}>
            <span className={`${styles.tab} ${styles.tabActive}`}>
              {t("agentManagement.sourceEditor")}
            </span>
          </div>

          <span className={`${styles.statusBadge} ${isSourceDirty ? styles.statusDirty : ""}`}>
            {statusMessage}
          </span>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}

        <AgentSourceTabs
          kind={kind}
          sourceFiles={sourceFiles}
          activeSourceFile={activeSourceFile}
          sourceContent={sourceContent}
          sourcePlaceholder={sourcePlaceholder}
          metaFormat={meta.format}
          dirtySourceIds={dirtySourceIds}
          t={t}
          onSourceSelect={setActiveSourceId}
          onSourceChange={value =>
            setSourceDrafts(current => ({
              ...current,
              [activeSourceFile?.sourceId ?? "primary"]: value,
            }))
          }
          onFormatCurrentFile={() =>
            setSourceDrafts(current => ({
              ...current,
              [activeSourceFile?.sourceId ?? "primary"]: formatAgentSourceDraft(
                kind,
                current[activeSourceFile?.sourceId ?? "primary"] ?? ""
              ),
            }))
          }
        />

        <div className={styles.actions}>
          <Button variant="ghost" onClick={() => navigate("/agents")}>
            {t("agentManagement.back")}
          </Button>
          <Button
            variant="primary"
            icon={Save}
            loading={saveMode === "source"}
            disabled={!isActiveSourceDirty}
            onClick={handleSaveSource}
          >
            {t("agentManagement.saveCurrentFile")}
          </Button>
        </div>
      </section>
    </div>
  )
}

export default AgentEditPage
