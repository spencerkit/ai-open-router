# 服务页面 & Provider 页面重构设计

日期: 2026-04-12

## 1. 概述

将 Provider 页面的单模型支持升级为多模型，同时将服务页面的 Provider 关联模式重构为模型路由表模式。

## 2. 数据结构

### 2.1 Provider 新增 models 字段

```ts
interface Provider {
  id: string
  name: string
  token: string
  apiAddress: string
  protocol: RuleProtocol
  website?: string
  models: string[]  // 新增：支持的模型名称列表
  headerPassthroughAllow?: string[]
  headerPassthroughDeny?: string[]
  quota: RuleQuotaConfig
  cost?: RuleCostConfig
  // 移除: defaultModel, modelMappings (旧字段，不再使用)
}
```

### 2.2 Group 路由表化

```ts
interface RouteEntry {
  requestModel: string   // 请求模型名，如 "opus"、"claude-sonnet-4"，或 "default"
  providerId: string     // 引用的全局 Provider ID
  targetModel: string    // 转发到的目标模型名
}

interface Group {
  id: string
  name: string
  routingTable: RouteEntry[]  // 必含 requestModel === "default" 的行
  // 移除: models, providerIds, activeProviderId, providers, rules
}
```

### 2.3 向后兼容迁移

**Provider 迁移**:
- 旧 `defaultModel` + `modelMappings` 废弃，不再使用
- `models` 初始为空数组，用户手动添加

**Group 迁移**:
- `providerIds` + `activeProviderId` + `providers` 废弃，不再使用
- 新建 Group 时自动生成一条 `default` 行（`requestModel: "default"`）
- 旧 Group 迁移：取 `activeProviderId` 对应的 Provider 信息，生成一条 `default` 行

## 3. 运行时路由行为

当请求到达时：
1. 从请求体提取 `model` 字段
2. 在 Group 的 `routingTable` 中查找 `requestModel === model` 的行
3. 找到 → 使用该行的 `providerId` + `targetModel` 转发
4. 未找到 → 查找 `requestModel === "default"` 的行，使用该行的 `providerId` + `targetModel` 转发

## 4. 系统预设模板

预置主流 Agent 的模型配置模板，仅系统内置，不可编辑。用户选择模板后自动生成路由行。

| 模板名 | 路由行 |
|--------|--------|
| Claude Code | opus → claude-opus-3-5, sonnet → claude-sonnet-4, haiku → claude-haiku-4 |
| Codex | gpt-5.4, gpt-5.3-codex, gpt-5.2-codex, gpt-5.1-codex |
| Gemini | gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash |

模板仅填充 `requestModel` 和 `targetModel`，`providerId` 由用户手动选择。

## 5. Provider 页面变更

### 5.1 列表页面

- 保持现有卡片布局不变
- 卡片底部新增一行模型标签：显示 `models` 数组中的每个模型名称（绿色标签）
- 其他功能（编辑、删除、导入等）保持不变

### 5.2 编辑表单

- 现有所有字段（name, token, apiAddress, protocol, quota 等）保持不变
- 新增「支持的模型」配置区：
  - 显示已添加的模型标签（可删除）
  - 输入框：输入模型名称，按回车或点击添加按钮添加
- 移除：旧 `defaultModel` 和 `modelMappings` 字段

## 6. 服务页面变更

### 6.1 Group 列表页面

- 保持现有页面布局不变
- Group 卡片：
  - 展示路由表预览（表格：请求模型 → Provider → 目标模型）
  - 移除现有 Provider 关联列表和启用切换功能
  - 移除 failover 功能
- 「添加分组」功能保持原样不变

### 6.2 Group 详情/编辑页面

- 移除现有 Provider 关联配置区域
- 直接展示路由表编辑区域：
  - 表格列：请求模型 / Provider / 目标模型 / 操作
  - `default` 行：锁定，不可删除，Provider 和目标模型可编辑
  - 其他行：可编辑、可删除
  - 顶部「从模板填充」下拉框：选择模板自动生成路由行
  - 「+ 添加路由规则」按钮：新增一行空白编辑行
- 底部保存按钮

## 7. 路由表模板填充交互

1. 用户在 Group 详情页打开路由表编辑区
2. 选择「从模板填充」下拉框中的模板（如 Claude Code）
3. 系统自动在表格下方追加模板对应的路由行
4. `providerId` 列显示为空（需用户手动选择 Provider）
5. 用户补充 Provider 选择后保存

## 8. 路由表验证规则

- 每个 Group 的 `routingTable` 必须包含且仅包含一条 `requestModel === "default"` 的行
- `requestModel` 值唯一，不能有重复
- `providerId` 引用的 Provider 必须存在于全局 Provider 列表中
- `targetModel` 不可为空

## 9. 同步与老数据处理

### 9.1 同步功能

- 同步内容不变，仍然是完整 config 文件
- 所有旧字段（`defaultModel`、`modelMappings`、`providerIds`、`activeProviderId`、`providers`、`failover`）在代码中不再读取
- config 文件中这些旧字段可以保留（便于回滚），但不影响运行时行为

### 9.2 老数据处理

**直接不兼容。** 不做迁移逻辑，不保留旧字段。

- 同步/导入时，如果 Group 不包含 `routingTable` → 过滤掉（不展示、不报错）
- 同步/导入时，如果 Provider 不包含 `models` 字段 → 过滤掉
- 不需要任何迁移脚本或配置转换逻辑

## 10. 技术变更范围

### 10.1 前端 (React/TypeScript)

- `src/renderer/types/proxy.ts`: 更新 `Provider` 和 `Group` 类型定义
- `src/renderer/pages/ProvidersPage/`: Provider 列表页面添加模型标签行
- `src/renderer/pages/RuleFormPage/`: 添加 models 字段编辑组件
- `src/renderer/pages/ServicePage/`: 重构为 Group 列表 + 路由表预览
- `src/renderer/pages/GroupEditPage/`: 添加路由表编辑区域
- `src/renderer/utils/routingTemplates.ts`: 新增系统预设模板
- `src/renderer/store/proxyState.ts`: 更新状态管理

### 10.2 后端 (Rust)

- `src-tauri/src/domain/entities.rs`: 更新 `Rule` 和 `Group` 结构体
- `src-tauri/src/proxy/routing.rs`: 重写路由解析逻辑
- `src-tauri/src/services/config_service.rs`: 更新配置加载逻辑，移除旧字段读取
- `src-tauri/src/commands/`: 必要时新增/修改命令
