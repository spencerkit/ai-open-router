# 路由表重构 — 前端实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 重构前端页面，支持 Provider 多模型和 Group 路由表编辑

**架构：** 类型变更 → 工具函数 → 页面组件重构

**技术栈：** React/TypeScript (Vite), CSS Modules

---

## Phase 1: 类型和工具函数

### Task 1: 更新 types/proxy.ts

**文件:**
- Modify: `src/renderer/types/proxy.ts`

**变更内容:**

```typescript
// 新增 RouteEntry 接口
export interface RouteEntry {
  requestModel: string   // "default" 或模型名
  providerId: string     // 全局 Provider ID
  targetModel: string     // 目标模型名
}

// 更新 Rule/Provider，新增 models
export interface Rule {
  id: string
  name: string
  protocol: RuleProtocol
  token: string
  apiAddress: string
  website?: string
  models: string[]  // 新增
  headerPassthroughAllow?: string[]
  headerPassthroughDeny?: string[]
  quota: RuleQuotaConfig
  cost?: RuleCostConfig
  // 旧字段保留（向后兼容），但代码中不再使用
  defaultModel?: string
  modelMappings?: Record<string, string>
}

export type Provider = Rule

// 更新 Group，改为路由表模式
export interface Group {
  id: string
  name: string
  routingTable: RouteEntry[]  // 新增
  // 旧字段保留（向后兼容），但代码中不再使用
  models?: string[]
  providerIds?: string[]
  activeProviderId: string | null
  providers?: Provider[]
  failover?: GroupFailoverConfig
}
```

- [ ] **Step 1: 添加 RouteEntry 接口**

```typescript
export interface RouteEntry {
  requestModel: string
  providerId: string
  targetModel: string
}
```

- [ ] **Step 2: 更新 Rule 接口**

在 `Rule` 接口中添加 `models: string[]`，保留旧字段为可选

- [ ] **Step 3: 更新 Group 接口**

添加 `routingTable: RouteEntry[]`，保留旧字段为可选

- [ ] **Step 4: 提交**

```bash
git add src/renderer/types/proxy.ts
git commit -m "refactor(types): add RouteEntry and routingTable types"
```

### Task 2: 创建 routingTemplates.ts

**文件:**
- Create: `src/renderer/utils/routingTemplates.ts`

```typescript
export interface RoutingTemplate {
  id: string
  name: string
  routes: Array<{
    requestModel: string
    targetModel: string
  }>
}

export const ROUTING_TEMPLATES: RoutingTemplate[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    routes: [
      { requestModel: "opus", targetModel: "claude-opus-3-5" },
      { requestModel: "sonnet", targetModel: "claude-sonnet-4" },
      { requestModel: "haiku", targetModel: "claude-haiku-4" },
    ],
  },
  {
    id: "codex",
    name: "Codex",
    routes: [
      { requestModel: "gpt-5.4", targetModel: "gpt-5.4" },
      { requestModel: "gpt-5.3-codex", targetModel: "gpt-5.3-codex" },
      { requestModel: "gpt-5.2-codex", targetModel: "gpt-5.2-codex" },
      { requestModel: "gpt-5.1-codex", targetModel: "gpt-5.1-codex" },
    ],
  },
  {
    id: "gemini",
    name: "Gemini",
    routes: [
      { requestModel: "gemini-2.5-pro", targetModel: "gemini-2.5-pro" },
      { requestModel: "gemini-2.5-flash", targetModel: "gemini-2.5-flash" },
      { requestModel: "gemini-2.0-flash", targetModel: "gemini-2.0-flash" },
    ],
  },
]

export function applyTemplateToRoutes(
  templateId: string,
  existingRoutes: RouteEntry[]
): RouteEntry[] {
  const template = ROUTING_TEMPLATES.find(t => t.id === templateId)
  if (!template) return existingRoutes

  const existingRequestModels = new Set(existingRoutes.map(r => r.requestModel))
  const newRoutes = template.routes
    .filter(route => !existingRequestModels.has(route.requestModel))
    .map(route => ({
      requestModel: route.requestModel,
      providerId: "",
      targetModel: route.targetModel,
    }))

  return [...existingRoutes, ...newRoutes]
}
```

- [ ] **Step 1: 创建文件并写入代码**

- [ ] **Step 2: 提交**

```bash
git add src/renderer/utils/routingTemplates.ts
git commit -m "feat(templates): add routing templates for Claude Code, Codex, Gemini"
```

---

## Phase 2: Provider 页面变更

### Task 3: 更新 Provider 列表卡片（显示模型标签）

