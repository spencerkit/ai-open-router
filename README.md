# OA Proxy (Electron)

Desktop proxy service built with Electron for bidirectional protocol forwarding between OpenAI-compatible APIs and Anthropic APIs.

中文文档: [docs/zh/README.md](docs/zh/README.md)

## Overview

OA Proxy provides:
- Group-based routing (`/oc/:groupId/...`)
- Rule-based upstream selection (`activeRuleId`)
- Bidirectional protocol translation:
  - OpenAI-compatible -> Anthropic
  - Anthropic -> OpenAI-compatible
- Streaming bridge (SSE) and basic tool call mapping
- Local request chain logs with redaction support

## Use Cases

- Use OpenAI-compatible APIs from Claude-style clients:
  Configure a group's active rule with downstream protocol `openai`, then call `POST /oc/:groupId/messages` from Anthropic/Claude-style clients.
- Use Anthropic models from OpenAI-compatible clients:
  Configure downstream protocol `anthropic`, then call `POST /oc/:groupId/chat/completions` or `POST /oc/:groupId/responses`.
- Unify mixed client protocols behind one local endpoint:
  Route by group ID and keep each group's model/token/upstream config isolated.
- Local team/dev gateway:
  Keep upstream tokens in local config while exposing one stable local API surface to tools and scripts.

## Supported Entry Endpoints

The server listens on `0.0.0.0:8899` by default.

For each group:
- `POST /oc/:groupId/chat/completions`
- `POST /oc/:groupId/responses`
- `POST /oc/:groupId/messages`

If no suffix is provided, `/oc/:groupId` defaults to chat-completions behavior.

Example:
- `http://localhost:8899/oc/claude/chat/completions`
- `http://localhost:8899/oc/claude/responses`

## Rule Resolution

For each request:
1. Match `:groupId` from path
2. Load that group's `activeRuleId`
3. Use only the active rule for forwarding
4. Translate request/response based on entry protocol + downstream rule protocol

## Start

```bash
npm install
npm start
```

## Test

```bash
npm test
```

## Configuration

On first launch, config is created under Electron `userData/config.json`.

Core sections:
- `server`: host/port/auth
- `compat`: strict mode
- `ui`: theme/locale/startup behavior
- `logging`: body capture + redaction rules
- `groups[]`:
  - `id`, `name`, `models[]`
  - `rules[]` (`protocol`, `token`, `apiAddress`, `defaultModel`, `modelMappings`)
  - `activeRuleId`

Notes:
- No groups are created by default.
- Logs are kept in-memory with a default limit of 100 entries.

## Security Notes

- Upstream tokens are currently stored in local config (plain text).
- Use minimum-scope upstream credentials in production-like environments.
