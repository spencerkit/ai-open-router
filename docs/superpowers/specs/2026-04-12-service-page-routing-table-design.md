# Service Page Routing Table Design

## Goal
让 ServicePage 成为当前分组路由表的主编辑入口：去掉当前 provider 列表展示，改为直接展示并编辑 routing table；`targetModel` 由自由输入改为基于已选 provider 的模型下拉；同时引入统一的公共 Select 组件，规范路由表相关下拉视觉样式。

## Scope
本次改造只覆盖以下范围：
- `ServicePage` 右侧主内容区不再展示 provider 卡片列表，改为展示当前 group 的 routing table 编辑器
- 新增仅供 `ServicePage` 使用的 `RoutingTableEditor` 组件
- `targetModel` 选择改为依赖 `provider.models` 的下拉选项
- 为模板、provider、target model 下拉统一引入公共 Select 组件
- `GroupEditPage` 保持现有逻辑，不改为复用新的 `RoutingTableEditor`

不在本次范围内：
- 不删除 `GroupEditPage`
- 不把 `GroupEditPage` 的业务逻辑迁移到 `ServicePage`
- 不实现 searchable combobox、自由输入回退、批量编辑等增强能力
- 不改动 Provider 配置页以外的其他业务流

## Existing Context
当前代码状态：
- `src/renderer/pages/ServicePage/ServicePage.tsx` 右侧仍通过 `ProviderList` 展示 active group 的 provider 列表，并保留旧的 provider 视角逻辑
- `src/renderer/pages/GroupEditPage/GroupEditPage.tsx` 已有 routing table 编辑逻辑：模板填充、添加/删除 route、默认 `default` 行保护、保存校验
- 路由表中的 provider/template 选择仍使用裸 `<select>`，视觉风格与现有 `Input` / `Button` 不一致
- `targetModel` 当前仍是手动输入，无法从 provider 已配置的 `models` 中选择

这意味着 ServicePage 需要拥有一套独立的 routing table 编辑 UI，但可以复用既有的数据规则（如 default route 必须存在、template append 逻辑、保存时更新 group.routingTable）。

## Design Decisions

### 1. ServicePage 成为主编辑入口
ServicePage 保留左侧 group 列表与顶部/基础信息区，但右侧当前 provider 列表区域替换为 routing table 编辑器。用户切换 group 后，直接在服务页编辑当前 group 的 `routingTable`，并通过显式“保存”按钮统一落盘。

这样做的原因：
- 用户要在服务页直接维护模型到 provider 的映射，而不是先看 provider 列表再跳编辑页
- 显式保存与当前用户偏好一致，避免即时落盘导致半完成状态写入配置
- 保留 GroupEditPage 原样，可降低回归风险并避免本次范围膨胀

### 2. 新建仅供 ServicePage 使用的 RoutingTableEditor
新增 `RoutingTableEditor` 组件，职责只限于：
- 渲染当前 routing table draft
- 处理本地编辑态（新增 route、删除 route、模板填充、字段联动）
- 点击保存时把完整 `nextRoutingTable` 回传给 `ServicePage`

它不会直接写 store，也不会被 `GroupEditPage` 复用。`ServicePage` 作为页面级容器，继续负责：
- 读取当前 group / providers
- 组装 `nextConfig`
- 调用 `saveConfigAction`
- toast 与保存状态反馈

### 3. targetModel 改为 provider 依赖下拉
每条 route 保留四列：
- `requestModel`
- `provider`
- `targetModel`
- `actions`

交互规则：
- `default` 行始终存在且不可删除
- 用户先选择 provider
- 选中 provider 后，`targetModel` 变为基于该 provider `models` 的单选下拉
- 如果 provider 未选：target model 下拉 disabled，显示 placeholder（如“先选择 Provider”）
- 如果 provider 已选但该 provider 没有 models：target model 下拉 disabled，显示空态 placeholder（如“该 Provider 暂无模型可选”）
- 如果切换 provider 后，旧 `targetModel` 不在新 provider 的 `models` 中，则自动清空，避免配置悬空值

本次不支持 target model 自由输入，以确保数据来源和 Provider 配置保持一致。

### 4. 新增公共 Select 组件统一视觉
在 `src/renderer/components/` 下新增一个基础单选组件（例如 `select/` 目录下的 `index.tsx` + `index.module.css`），用于统一以下场景：
- routing table 的模板选择
- provider 选择
- target model 选择
- 如有低风险，也可顺手替换 `GroupEditPage` 中裸 `<select>` 为新组件，仅做样式统一，不改其业务逻辑

公共 Select 组件的最低能力：
- 受控 `value` / `onChange`
- `options` 渲染
- placeholder option
- `disabled`
- `className` 扩展
- 与现有 `Input` / `Button` 一致的边框、圆角、padding、focus ring、disabled 态

本次不做 searchable、multi-select、async options 等复杂能力。

## Component Responsibilities

### `src/renderer/pages/ServicePage/ServicePage.tsx`
负责：
- 选中 group 后读取 `activeGroup.routingTable`
- 将当前 group providers（建议来源仍为 `config.providers`，按 route/providerIds 推导可见项）传入新编辑器
- 处理 `onSave(nextRoutingTable)` 并生成 `nextConfig`
- provider 列表区替换为路由表编辑区