**文件:**
- Modify: `src/renderer/pages/ProvidersPage/ProviderList.tsx`
- Modify: `src/renderer/pages/ProvidersPage/ProvidersPage.tsx`

**变更内容:**

在 Provider 卡片底部新增一行模型标签。样式与现有卡片布局一致，使用绿色标签展示 models 数组中的每个模型名。

参考设计文档中的 Provider 列表页面 mockup。

- [ ] **Step 1: 读取 ProviderList.tsx 了解卡片结构**

```bash
head -80 src/renderer/pages/ProvidersPage/ProviderList.tsx
```

找到 Provider 卡片的渲染位置

- [ ] **Step 2: 在卡片底部添加模型标签行**

在卡片的 `border-bottom` 区域后添加：

```tsx
{provider.models && provider.models.length > 0 && (
  <div style={{ padding: "10px 16px", background: "#fafafa", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
    <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>模型:</span>
    {provider.models.map(model => (
      <span
        key={model}
        style={{
          background: "#dcfce7",
          color: "#166534",
          padding: "2px 8px",
          borderRadius: 10,
          fontSize: 12,
          border: "1px solid #bbf7d0",
        }}
      >
        {model}
      </span>
    ))}
  </div>
)}
```

- [ ] **Step 3: 编译验证**

检查是否有 TypeScript 错误

- [ ] **Step 4: 提交**

```bash
git add src/renderer/pages/ProvidersPage/
git commit -m "feat(provider): show model tags on provider card"
```

### Task 4: 更新 Provider 编辑表单（添加 models 字段）

**文件:**
- Modify: `src/renderer/pages/RuleFormPage/RuleFormPage.tsx`

**变更内容:**

在表单底部新增「支持的模型」配置区，与现有表单布局风格一致。

参考设计文档中的 Provider 编辑表单 mockup。

**关键变更:**

1. state 中添加 `models` 状态：`const [models, setModels] = useState<string[]>([])`
2. 编辑模式下，从 provider.models 加载
3. 新增 `addModel(name: string)` 函数：追加到 models 数组
4. 新增 `removeModel(index: number)` 函数：从数组移除
5. 表单底部添加模型配置区域（参考现有表单的卡片风格）
6. 保存时，将 models 写入 config

```tsx
// 添加模型区域
const addModel = (name: string) => {
  if (name.trim() && !models.includes(name.trim())) {
    setModels([...models, name.trim()])
  }
}

const removeModel = (index: number) => {
  setModels(models.filter((_, i) => i !== index))
}
```

表单区域（添加到现有表单的末尾）：

```tsx
<div className={styles.section}>
  <div className={styles.sectionHeader}>
    <span className={styles.sectionTitle}>支持的模型</span>
  </div>
  <div className={styles.modelsTags}>
    {models.map((model, index) => (
      <span key={model} className={styles.modelTag}>
        {model}
        <button
          type="button"
          onClick={() => removeModel(index)}
          className={styles.modelTagRemove}
        >
          ×
        </button>
      </span>
    ))}
  </div>
  <input
    type="text"
    value={newModelName}
    onChange={e => setNewModelName(e.target.value)}
    onKeyDown={e => {
      if (e.key === "Enter") {
        e.preventDefault()
        addModel(newModelName)
        setNewModelName("")
      }
    }}
    placeholder="输入模型名称，按回车添加"
    className={styles.input}
  />
  <button type="button" onClick={() => { addModel(newModelName); setNewModelName(""); }} className={styles.addButton}>
    添加
  </button>
</div>
```

同时需要：
- 移除表单中对 `defaultModel` 和 `modelMappings` 字段的编辑（改为隐藏或注释）
- 在保存逻辑中，将 models 写入新的字段

- [ ] **Step 1: 添加 models state 和相关函数**

- [ ] **Step 2: 在编辑模式下加载 provider.models**

- [ ] **Step 3: 添加模型配置 UI 区域**

- [ ] **Step 4: 移除 defaultModel 和 modelMappings 的编辑 UI**

- [ ] **Step 5: 更新保存逻辑**

- [ ] **Step 6: 编译验证**

- [ ] **Step 7: 提交**

---

## Phase 3: 服务页面变更

### Task 5: 重写 ServicePage 列表（Group 卡片展示路由表预览）

**文件:**
- Modify: `src/renderer/pages/ServicePage/ServicePage.tsx`

**变更内容:**

重写 Group 列表卡片展示逻辑：
- 移除现有 Provider 关联列表和启用切换功能
- 展示路由表预览表格（请求模型 → Provider → 目标模型）
- 移除 failover 相关展示

参考设计文档中的服务页面 Group 列表 mockup。

