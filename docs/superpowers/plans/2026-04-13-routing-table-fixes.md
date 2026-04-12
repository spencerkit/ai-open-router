# Routing Table Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 RoutingTableEditor 的三个问题：Claude 模板模型名错误、requestModel 输入框失焦 bug、路由匹配改为 fuzzy contains + 最长匹配优先。

**Architecture:** 前端两个文件（模板数据、React key）+ 后端一个文件（路由匹配 Rust 逻辑）。

**Tech Stack:** React + TypeScript (前端)，Rust (后端)

---

## 文件影响范围

- `src/renderer/utils/routingTemplates.ts` — 修复模板数据 + 新增 `findRoute` 工具
- `src/renderer/pages/ServicePage/RoutingTableEditor.tsx:174` — 修复表格行 key
- `src-tauri/src/proxy/routing.rs:318-348` — 修改 `resolve_runtime_active_route` 匹配逻辑
- `src-tauri/src/proxy/routing.rs` — 新增 fuzzy match 单元测试

---

## Task 1: 修复 Claude Code 模板的 requestModel

**文件：** `src/renderer/utils/routingTemplates.ts`

- [ ] **Step 1: 修改模板 requestModel 为完整模型 ID**

在 `ROUTING_TEMPLATES` 的 `claude-code` 模板中，将三个 `requestModel` 值改为：

```typescript
{
  id: "claude-code",
  name: "Claude Code",
  routes: [
    { requestModel: "claude-opus-4-6", targetModel: "claude-opus-3-5" },
    { requestModel: "claude-sonnet-4-6", targetModel: "claude-sonnet-4" },
    { requestModel: "claude-haiku-4-5-20251001", targetModel: "claude-haiku-4" },
  ],
}
```

注意 `targetModel` 保持原样（取决于用户 Provider 的实际配置），只改 `requestModel`。

- [ ] **Step 2: 验证 TypeScript 类型检查**

Run: `cd /home/spencer/workspace/oc-proxy && npx tsc --noEmit`
Expected: PASS，无新增类型错误

- [ ] **Step 3: 提交**

```bash
git add src/renderer/utils/routingTemplates.ts
git commit -m "fix(templates): use correct Claude model IDs in Claude Code template"
```

---

## Task 2: 修复 requestModel 输入框失焦 bug

**文件：** `src/renderer/pages/ServicePage/RoutingTableEditor.tsx:174`

- [ ] **Step 1: 找到并修改表格行 key**

当前代码（约第 173-176 行）：

```tsx
key={`${route.requestModel || "route"}-${route.providerId || "provider"}-${route.targetModel || "target"}`}
```

改为：

```tsx
key={`route-row-${index}`}
```

**根因说明：** 原 key 包含 `requestModel`，每次用户输入一个字符 React diff 发现 key 变化，认为是不同行，销毁旧 DOM 并重新挂载，导致光标丢失。

- [ ] **Step 2: 验证 TypeScript 类型检查**

Run: `cd /home/spencer/workspace/oc-proxy && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add src/renderer/pages/ServicePage/RoutingTableEditor.tsx
git commit -m "fix(frontend): use stable index-based key for routing table rows"
```

---

## Task 3: 路由匹配改为 fuzzy（contains）+ 最长匹配优先

### Part A：前端 `findRoute` 工具函数

**文件：** `src/renderer/utils/routingTemplates.ts`

- [ ] **Step A1: 新增 `findRoute` 工具函数**

在 `routingTemplates.ts` 文件末尾添加：

```typescript
/**
 * Find the best matching route for an incoming model using fuzzy (contains) matching.
 * If multiple routes match, the one with the longest requestModel wins (most specific).
 * Falls back to the "default" route if no match is found.
 */
export function findRoute(
  routes: RouteEntry[],
  incomingModel: string
): RouteEntry | null {
  const matches = routes.filter(route => incomingModel.includes(route.requestModel))

  if (matches.length === 0) {
    return routes.find(route => route.requestModel === "default") ?? null
  }

  return matches.reduce((best, current) =>
    current.requestModel.length > best.requestModel.length ? current : best
  )
}
```

- [ ] **Step A2: 验证 TypeScript 类型检查**

Run: `cd /home/spencer/workspace/oc-proxy && npx tsc --noEmit`
Expected: PASS

- [ ] **Step A3: 提交**

```bash
git add src/renderer/utils/routingTemplates.ts
git commit -m "feat(frontend): add findRoute with fuzzy contains + longest-match"
```

### Part B：后端 Rust fuzzy matching 逻辑

**文件：** `src-tauri/src/proxy/routing.rs:318-348`

- [ ] **Step B1: 找到当前 `resolve_runtime_active_route` 函数**

当前实现（行 318-348）使用精确匹配：

```rust
let entry = route
    .routing_table
    .iter()
    .find(|e| e.request_model == request_model)
    .or_else(|| route.routing_table.iter().find(|e| e.request_model == "default"))
    .ok_or("No default route found in routing table")?;
```

- [ ] **Step B2: 替换为 fuzzy contains + longest-match 逻辑**

将 `resolve_runtime_active_route` 函数中的匹配逻辑替换为：

```rust
// 1. Find all routes where the incoming model contains the route's request_model (fuzzy match)
let matches: Vec<&RouteEntry> = route
    .routing_table
    .iter()
    .filter(|e| request_model.contains(&e.request_model))
    .collect();

// 2. If matches exist, pick the longest request_model (most specific match)
let entry = if matches.is_empty() {
    // No fuzzy match — fall back to "default"
    route
        .routing_table
        .iter()
        .find(|e| e.request_model == "default")
        .ok_or("No default route found in routing table")?
} else {
    // Pick the match with the longest request_model
    matches
        .into_iter()
        .max_by_key(|e| e.request_model.len())
        .unwrap()
};
```

- [ ] **Step B3: 运行 Rust 编译检查**

Run: `cd /home/spencer/workspace/oc-proxy/src-tauri && cargo check 2>&1 | head -50`
Expected: PASS，无编译错误

- [ ] **Step B4: 提交**

```bash
git add src-tauri/src/proxy/routing.rs
git commit -m "feat(backend): switch routing match to fuzzy contains + longest-match"
```

---

## Task 4: 全量验证

- [ ] **Step 1: 前端类型检查**

Run: `cd /home/spencer/workspace/oc-proxy && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: 后端 Rust 检查**

Run: `cd /home/spencer/workspace/oc-proxy/src-tauri && cargo check 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 3: 提交最终合并 commit**

```bash
git add -A
git commit -m "fix: routing table template models, input blur bug, and fuzzy matching"
```

---

## 自检清单

- [ ] Task 1: Claude 模板 `requestModel` 已改为 `claude-opus-4-6` / `claude-sonnet-4-6` / `claude-haiku-4-5-20251001`
- [ ] Task 2: 表格行 key 已改为 `route-row-${index}`，不再包含动态值
- [ ] Task 3A: `findRoute` 函数逻辑正确（contains + longest-match + default fallback）
- [ ] Task 3B: Rust `resolve_runtime_active_route` 逻辑与前端一致
- [ ] 全量验证通过
