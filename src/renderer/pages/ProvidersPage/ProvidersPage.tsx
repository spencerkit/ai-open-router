import type React from "react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { shallow } from "zustand/shallow"
import { Button, Input, Modal } from "@/components"
import { useLogs, useTranslation } from "@/hooks"
import { useProxyStore } from "@/store"
import type { ProxyConfig } from "@/types"
import { RuleList } from "../ServicePage/RuleList"
import styles from "./ProvidersPage.module.css"

export const ProvidersPage: React.FC = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { showToast } = useLogs()
  const { config, saveConfig } = useProxyStore(
    state => ({
      config: state.config,
      saveConfig: state.saveConfig,
    }),
    shallow
  )

  const [searchValue, setSearchValue] = useState("")
  const [pendingDeleteProviderId, setPendingDeleteProviderId] = useState<string | null>(null)

  const providers = config?.providers ?? []
  const filteredProviders = useMemo(() => {
    const normalized = searchValue.trim().toLowerCase()
    if (!normalized) return providers
    return providers.filter(provider => {
      return [provider.id, provider.name, provider.apiAddress].some(value =>
        value?.toLowerCase().includes(normalized)
      )
    })
  }, [providers, searchValue])

  const pendingDeleteProvider =
    providers.find(provider => provider.id === pendingDeleteProviderId) ?? null

  const affectedGroups = useMemo(() => {
    if (!pendingDeleteProviderId || !config) return []
    return config.groups.filter(group => {
      const providerIds = group.providerIds ?? group.providers.map(provider => provider.id)
      return providerIds.includes(pendingDeleteProviderId)
    })
  }, [config, pendingDeleteProviderId])

  const handleDeleteProvider = async () => {
    if (!config || !pendingDeleteProviderId) return

    const nextProviders = (config.providers ?? []).filter(
      provider => provider.id !== pendingDeleteProviderId
    )

    const nextGroups = config.groups.map(group => {
      const providerIds = (group.providerIds ?? group.providers.map(provider => provider.id)).filter(
        providerId => providerId !== pendingDeleteProviderId
      )
      const activeProviderId =
        group.activeProviderId && providerIds.includes(group.activeProviderId)
          ? group.activeProviderId
          : providerIds[0] ?? null
      return {
        ...group,
        providerIds,
        activeProviderId,
      }
    })

    const nextConfig: ProxyConfig = {
      ...config,
      providers: nextProviders,
      groups: nextGroups,
    }

    try {
      await saveConfig(nextConfig)
      setPendingDeleteProviderId(null)
      showToast(
        t("providersPage.providerDeletedWithImpact", {
          count: affectedGroups.length,
        }),
        "success"
      )
    } catch (error) {
      showToast(t("errors.saveFailed", { message: String(error) }), "error")
    }
  }

  return (
    <div className={styles.providersPage}>
      <div className={styles.pageHeader}>
        <div>
          <h2>{t("providersPage.title")}</h2>
          <p>{t("providersPage.subtitle")}</p>
        </div>
        <Button variant="primary" onClick={() => navigate("/providers/new")}>
          {t("providersPage.addProvider")}
        </Button>
      </div>

      <div className={styles.searchBox}>
        <Input
          value={searchValue}
          onChange={event => setSearchValue(event.target.value)}
          placeholder={t("providersPage.searchPlaceholder")}
          fullWidth
        />
      </div>

      <RuleList
        providers={filteredProviders}
        activeProviderId={null}
        onActivate={() => {}}
        onDelete={providerId => setPendingDeleteProviderId(providerId)}
        onAdd={() => navigate("/providers/new")}
        onEdit={providerId => navigate(`/providers/${providerId}/edit`)}
        showActivate={false}
        addButtonTitle={t("providersPage.addProvider")}
        deleteActionLabel={t("providersPage.deleteProvider")}
        emptyMessage={t("providersPage.empty")}
      />

      <Modal
        open={Boolean(pendingDeleteProvider)}
        onClose={() => setPendingDeleteProviderId(null)}
        title={t("providersPage.deleteModalTitle")}
      >
        {!pendingDeleteProvider ? null : (
          <div className={styles.deleteModalContent}>
            <p>
              {t("providersPage.deleteModalMessage", {
                name: pendingDeleteProvider.name,
                count: affectedGroups.length,
              })}
            </p>
            {affectedGroups.length > 0 ? (
              <ul className={styles.affectedGroupList}>
                {affectedGroups.map(group => (
                  <li key={group.id}>
                    {group.name} <code>/{group.id}</code>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className={styles.modalActions}>
              <Button variant="default" onClick={() => setPendingDeleteProviderId(null)}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" onClick={() => void handleDeleteProvider()}>
                {t("providersPage.confirmDelete")}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default ProvidersPage