- [ ] **Step 1: 读取当前 ServicePage.tsx**

```bash
wc -l src/renderer/pages/ServicePage/ServicePage.tsx
head -150 src/renderer/pages/ServicePage/ServicePage.tsx
```

- [ ] **Step 2: 重写 Group 卡片渲染逻辑**

将原来的 `ProviderList` 组件调用改为内联路由表预览表格：

```tsx
// 路由表预览表格
<div className={styles.routingTablePreview}>
  <table className={styles.routingTable}>
    <thead>
      <tr>
        <th>{t("servicePage.requestModel")}</th>
        <th>{t("servicePage.provider")}</th>
        <th>{t("servicePage.targetModel")}</th>
      </tr>
    </thead>
    <tbody>
      {group.routingTable.slice(0, 3).map((entry, i) => (
        <tr key={i} className={entry.requestModel === "default" ? styles.defaultRow : ""}>
          <td>
            {entry.requestModel === "default" ? (
              <span className={styles.defaultBadge}>{t("servicePage.default")}</span>
            ) : entry.requestModel}
          </td>
          <td>{getProviderName(entry.providerId)}</td>
          <td>{entry.targetModel}</td>
        </tr>
      ))}
      {group.routingTable.length > 3 && (
        <tr>
          <td colSpan={3} className={styles.moreRows}>
            +{group.routingTable.length - 3} more...
          </td>
        </tr>
      )}
    </tbody>
  </table>
</div>
```

- [ ] **Step 3: 移除 ProviderList 组件使用**

- [ ] **Step 4: 移除 failover 相关状态和 UI**

- [ ] **Step 5: 添加 CSS 样式**

在 `ServicePage.module.css` 中添加路由表预览相关样式

- [ ] **Step 6: 编译验证**

- [ ] **Step 7: 提交**

```bash
git add src/renderer/pages/ServicePage/
git commit -m "refactor(service): rewrite Group cards to show routing table preview"
```

### Task 6: 重写 GroupEditPage（路由表编辑）

**文件:**
- Modify: `src/renderer/pages/GroupEditPage/GroupEditPage.tsx`

**变更内容:**

重写 Group 编辑页面：
- 移除 Provider 关联配置区域
- 移除 failover 配置区域
- 直接展示路由表编辑区域
- 顶部有「从模板填充」下拉框
- default 行锁定不可删除
- 其他行可编辑、可删除
- 「+ 添加路由规则」按钮
- 底部保存按钮

参考设计文档中的 Group 详情页 mockup。

**关键变更:**

```tsx
// 路由表状态
const [routingTable, setRoutingTable] = useState<RouteEntry[]>([])

// 初始化时从 group.routingTable 加载
useEffect(() => {
  if (group?.routingTable) {
    setRoutingTable(group.routingTable)
  } else {
    // 默认有一条 default 行
    setRoutingTable([{
      requestModel: "default",
      providerId: "",
      targetModel: "",
    }])
  }
}, [group])

// 添加路由规则
const addRoute = () => {
  setRoutingTable([...routingTable, {
    requestModel: "",
    providerId: "",
    targetModel: "",
  }])
}

// 删除路由规则
const removeRoute = (index: number) => {
  if (routingTable[index].requestModel === "default") return // 不能删除 default
  setRoutingTable(routingTable.filter((_, i) => i !== index))
}

// 从模板填充
const handleTemplateFill = (templateId: string) => {
  const filled = applyTemplateToRoutes(templateId, routingTable)
  setRoutingTable(filled)
}

// 更新路由规则
const updateRoute = (index: number, field: keyof RouteEntry, value: string) => {
  setRoutingTable(routingTable.map((route, i) =>
    i === index ? { ...route, [field]: value } : route
  ))
}
```

UI 结构：

