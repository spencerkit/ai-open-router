# 路由表重构 — 后端实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 重构后端数据结构和路由逻辑，支持 Provider 多模型和 Group 路由表

**架构：** 数据结构变更在 entities.rs 和 models.rs，路由逻辑在 routing.rs，配置加载时过滤无效数据

**技术栈：** Rust (serde, uuid)

---

## Phase 1: 类型定义变更

### Task 1: 更新 domain/entities.rs

**文件:**
- Modify: `src-tauri/src/domain/entities.rs`

**变更内容:**

1. 在 `Rule` 结构体中新增 `models` 字段，移除 `default_model` 和 `model_mappings`（旧字段仍保留在结构体中，但标记废弃）
2. 新增 `RouteEntry` 结构体
3. 重构 `Group` 结构体，移除 `models`、`provider_ids`、`active_provider_id`、`providers`、`failover`，新增 `routing_table`

**变更代码:**

```rust
// 在 Rule 结构体中添加 models 字段（在 quota 字段之前添加）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub protocol: RuleProtocol,
    pub token: String,
    pub api_address: String,
    #[serde(default)]
    pub website: String,
    #[serde(default)]
    pub models: Vec<String>,  // 新增
    #[serde(default)]
    pub header_passthrough_allow: Vec<String>,
    #[serde(default)]
    pub header_passthrough_deny: Vec<String>,
    #[serde(default = "default_rule_quota_config")]
    pub quota: RuleQuotaConfig,
    #[serde(default = "default_rule_cost_config")]
    pub cost: RuleCostConfig,
    // 旧字段保留但标记废弃（向后兼容）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_mappings: Option<HashMap<String, String>>,
}

// 新增 RouteEntry 结构体
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteEntry {
    pub request_model: String,
    pub provider_id: String,
    pub target_model: String,
}

// 重构 Group 结构体
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub routing_table: Vec<RouteEntry>,  // 新增，必含 default 行
    // 旧字段保留但标记废弃
    #[serde(skip_serializing_if = "Option::is_none")]
    pub models: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_provider_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub providers: Option<Vec<Rule>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failover: Option<GroupFailoverConfig>,
}
```

- [ ] **Step 1: 修改 src-tauri/src/domain/entities.rs**

添加 `models` 到 `Rule`，新增 `RouteEntry`，重构 `Group`（保留旧字段用 `skip_serializing_if` 和 `Option` 处理）

- [ ] **Step 2: 提交**

```bash
git add src-tauri/src/domain/entities.rs
git commit -m "refactor(backend): update entities for routing table"
```

### Task 2: 更新 models.rs

**文件:**
- Modify: `src-tauri/src/models.rs`

**变更内容:**

检查 `models.rs` 中是否定义了 `Rule`/`Group` 的别名或重导出。如果有，更新为使用新的 `domain::entities` 定义。

- [ ] **Step 1: 检查 src-tauri/src/models.rs 内容**

```bash
head -50 src-tauri/src/models.rs
```

查看是否有 Rule/Group 类型定义或别名

- [ ] **Step 2: 如有变更则修改**

根据 Task 1 的变更更新 models.rs

- [ ] **Step 3: 编译验证**

```bash
cd src-tauri && cargo check 2>&1 | head -30
```

预期: 无编译错误（可能有未使用字段的 warning，不影响）

### Task 3: 更新 config/migrator.rs

**文件:**
- Modify: `src-tauri/src/config/migrator.rs`

**变更内容:**

Bump `CURRENT_CONFIG_VERSION` 从 4 到 5，并添加 v4→v5 迁移逻辑：过滤无效 groups（无 routing_table）和 providers（无 models）。

```rust
pub const CURRENT_CONFIG_VERSION: u32 = 5;  // 从 4 改为 5

// 在 migrate_config 的 match 中添加:
4 => migrate_v4_to_v5(root),

// 新增迁移函数:
fn migrate_v4_to_v5(mut root: Value) -> Value {
    let obj = root.as_object_mut().unwrap();

    // 过滤无效 groups（无 routing_table）
    if let Some(groups) = obj.get_mut("groups").and_then(|v| v.as_array_mut()) {
        groups.retain(|g| {
            g.get("routingTable")
                .or_else(|| g.get("routing_table"))
                .is_some()
        });
    }

    // 过滤无效 providers（无 models）
    if let Some(providers) = obj.get_mut("providers").and_then(|v| v.as_array_mut()) {
        providers.retain(|p| {
            p.get("models").is_some()
        });
    }

    root
}
```

- [ ] **Step 1: 更新 CURRENT_CONFIG_VERSION 为 5**

- [ ] **Step 2: 在 while loop 的 match 中添加 4 => migrate_v4_to_v5(root)**

- [ ] **Step 3: 添加 migrate_v4_to_v5 函数**

- [ ] **Step 4: 编译验证**

```bash
cd src-tauri && cargo check 2>&1 | head -30
```

### Task 4: 更新 config/schema.rs

