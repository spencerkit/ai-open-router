# OA Proxy (Electron)

基于 Electron 的桌面代理服务，用于在 OpenAI 兼容协议与 Anthropic 协议之间做双向转发。

English documentation: [../../README.md](../../README.md)

## 概览

OA Proxy 提供：
- 按分组路径路由（`/oc/:groupId/...`）
- 按生效规则转发（`activeRuleId`）
- 双向协议转换：
  - OpenAI 兼容 -> Anthropic
  - Anthropic -> OpenAI 兼容
- 流式桥接（SSE）与基础工具调用映射
- 本地请求链路日志与脱敏能力

## 使用场景

- 在 Claude 协议客户端中使用 OpenAI 兼容 API：
  将分组生效规则的下游协议设为 `openai`，客户端通过 `POST /oc/:groupId/messages` 接入即可。
- 在 OpenAI 兼容客户端中使用 Anthropic 模型：
  将下游协议设为 `anthropic`，客户端通过 `POST /oc/:groupId/chat/completions` 或 `POST /oc/:groupId/responses` 调用。
- 为多种客户端协议提供统一本地入口：
  通过分组 ID 路由，并按分组隔离模型、Token 与上游地址配置。
- 本地开发/团队网关：
  上游凭证保存在本地配置中，对外只暴露统一且稳定的本地 API 入口。

## 支持的入口路径

服务默认监听 `0.0.0.0:8899`。

每个分组可使用：
- `POST /oc/:groupId/chat/completions`
- `POST /oc/:groupId/responses`
- `POST /oc/:groupId/messages`

若不带后缀，`/oc/:groupId` 默认按 chat-completions 处理。

示例：
- `http://localhost:8899/oc/claude/chat/completions`
- `http://localhost:8899/oc/claude/responses`

## 规则生效逻辑

每个请求会按以下顺序处理：
1. 从路径匹配 `:groupId`
2. 读取该分组的 `activeRuleId`
3. 仅使用这一条生效规则进行转发
4. 根据入口协议与规则下游协议做请求/响应转换

## 启动

```bash
npm install
npm start
```

## 测试

```bash
npm test
```

## 配置说明

首次启动会在 Electron 的 `userData/config.json` 生成配置文件。

核心配置结构：
- `server`: host/port/auth
- `compat`: 严格模式
- `ui`: 主题/语言/开机启动
- `logging`: 请求体记录与脱敏规则
- `groups[]`:
  - `id`, `name`, `models[]`
  - `rules[]`（`protocol`, `token`, `apiAddress`, `defaultModel`, `modelMappings`）
  - `activeRuleId`

补充说明：
- 默认不会自动创建分组。
- 日志在内存中保留，默认上限为 100 条。

## 安全说明

- 上游 Token 当前以明文保存在本地配置中。
- 在生产或准生产环境中请使用最小权限凭证。
