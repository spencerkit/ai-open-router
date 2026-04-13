import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, Input, Select } from "@/components"
import type { Provider, RouteEntry } from "@/types"
import { applyTemplateToRoutes, ROUTING_TEMPLATES } from "@/utils/routingTemplates"
import styles from "./ServicePage.module.css"

const DEFAULT_ROUTE_REQUEST_MODEL = "default"
const EMPTY_ROUTE: RouteEntry = {
  requestModel: "",
  providerId: "",
  targetModel: "",
}

export interface RoutingTableEditorProps {
  providers: Provider[]
  routes: RouteEntry[]
  onSave: (routes: RouteEntry[]) => void
}

const createDraftRoutes = (routes: RouteEntry[]): RouteEntry[] => {
  if (routes.length > 0) {
    return routes.map(route => ({ ...route }))
  }

  return [{ ...EMPTY_ROUTE, requestModel: DEFAULT_ROUTE_REQUEST_MODEL }]
}

const areRoutesEqual = (left: RouteEntry[], right: RouteEntry[]): boolean => {
  if (left.length !== right.length) return false

  return left.every((route, index) => {
    const nextRoute = right[index]
    if (!nextRoute) return false

    return (
      route.requestModel === nextRoute.requestModel &&
      route.providerId === nextRoute.providerId &&
      route.targetModel === nextRoute.targetModel
    )
  })
}

