import { Check, ChevronRight, Folder, Loader2, Play, Plus, RefreshCw, Trash2 } from "lucide-react"
import type React from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components"
import { useTranslation } from "@/hooks"
import type { Group, RuleQuotaSnapshot } from "@/types"
import styles from "./ServicePage.module.css"

export interface ServicePageProps {
  groups: Group[]
  activeGroupId: string | null
  onSelectGroup: (groupId: string) => void
  onAddGroup: () => void
  onDeleteGroup: (groupId: string) => void
}

/**
 * GroupList Component
 * Displays a list of groups in the sidebar
 */
export const GroupList: React.FC<{
  groups: Group[]
  activeGroupId: string | null
  onSelect: (groupId: string) => void
  onAdd: () => void
}> = ({ groups, activeGroupId, onSelect, onAdd }) => {
  const { t } = useTranslation()

  return (
    <div className={styles.groupList}>
      <div className={styles.groupListHeader}>
        <h3>{t("servicePage.groupInfo")}</h3>
        <Button
          variant="ghost"
          size="small"
          icon={Plus}
          onClick={onAdd}
          title={t("header.addGroup")}
        />
      </div>
      <div className={styles.groupListContent}>
        {groups.length === 0 ? (
          <p className={styles.emptyHint}>{t("servicePage.noGroupsHint")}</p>
        ) : (
          <ul className={styles.groupItems}>
            {groups.map(group => (
              <li key={group.id}>
                <button
                  type="button"
                  className={`${styles.groupItem} ${group.id === activeGroupId ? styles.active : ""}`}
                  onClick={() => onSelect(group.id)}
                >
                  <Folder size={16} className={styles.groupIcon} />
                  <span className={styles.groupName}>{group.name}</span>
                  <span className={styles.groupPath}>/{group.id}</span>
                  {group.id === activeGroupId && <Check size={14} className={styles.activeIcon} />}
                  <ChevronRight size={14} className={styles.chevron} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * RuleList Component
 * Displays rules within a group
 */
export const RuleList: React.FC<{
  rules: Group["rules"]
  activeRuleId: string | null
  onSelect: (ruleId: string) => void
  onActivate: (ruleId: string) => void | Promise<void>
  activatingRuleId?: string | null
  quotaByRuleId?: Record<string, RuleQuotaSnapshot | undefined>
  quotaLoadingByRuleId?: Record<string, boolean | undefined>
  onRefreshQuota?: (ruleId: string) => void | Promise<void>
  onDelete: (ruleId: string) => void
  groupName: string
  groupId: string
}> = ({
  rules,
  activeRuleId,
  onSelect,
  onActivate,
  activatingRuleId,
  quotaByRuleId,
  quotaLoadingByRuleId,
  onRefreshQuota,
  onDelete,
  groupName,
  groupId,
}) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const handleRuleClick = (ruleId: string) => {
    navigate(`/groups/${groupId}/rules/${ruleId}/edit`)
  }

  const handleAddRuleClick = () => {
    navigate(`/groups/${groupId}/rules/new`)
  }

  const formatQuotaValue = (value?: number | null) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "-"
    }
    const abs = Math.abs(value)
    if (abs >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2).replace(/\\.00$/, "")}M`
    }
    if (abs >= 1_000) {
      return `${(value / 1_000).toFixed(1).replace(/\\.0$/, "")}k`
    }
    if (abs >= 1) {
      return value.toFixed(2).replace(/\\.00$/, "")
    }
    return value.toFixed(4).replace(/0+$/, "").replace(/\\.$/, "")
  }

  const resolveQuotaBadge = (rule: Group["rules"][number]) => {
    if (!rule.quota?.enabled) {
      return {
        className: styles.quotaBadgeUnsupported,
        text: t("ruleQuota.unsupported"),
      }
    }

    const snapshot = quotaByRuleId?.[rule.id]
    if (!snapshot) {
      return {
        className: styles.quotaBadgeUnknown,
        text: t("ruleQuota.pending"),
      }
    }

    if (snapshot.status === "empty") {
      return {
        className: styles.quotaBadgeEmpty,
        text: t("ruleQuota.empty"),
      }
    }

    if (snapshot.status === "error") {
      return {
        className: styles.quotaBadgeError,
        text: t("ruleQuota.error"),
      }
    }

    if (snapshot.status === "unknown") {
      return {
        className: styles.quotaBadgeUnknown,
        text: t("ruleQuota.unknown"),
      }
    }

    if (snapshot.status === "unsupported") {
      return {
        className: styles.quotaBadgeUnsupported,
        text: t("ruleQuota.unsupported"),
      }
    }

    const renderedValue = formatQuotaValue(snapshot.remaining)
    const renderedWithUnit = snapshot.unit ? `${renderedValue} ${snapshot.unit}` : renderedValue

    if (snapshot.status === "low") {
      return {
        className: styles.quotaBadgeLow,
        text: t("ruleQuota.low", { value: renderedWithUnit }),
      }
    }

    return {
      className: styles.quotaBadgeOk,
      text: t("ruleQuota.remaining", { value: renderedWithUnit }),
    }
  }

  return (
    <div className={styles.ruleList}>
      <div className={styles.ruleListHeader}>
        <div className={styles.ruleHeaderTitle}>
          <h3>{t("servicePage.ruleName")}</h3>
          <span className={styles.countBadge}>{rules.length}</span>
          <span className={styles.ruleGroupName} title={groupName}>
            {groupName}
          </span>
        </div>
        <Button
          variant="ghost"
          size="small"
          icon={Plus}
          onClick={handleAddRuleClick}
          title={t("servicePage.addRule")}
        />
      </div>
      <div className={styles.ruleListContent}>
        {rules.length === 0 ? (
          <p className={styles.emptyHint}>{t("servicePage.noRulesHint")}</p>
        ) : (
          <ul className={styles.ruleItems}>
            {rules.map(rule => (
              <li
                key={rule.id}
                className={`${styles.ruleItemContainer} ${rule.id === activeRuleId ? styles.ruleItemContainerActive : ""}`}
              >
                {(() => {
                  const badge = resolveQuotaBadge(rule)
                  return (
                    <span className={`${styles.quotaBadge} ${badge.className}`} title={badge.text}>
                      {badge.text}
                    </span>
                  )
                })()}
                <button
                  type="button"
                  className={`${styles.ruleItem} ${rule.id === activeRuleId ? styles.active : ""}`}
                  onClick={() => {
                    onSelect(rule.id)
                    handleRuleClick(rule.id)
                  }}
                >
                  <span className={styles.ruleModel}>{rule.name}</span>
                  <span className={styles.ruleDirection}>{t(`ruleProtocol.${rule.protocol}`)}</span>
                  {rule.id === activeRuleId && (
                    <span className={styles.currentBadge}>{t("servicePage.current")}</span>
                  )}
                </button>
                {rule.id !== activeRuleId && (
                  <button
                    type="button"
                    className={styles.activateButton}
                    onClick={e => {
                      e.stopPropagation()
                      onActivate(rule.id)
                    }}
                    title={t("servicePage.activateRule")}
                    aria-label={`${t("servicePage.activateRule")}: ${rule.name}`}
                    disabled={activatingRuleId === rule.id}
                  >
                    <Play size={13} />
                    <span>{t("servicePage.activateRule")}</span>
                  </button>
                )}
                {rule.quota?.enabled && (
                  <button
                    type="button"
                    className={styles.quotaRefreshButton}
                    onClick={e => {
                      e.stopPropagation()
                      onRefreshQuota?.(rule.id)
                    }}
                    title={t("ruleQuota.refresh")}
                    aria-label={`${t("ruleQuota.refresh")}: ${rule.name}`}
                    disabled={Boolean(quotaLoadingByRuleId?.[rule.id])}
                  >
                    {quotaLoadingByRuleId?.[rule.id] ? (
                      <Loader2 size={14} className={styles.spinner} />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={e => {
                    e.stopPropagation()
                    onDelete(rule.id)
                  }}
                  title={t("servicePage.deleteRule")}
                  aria-label={`${t("servicePage.deleteRule")}: ${rule.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default RuleList