**文件:**
- Modify: `src-tauri/src/config/schema.rs`

**变更内容:**

1. 更新 `normalize_config` 中的 groups 和 providers 规范化逻辑
2. 确保新建 group 时默认生成 routing_table（包含一条 default 行）
3. 确保新建 provider 时默认 models 为空 Vec

- [ ] **Step 1: 读取当前 normalize_config 函数**

```bash
grep -n "fn normalize_config" src-tauri/src/config/schema.rs
```

找到 normalize_config 函数位置

- [ ] **Step 2: 检查 normalize_groups 和 normalize_providers 函数**

查找 groups 和 providers 的规范化逻辑

- [ ] **Step 3: 更新 groups 规范化逻辑**

在 groups 规范化时，确保每条 group 有 routing_table 字段。如果没有 routing_table 且有旧字段（provider_ids 等），跳过该 group（由 migrator 处理）。

```rust
// 在 normalize_groups 中，对于每个 group：
// 如果没有 routing_table 且没有旧 provider_ids，跳过
// 如果有 routing_table，确保有 default 行（如果没有则添加一条 default 行，其中 provider_id 为空字符串，target_model 为空字符串）
```

- [ ] **Step 4: 更新 providers 规范化逻辑**

确保每条 provider 有 models 字段，默认为空 Vec

- [ ] **Step 5: 编译验证**

```bash
cd src-tauri && cargo check 2>&1 | head -30
```

### Task 5: 更新 config_store.rs

**文件:**
- Modify: `src-tauri/src/config_store.rs`

**变更内容:**

在加载 groups 和 providers 时，过滤无效数据：
- Group 没有 routing_table 字段 → 过滤掉
- Provider 没有 models 字段 → 过滤掉

```rust
// 在 load_groups_and_providers_from_db 或相关加载逻辑中添加过滤
// groups.retain(|g| g.routing_table.is_empty() == false);
// providers.retain(|p| p.models.is_empty() == true || !p.models.is_empty());
```

实际上，由于 entities.rs 中 models 和 routing_table 已经是必填字段（默认为空 Vec），这一步主要是在 config 导入/同步路径中过滤。

- [ ] **Step 1: 查找 config_store.rs 中的加载逻辑**

重点关注 `load_groups_and_providers_from_db` 和任何外部 config 导入路径

- [ ] **Step 2: 在导入路径添加过滤逻辑**

过滤掉没有 routing_table 的 group 和没有 models 的 provider

- [ ] **Step 3: 编译验证**

---

## Phase 2: 路由逻辑重构

### Task 6: 重写 proxy/routing.rs

**文件:**
- Modify: `src-tauri/src/proxy/routing.rs`

**变更内容:**

重写路由解析逻辑，从旧的 `active_provider_id` + `model_mappings` 模式改为 `routing_table` 模式。

**核心变更:**

1. `ActiveRoute` 结构体变更：
   - 移除 `preferred_provider_id`、`providers_by_id`、`failover`
   - 新增 `routing_table: Vec<RouteEntry>`
   - `rule` 字段保留但含义变化（不再作为转发目标）

2. `build_route_index` 重写：
   - 从 group.active_provider_id 改为 group.routing_table
   - 不再查找 active provider，直接构建路由表

3. `resolve_runtime_active_route` 重写：
   - 根据请求 model 查 routing_table
   - 精确匹配 → 使用对应行
   - 未找到 → 使用 default 行
   - 获取 provider 信息并构建转发

4. `resolve_target_model` 重写：
   - 不再使用 rule.model_mappings
   - 直接使用 route_entry.target_model

5. `assert_rule_ready` 变更：
   - 不再验证 rule.default_model
   - 验证 routing_table 不为空且包含 default 行
   - 验证选中的 provider 存在

**关键代码变更:**

```rust
// ActiveRoute 新结构
pub(super) struct ActiveRoute {
    pub group_id: String,
    pub group_name: String,
    pub routing_table: Vec<RouteEntry>,
}

// build_route_index 变更
pub(super) fn build_route_index(config: &ProxyConfig) -> RouteIndex {
    let mut index = HashMap::with_capacity(config.groups.len());
    for group in &config.groups {
        if group.routing_table.is_empty() {
            index.insert(group.id.clone(), RouteResolution::NoRoutingTable {
                group_name: group.name.clone(),
            });
            continue;
        }
        let has_default = group.routing_table.iter().any(|e| e.request_model == "default");
        if !has_default {
            index.insert(group.id.clone(), RouteResolution::NoDefaultRoute {
                group_name: group.name.clone(),
            });
            continue;
        }
        let resolution = RouteResolution::Ready(ActiveRoute {
            group_id: group.id.clone(),
            group_name: group.name.clone(),
            routing_table: group.routing_table.clone(),
        });
        index.insert(group.id.clone(), resolution);
    }
    index
}

// resolve_runtime_active_route 变更
pub(super) fn resolve_runtime_active_route(
    state: &ServiceState,
    route: &ActiveRoute,
    request_model: &str,
) -> Result<(ActiveRoute, &Rule), String> {
    // 1. 在 routing_table 中查找 request_model
    let entry = route.routing_table.iter()
        .find(|e| e.request_model == request_model)
        .or_else(|| route.routing_table.iter().find(|e| e.request_model == "default"))
        .ok_or("No default route found")?;

    // 2. 查找 provider
    let config = state.config.read().map_err(|_| "config lock poisoned")?;
    let provider = config.providers.iter()
        .find(|p| p.id == entry.provider_id)
        .ok_or_else(|| format!("Provider {} not found", entry.provider_id))?;

    // 3. 构建转发用的 ActiveRoute（含选中的 entry）
    let mut resolved = route.clone();
    resolved.routing_table = vec![entry.clone()]; // 只保留命中的那条
    Ok((resolved, provider))
}
```