```tsx
<div className={styles.routingSection}>
  <div className={styles.routingSectionHeader}>
    <div>
      <h3>{t("servicePage.routingTable")}</h3>
      <p className={styles.hint}>{t("servicePage.routingTableHint")}</p>
    </div>
    <div className={styles.headerActions}>
      <select onChange={e => handleTemplateFill(e.target.value)} defaultValue="">
        <option value="">{t("servicePage.fillFromTemplate")}</option>
        {ROUTING_TEMPLATES.map(tpl => (
          <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
        ))}
      </select>
      <button onClick={addRoute}>+ {t("servicePage.addRoute")}</button>
    </div>
  </div>

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
        <tr key={index} className={route.requestModel === "default" ? styles.defaultRow : ""}>
          <td>
            <input
              value={route.requestModel}
              onChange={e => updateRoute(index, "requestModel", e.target.value)}
              readOnly={route.requestModel === "default"}
              className={route.requestModel === "default" ? styles.readonlyInput : ""}
            />
          </td>
          <td>
            <select
              value={route.providerId}
              onChange={e => updateRoute(index, "providerId", e.target.value)}
            >
              <option value="">{t("servicePage.selectProvider")}</option>
              {config?.providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </td>
          <td>
            <input
              value={route.targetModel}
              onChange={e => updateRoute(index, "targetModel", e.target.value)}
            />
          </td>
          <td>
            {route.requestModel !== "default" ? (
              <button onClick={() => removeRoute(index)}>🗑</button>
            ) : (
              <span className={styles.lockedLabel}>不可删除</span>
            )}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

同时需要：
- 移除 `ProviderList` 组件的使用
- 移除 failover 相关状态和 UI
- 更新保存逻辑，将 routingTable 写入 group

- [ ] **Step 1: 添加 routingTable state 和操作函数**

- [ ] **Step 2: 移除 ProviderList 和 failover 相关代码**

- [ ] **Step 3: 添加路由表编辑 UI**

- [ ] **Step 4: 更新保存逻辑**

- [ ] **Step 5: 添加 CSS 样式**

- [ ] **Step 6: 编译验证**

- [ ] **Step 7: 提交**

---

## Phase 4: i18n 和收尾

### Task 7: 更新 i18n

**文件:**
- Modify: `src/renderer/i18n/zh-CN.ts`
- Modify: `src/renderer/i18n/en-US.ts`

**新增 key:**

```typescript
// zh-CN.ts
"servicePage.routingTable": "路由表",
"servicePage.routingTableHint": "配置请求模型到 Provider 的转发规则",
"servicePage.fillFromTemplate": "从模板填充...",
"servicePage.addRoute": "添加路由规则",
"servicePage.requestModel": "请求模型",
"servicePage.provider": "Provider",
"servicePage.targetModel": "目标模型",
"servicePage.selectProvider": "选择 Provider...",
"servicePage.default": "default",
"servicePage.locked": "不可删除",
"providersPage.models": "模型",
```

- [ ] **Step 1: 添加中文翻译**

- [ ] **Step 2: 添加英文翻译**

- [ ] **Step 3: 提交**

```bash
git add src/renderer/i18n/
git commit -m "i18n: add routing table translations"
```

### Task 8: 更新 store/proxyState.ts

**文件:**
- Modify: `src/renderer/store/proxyState.ts`

**变更内容:**

检查 proxyState 中是否有对旧字段的引用，如有则更新。

- [ ] **Step 1: 搜索旧字段引用**

```bash
grep -n "defaultModel\|modelMapping\|activeProviderId\|providerIds" src/renderer/store/proxyState.ts
```

- [ ] **Step 2: 如有引用则更新**

根据新类型调整

### Task 9: 更新 store/proxyActions.ts

**文件:**
- Modify: `src/renderer/store/proxyActions.ts`

**变更内容:**

检查 saveConfig 等 action 是否需要更新，确保 routingTable 和 models 字段被正确保存。

- [ ] **Step 1: 搜索 save 相关函数**

```bash
grep -n "saveConfig\|saveGroup\|saveRule" src/renderer/store/proxyActions.ts | head -20
```

- [ ] **Step 2: 检查并更新保存逻辑**

确保 routingTable 和 models 被写入

- [ ] **Step 3: 编译验证**

### Task 10: 全量检查和提交

- [ ] **Step 1: 运行 TypeScript 检查**

```bash
cd src/renderer && npx tsc --noEmit 2>&1 | head -50
```

- [ ] **Step 2: 修复所有类型错误**

- [ ] **Step 3: 提交前端变更**

```bash
git add src/renderer/
git commit -m "refactor(frontend): routing table UI implementation"
```

---

## 自检清单

- [ ] `types/proxy.ts`: `Rule` 有 `models: string[]`，`Group` 有 `routingTable: RouteEntry[]`
- [ ] `routingTemplates.ts`: 有 Claude Code、Codex、Gemini 模板
- [ ] `ProviderList.tsx`: 卡片底部显示模型标签
- [ ] `RuleFormPage.tsx`: 表单底部有「支持的模型」配置区
- [ ] `ServicePage.tsx`: Group 卡片展示路由表预览，移除 Provider 列表和 failover
- [ ] `GroupEditPage.tsx`: 直接展示路由表编辑区，default 行锁定，有模板填充
- [ ] i18n: 所有新增 key 有中英文翻译
- [ ] `npx tsc --noEmit` 无错误
- [ ] git commit 已创建