### `src/renderer/pages/ServicePage/RoutingTableEditor.tsx`
负责：
- 本地 draft state
- route row 渲染
- template append
- provider change → targetModel 联动清空
- default 行保护
- 保存前校验 default 行存在
- 将保存结果回传给父组件

### `src/renderer/components/select/index.tsx`
负责：
- 封装统一样式的基础单选组件
- 保持轻量、纯展示/交互，不承载业务逻辑

## State & Data Flow
1. ServicePage 读取当前 `activeGroup` 与 providers 列表
2. `RoutingTableEditor` 初始化本地 `draftRoutingTable`
3. 用户在编辑器内修改 draft，不立即写全局 config
4. 用户点击保存后：
   - `RoutingTableEditor` 做最小校验（至少有 `default`）
   - 回调 `onSave(nextRoutingTable)` 给 `ServicePage`
5. `ServicePage` 生成：
   - `nextConfig.groups = config.groups.map(...)`
   - 仅更新当前 group 的 `routingTable`
6. `saveConfigAction(nextConfig)` 成功后，toast success；失败后 toast error

## UI Structure
ServicePage 右侧主区域推荐结构：
1. 分组基础信息区（保留当前 group 名称、路径、必要状态）
2. RoutingTableEditor 区：
   - 标题
   - hint 文案
   - 工具栏（模板下拉、添加路由、保存）
   - 路由表
3. 其他现有与分组直接相关的区块保持原位

路由表视觉规则：
- `default` 行显示 locked 标识
- 行内 Select 和 Input 高度统一
- 禁用 target model 时视觉明显区分
- 表格列宽稳定，避免 provider/model 长文本导致布局抖动

## Validation Rules
- routing table 必须至少有一条 `requestModel === "default"` 的 route
- `default` route 不允许删除
- 保存时允许 providerId / targetModel 暂为空，但 UI 应清楚提示未完成配置状态
- 切换 provider 导致 targetModel 失效时自动清空 targetModel
- route 顺序按用户编辑结果保留，不额外排序

## Testing Plan

### Unit tests
1. `ServicePage`：
- 不再渲染旧 `ProviderList`
- 渲染新的 routing table 编辑区
- 保存后只更新当前 group 的 `routingTable`

2. `RoutingTableEditor`：
- 默认 `default` 行不可删除
- 添加 route 成功
- 模板填充追加 route，不覆盖现有 `default`
- provider 选中后 targetModel 下拉展示对应 `models`
- provider 变更后无效的 targetModel 被清空
- 缺失 `default` 时阻止保存并提示错误
- provider 未选 / provider 无 models 时 targetModel 下拉禁用

3. 公共 `Select`：
- placeholder 渲染
- disabled 状态
- option 选择回调
- 基础 className / value 行为正常

### E2E tests
- 打开服务页并选择 group
- 直接在服务页修改 routing table
- 选择 provider
- 从 targetModel 下拉中选择 provider 的某个 model
- 保存
- 刷新或重新进入后回显正确

## File Impact
预计涉及文件：
- Modify: `src/renderer/pages/ServicePage/ServicePage.tsx`
- Create: `src/renderer/pages/ServicePage/RoutingTableEditor.tsx`
- Create: `src/renderer/pages/ServicePage/RoutingTableEditor.module.css`（或复用现有模块样式并最小新增）
- Create: `src/renderer/components/select/index.tsx`
- Create: `src/renderer/components/select/index.module.css`
- Modify: `src/renderer/components/index.ts` 或等价 barrel
- Optional modify: `src/renderer/pages/GroupEditPage/GroupEditPage.tsx`（仅在低风险情况下切换为公共 Select，业务逻辑不改）
- Modify: `tests/unit/servicePage*.test.ts*`（若已有）
- Create/Modify: `tests/unit/routingTableEditor.test.tsx`
- Modify: `scripts/e2e-headless.js`
- Modify: `e2e-tests/specs/app.e2e.js`

## Risks & Mitigations
- **风险：** ServicePage 现有 provider 相关运行态展示被完全移除后，可能丢失有价值状态信息  
  **缓解：** 仅移除 provider 列表，不移除 group 基础状态；若需要，可在路由表旁保留轻量状态摘要而不是整套 provider 卡片

- **风险：** targetModel 改成纯下拉后，旧配置中存在不在 provider.models 内的值时显示异常  
  **缓解：** 编辑态允许显示当前值为临时 fallback option，直到用户重新选择；保存新值时再收敛为 provider.models 中的合法项

- **风险：** 新增公共 Select 后样式替换范围过大  
  **缓解：** 本次先只在 routing table 相关入口使用；GroupEditPage 是否替换只做低风险附带项

## Recommendation
按本 spec 实施：
- ServicePage 直接编辑 routingTable
- GroupEditPage 保持现状
- 新增 ServicePage 专用 `RoutingTableEditor`
- 新增公共 Select 统一视觉
- targetModel 改为基于 provider.models 的受限选择