同时需要：
- 移除所有 `failover` 相关逻辑的引用
- 更新 `RouteResolution` 枚举
- 移除 `select_route_provider`、`record_route_provider_failure` 等 failover 相关函数中对 failover_state 的依赖

- [ ] **Step 1: 修改 ActiveRoute 结构体**

- [ ] **Step 2: 修改 RouteResolution 枚举**

- [ ] **Step 3: 重写 build_route_index**

- [ ] **Step 4: 重写 resolve_runtime_active_route**

- [ ] **Step 5: 重写 resolve_target_model**

- [ ] **Step 6: 移除/注释 failover 相关逻辑**

- [ ] **Step 7: 编译验证**

```bash
cd src-tauri && cargo check 2>&1 | head -50
```

预期: 可能有编译错误，需要根据错误调整

### Task 7: 更新 proxy/failover.rs

**文件:**
- Modify: `src-tauri/src/proxy/failover.rs`

**变更内容:**

由于 failover 功能已被移除，需要清理 failover 模块。可以：
- 选项A：保留文件但移除所有逻辑（空模块）
- 选项B：删除文件并从 proxy.rs 中移除引用

推荐选项A，便于将来如果需要可以加回来。

- [ ] **Step 1: 检查 proxy.rs 中对 failover 的引用**

```bash
grep -n "failover" src-tauri/src/proxy.rs
```

- [ ] **Step 2: 更新/移除相关引用**

将 failover 相关的函数调用改为 no-op 或移除

- [ ] **Step 3: 编译验证**

```bash
cd src-tauri && cargo check 2>&1 | head -50
```

---

## Phase 3: 服务层和 API 更新

### Task 8: 更新 services/config_service.rs

**文件:**
- Modify: `src-tauri/src/services/config_service.rs`

**变更内容:**

移除对旧字段的读取和写入逻辑。新增 Group 时自动生成 routing_table（包含一条 default 行）。

- [ ] **Step 1: 查找所有对旧字段的引用**

```bash
grep -n "default_model\|model_mapping\|active_provider_id\|provider_id" src-tauri/src/services/config_service.rs
```

- [ ] **Step 2: 移除或注释旧字段逻辑**

- [ ] **Step 3: 确保新建 Group 时有默认 routing_table**

```rust
// 在创建 Group 的地方添加:
let default_route = RouteEntry {
    request_model: "default".to_string(),
    provider_id: String::new(),
    target_model: String::new(),
};
group.routing_table = vec![default_route];
```

- [ ] **Step 4: 编译验证**

### Task 9: 更新 http_api.rs 和 api/dto.rs

**文件:**
- Modify: `src-tauri/src/http_api.rs`
- Modify: `src-tauri/src/api/dto.rs`

**变更内容:**

检查 HTTP API 是否返回 groups/providers 数据，更新 DTO 结构以匹配新的 entities。

- [ ] **Step 1: 搜索 http_api.rs 中的 group/provider 返回逻辑**

```bash
grep -n "Group\|Rule\|Provider" src-tauri/src/http_api.rs | head -20
```

- [ ] **Step 2: 如有变更则修改**

确保 API 返回的数据包含新的 routing_table 和 models 字段

- [ ] **Step 3: 编译验证**

### Task 10: 全量编译检查

**文件:**
- 无文件变更

- [ ] **Step 1: 运行完整编译**

```bash
cd src-tauri && cargo build 2>&1
```

- [ ] **Step 2: 修复所有编译错误**

根据错误逐个修复

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/
git commit -m "refactor(backend): routing table data structures and routing logic"
```

---

## 自检清单

- [ ] entities.rs: `Rule` 有 `models: Vec<String>`，`Group` 有 `routing_table: Vec<RouteEntry>`
- [ ] migrator.rs: `CURRENT_CONFIG_VERSION` = 5，有 v4→v5 迁移过滤逻辑
- [ ] routing.rs: `build_route_index` 使用 `routing_table`，`resolve_runtime_active_route` 根据 request_model 查找 routing_table
- [ ] routing.rs: 移除了 `failover` 相关逻辑
- [ ] config_service.rs: 新建 Group 时有默认 routing_table
- [ ] `cargo build` 编译通过
