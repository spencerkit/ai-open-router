# Routing Table Fixes Design

> Date: 2026-04-13
> Tasks: 3 個並行修復

---

## 概述

對現有 `RoutingTableEditor` 的三個獨立問題進行修復：
1. Claude 模板模型名稱不正確
2. 路由匹配規則改為 fuzzy（contains）匹配，並採用最長匹配優先
3. 修復 requestModel 輸入框每輸入一個字元就失焦的 bug

---

## 修復 1：Claude 模板模型名稱

### 現狀
`src/renderer/utils/routingTemplates.ts` 中的 Claude 模板使用了錯誤的模型名稱。

### 目標
將 Claude 相關模板的 `requestModel` 欄位更新為正確的模型 ID：

| 模型 | 正確 ID |
|------|---------|
| Opus | `claude-opus-4-6` |
| Sonnet | `claude-sonnet-4-6` |
| Haiku | `claude-haiku-4-5-20251001` |

### 實作
直接修改 `ROUTING_TEMPLATES` 中三個 Claude 模板條目的 `requestModel` 值。

**檔案：** `src/renderer/utils/routingTemplates.ts`

---

## 修復 2：路由匹配改為 Fuzzy（Contains）+ 最長匹配優先

### 現狀
當前代理層路由匹配邏輯使用精確（exact）匹配。

### 目標
- 匹配規則：使用 `requestModel.includes(incomingModel)` 判斷是否匹配（contains）
- 衝突解決：多條路由同時匹配時，選擇 `requestModel` 字串長度最長的那條（即最精確匹配）

### 匹配演算法

```typescript
function findRoute(routes: RouteEntry[], incomingModel: string): RouteEntry | null {
  const matches = routes
    .filter(route => incomingModel.includes(route.requestModel))
    .map(route => ({ route, length: route.requestModel.length }))

  if (matches.length === 0) return null

  return matches.reduce((best, current) =>
    current.length > best.length ? current : best
  ).route
}
```

### 實作位置
- 前端路由查詢展示：`src/renderer/utils/routingTemplates.ts`（新增 `findRoute` 工具函數）
- 後端路由匹配：`src-tauri/src/routing.rs`（修改匹配邏輯）

**涉及檔案：**
- `src/renderer/utils/routingTemplates.ts` — 新增 `findRoute` 工具，更新測試
- `src-tauri/src/routing.rs` — 修改 `find_route` 邏輯為 contains + longest-match

---

## 修復 3：requestModel 輸入框失焦 Bug

### 根因
`RoutingTableEditor` 表格行 `<tr>` 的 `key` 使用了可編輯值拼接：

```tsx
// 錯誤：key 會隨著用戶輸入改變
key={`${route.requestModel || "route"}-${route.providerId || "provider"}-${route.targetModel || "target"}`}
```

每次輸入一個字元 → `requestModel` 改變 → key 改變 → React 認為是不同行 → 銷毀舊 DOM 並重新創建 → 輸入框失焦。

### 實作
將 `key` 改為行 index（stable），並在行內用 `data-route-index` 屬性標識：

```tsx
// 正確：key = index（stable，不隨編輯而變）
key={`route-row-${index}`}
```

**檔案：** `src/renderer/pages/ServicePage/RoutingTableEditor.tsx:174`

---

## 實作順序

三個修復相互獨立，可並行實作：

1. ✅ 直接修改模板檔案（風險極低）
2. ✅ 修改 key 修復 bug（風險極低）
3. 🔧 修改匹配邏輯（需同步前後端）