export const RoutingTableEditor: React.FC<RoutingTableEditorProps> = ({
  providers,
  routes,
  onSave,
}) => {
  const { t } = useTranslation()
  const [draftRoutes, setDraftRoutes] = useState<RouteEntry[]>(() => createDraftRoutes(routes))
  const [templateId, setTemplateId] = useState("")
  const [saveError, setSaveError] = useState("")

  const providersById = useMemo(() => {
    return new Map(providers.map(provider => [provider.id, provider] as const))
  }, [providers])

  useEffect(() => {
    const nextDraftRoutes = createDraftRoutes(routes)
    setDraftRoutes(currentRoutes =>
      areRoutesEqual(currentRoutes, nextDraftRoutes) ? currentRoutes : nextDraftRoutes
    )
    setSaveError("")
  }, [routes])

  const updateRoute = (index: number, updater: (route: RouteEntry) => RouteEntry) => {
    setDraftRoutes(currentRoutes => {
      return currentRoutes.map((route, routeIndex) => {
        if (routeIndex !== index) return route
        return updater(route)
      })
    })
    setSaveError("")
  }

  const handleTemplateFill = (nextTemplateId: string) => {
    setTemplateId(nextTemplateId)
    if (!nextTemplateId) return

    setDraftRoutes(currentRoutes => applyTemplateToRoutes(nextTemplateId, currentRoutes))
    setSaveError("")
  }

  const handleAddRoute = () => {
    setDraftRoutes(currentRoutes => [...currentRoutes, { ...EMPTY_ROUTE }])
    setSaveError("")
  }

  const handleRemoveRoute = (index: number) => {
    setDraftRoutes(currentRoutes => {
      const routeToRemove = currentRoutes[index]
      if (!routeToRemove || routeToRemove.requestModel === DEFAULT_ROUTE_REQUEST_MODEL) {
        return currentRoutes
      }
      return currentRoutes.filter((_, routeIndex) => routeIndex !== index)
    })
    setSaveError("")
  }

  const handleProviderChange = (index: number, providerId: string) => {
    updateRoute(index, route => {
      const provider = providersById.get(providerId)
      const nextTargetModel = provider?.models.includes(route.targetModel) ? route.targetModel : ""

      return {
        ...route,
        providerId,
        targetModel: nextTargetModel,
      }
    })
  }

  const handleSave = () => {
    const hasDefaultRoute = draftRoutes.some(
      route => route.requestModel.trim() === DEFAULT_ROUTE_REQUEST_MODEL
    )

    if (!hasDefaultRoute) {
      setSaveError(t("servicePage.routingTableMustHaveDefault"))
      return
    }

    setSaveError("")
    onSave(draftRoutes.map(route => ({ ...route })))
  }

  return (
    <section className={styles.routingEditor}>
      <div className={styles.routingEditorHeader}>
        <div className={styles.routingEditorTitleWrap}>
          <h3 className={styles.routingEditorTitle}>{t("servicePage.routingTable")}</h3>
          <p className={styles.routingEditorHint}>{t("servicePage.routingTableHint")}</p>
        </div>
        <div className={styles.routingEditorToolbar}>
          <Select
            aria-label="Routing template"
            className={styles.routingEditorTemplateSelect}
            options={ROUTING_TEMPLATES.map(template => ({
              label: template.name,
              value: template.id,
            }))}
            placeholder={t("servicePage.fillFromTemplate")}
            value={templateId}
            onChange={handleTemplateFill}
          />
          <Button type="button" variant="default" size="small" onClick={handleAddRoute}>
            {t("servicePage.addRoute")}
          </Button>
        </div>
      </div>

      <div className={styles.routingEditorTableWrap}>
        <table className={styles.routingEditorTable}>
          <thead>
            <tr>
              <th>{t("servicePage.requestModel")}</th>
              <th>{t("servicePage.provider")}</th>
              <th>{t("servicePage.targetModel")}</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {draftRoutes.map((route, index) => {
              const provider = providersById.get(route.providerId)
              const targetModelOptions = (provider?.models ?? []).map(model => ({
                label: model,
                value: model,
              }))
              const isDefaultRoute = route.requestModel === DEFAULT_ROUTE_REQUEST_MODEL

              return (
                <tr
                  // biome-ignore lint/suspicious/noArrayIndexKey: index is stable — rows are only ever appended/removed at the end, never reordered; using dynamic field-based keys caused focus loss on every keystroke
                  key={`route-row-${index}`}
                  className={isDefaultRoute ? styles.routingEditorDefaultRow : undefined}
                >
                  <td>
                    <Input
                      aria-label={`Request model ${index + 1}`}
                      className={isDefaultRoute ? styles.routingEditorReadonlyInput : undefined}
                      placeholder={
                        isDefaultRoute ? DEFAULT_ROUTE_REQUEST_MODEL : t("servicePage.requestModel")
                      }
                      readOnly={isDefaultRoute}
                      value={route.requestModel}
                      onChange={event => {
                        updateRoute(index, currentRoute => ({
                          ...currentRoute,
                          requestModel: event.target.value,
                        }))
                      }}
                    />
                  </td>
                  <td>
                    <Select
                      aria-label={`Provider ${index + 1}`}
                      fullWidth
                      options={providers.map(providerOption => ({
                        label: providerOption.name,
                        value: providerOption.id,
                      }))}
                      placeholder={t("servicePage.selectProvider")}
                      value={route.providerId}
                      onChange={value => handleProviderChange(index, value)}
                    />
                  </td>
                  <td>
                    <Select
                      aria-label={`Target model ${index + 1}`}
                      disabled={!route.providerId || targetModelOptions.length === 0}
                      fullWidth
                      options={targetModelOptions}
                      placeholder={t("servicePage.targetModel")}
                      value={route.targetModel}
                      onChange={value => {
                        updateRoute(index, currentRoute => ({
                          ...currentRoute,
                          targetModel: value,
                        }))
                      }}
                    />
                  </td>
                  <td className={styles.routingEditorActionCell}>
                    {isDefaultRoute ? (
                      <span className={styles.routingEditorLockedLabel}>
                        {t("servicePage.locked")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={t("servicePage.removeRoute")}
                        className={styles.routingEditorRemoveButton}
                        onClick={() => handleRemoveRoute(index)}
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.routingEditorFooter}>
        {saveError ? (
          <p className={styles.routingEditorError} role="alert">
            {saveError}
          </p>
        ) : (
          <span />
        )}
        <Button type="button" variant="primary" onClick={handleSave}>
          {t("common.save")}
        </Button>
      </div>
    </section>
  )
}
