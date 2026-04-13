import { ArrowLeft } from "lucide-react"
import type React from "react"
import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button, Input, Select } from "@/components"
import { useLogs, useTranslation } from "@/hooks"
import { configState, saveConfigAction } from "@/store"
import type { Provider, ProxyConfig, RouteEntry } from "@/types"
import { useActions, useRelaxValue } from "@/utils/relax"
import { applyTemplateToRoutes, ROUTING_TEMPLATES } from "@/utils/routingTemplates"
import styles from "./GroupEditPage.module.css"

const GROUP_EDIT_ACTIONS = [saveConfigAction] as const

export const GroupEditPage: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { showToast } = useLogs()
  const config = useRelaxValue(configState)
  const [saveConfig] = useActions(GROUP_EDIT_ACTIONS)

  const group = config?.groups.find(item => item.id === groupId)

  const [name, setName] = useState("")
  const [routingTable, setRoutingTable] = useState<RouteEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!group) {
      if (!config) return
      setLoading(false)
      showToast(t("toast.groupNotFound"), "error")
      navigate("/")
      return
    }
    setName(group.name)
    if (group.routingTable && group.routingTable.length > 0) {
      setRoutingTable(group.routingTable)
    } else {
      setRoutingTable([{ requestModel: "default", providerId: "", targetModel: "" }])
    }
    setLoading(false)
  }, [group, config, navigate, showToast, t])

  const handleTemplateFill = (templateId: string) => {
    if (!templateId) return
    const filled = applyTemplateToRoutes(templateId, routingTable)
    setRoutingTable(filled)
  }

  const handleAddRoute = () => {
    setRoutingTable([...routingTable, { requestModel: "", providerId: "", targetModel: "" }])
  }

  const handleRemoveRoute = (index: number) => {
    if (routingTable[index].requestModel === "default") return
    setRoutingTable(routingTable.filter((_, i) => i !== index))
  }

  const handleRouteChange = (index: number, field: keyof RouteEntry, value: string) => {
    setRoutingTable(
      routingTable.map((route, i) => (i === index ? { ...route, [field]: value } : route))
    )
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!config || !groupId || !group) return
    if (!name.trim()) {
      showToast(t("validation.required", { field: t("servicePage.groupName") }), "error")
      return
    }

    // Validate routing table
    const hasDefault = routingTable.some(r => r.requestModel === "default")
    if (!hasDefault) {
      showToast(t("groupEditPage.routingTableMustHaveDefault"), "error")
      return
    }

    const nextConfig: ProxyConfig = {
      ...config,
      groups: config.groups.map(item => {
        if (item.id !== groupId) return item
        return {
          ...item,
          name: name.trim(),
          routingTable,
        }
      }),
    }

    try {
      await saveConfig(nextConfig)
      showToast(t("toast.groupUpdated"), "success")
      navigate("/")
    } catch (error) {
      showToast(t("errors.saveFailed", { message: String(error) }), "error")
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
    <div className={styles.groupEditPage}>
      <div className="app-sub-header">
        <div className="app-sub-header-top">
          <button type="button" onClick={() => navigate("/")} className="app-sub-header-back">
            <ArrowLeft size={16} strokeWidth={2} />
            <span>{t("header.backToService")}</span>
          </button>
        </div>
        <div className="app-sub-header-main">
          <h1 className="app-sub-header-title">{t("groupEditPage.title")}</h1>
          <nav className="app-breadcrumb" aria-label={t("header.backToService")}>
            <button type="button" onClick={() => navigate("/")} className="app-breadcrumb-button">
              {t("servicePage.groupPath")}
            </button>
            <span className="app-breadcrumb-separator">/</span>
            <span className="app-breadcrumb-item">{group?.name}</span>
          </nav>
        </div>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("groupEditPage.sectionBasic")}</h2>

          <div className={styles.formGroup}>
            <label htmlFor="groupId">{t("modal.groupIdLabel")}</label>
            <Input id="groupId" value={group?.id ?? ""} disabled />
            <p className={styles.hint}>{t("groupEditPage.groupIdImmutable")}</p>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="groupName">{t("modal.groupNameLabel")}</label>
            <Input
              id="groupName"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t("modal.groupNamePlaceholder")}
            />
            <p className={styles.hint}>{t("groupEditPage.groupNameHint")}</p>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.routingSectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>{t("servicePage.routingTable")}</h2>
              <p className={styles.hint}>{t("groupEditPage.routingTableHint")}</p>
            </div>
            <div className={styles.routingHeaderActions}>
              <Select
                className={styles.templateSelect}
                onChange={value => handleTemplateFill(value)}
                options={ROUTING_TEMPLATES.map(tpl => ({
                  label: tpl.name,
                  value: tpl.id,
                }))}
                placeholder={t("servicePage.fillFromTemplate")}
                value=""
              />
              <Button type="button" variant="default" size="small" onClick={handleAddRoute}>
                + {t("servicePage.addRoute")}
              </Button>
            </div>
          </div>

          <div className={styles.routingTableWrap}>
            <table className={styles.routingTable}>
              <thead>
                <tr>
                  <th>{t("servicePage.requestModel")}</th>
                  <th>{t("servicePage.provider")}</th>
                  <th>{t("servicePage.targetModel")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {routingTable.map((route, index) => (
                  <tr
                    key={`${route.requestModel || "route"}-${route.providerId || "provider"}-${route.targetModel || "target"}`}
                    className={route.requestModel === "default" ? styles.defaultRow : ""}
                  >
                    <td>
                      <Input
                        type="text"
                        value={route.requestModel}
                        onChange={e => handleRouteChange(index, "requestModel", e.target.value)}
                        readOnly={route.requestModel === "default"}
                        className={
                          route.requestModel === "default" ? styles.readonlyInput : undefined
                        }
                        placeholder={route.requestModel === "default" ? "default" : ""}
                      />
                    </td>
                    <td>
                      <Select
                        className={styles.select}
                        value={route.providerId}
                        onChange={value => handleRouteChange(index, "providerId", value)}
                        options={(config?.providers ?? []).map((p: Provider) => ({
                          label: p.name,
                          value: p.id,
                        }))}
                        placeholder={t("servicePage.selectProvider")}
                      />
                    </td>
                    <td>
                      <Input
                        type="text"
                        value={route.targetModel}
                        onChange={e => handleRouteChange(index, "targetModel", e.target.value)}
                        placeholder={t("groupEditPage.targetModelPlaceholder")}
                      />
                    </td>
                    <td className={styles.actionCell}>
                      {route.requestModel !== "default" ? (
                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() => handleRemoveRoute(index)}
                          title={t("servicePage.removeRoute")}
                          aria-label={t("servicePage.removeRoute")}
                        >
                          ×
                        </button>
                      ) : (
                        <span className={styles.lockedLabel}>{t("servicePage.locked")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.actions}>
          <Button type="button" variant="default" onClick={() => navigate("/")}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary">
            {t("common.save")}
          </Button>
        </div>
      </form>
    </div>
  )
}

export default GroupEditPage
