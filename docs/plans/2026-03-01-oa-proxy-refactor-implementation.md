# OA Proxy 重构实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 OA Proxy 从 Vanilla JS + 直接 DOM 操作重构为 Electron + Vite + React + TypeScript 架构，优化 UI/UX，添加国际化、主题切换和开机启动功能。

**Architecture:** 使用 Vite 作为构建工具，React + TypeScript 作为前端框架，React Router 管理路由，Zustand 管理状态，CSS Modules 处理样式。后端保持现有逻辑，主进程转换为 TypeScript。

**Tech Stack:** Electron, Vite, React 18+, TypeScript, React Router v6, Zustand, i18next, Lucide React, CSS Modules

---

## Phase 1: 项目基础设施

### Task 1: 安装开发依赖

**Files:**
- Modify: `package.json`

**Step 1: 更新 package.json 安装新依赖**

```json
{
  "name": "oa-proxy-electron",
  "version": "0.2.0",
  "description": "Electron-based OpenAI <-> Claude protocol proxy",
  "main": "out/main/index.js",
  "type": "commonjs",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "start": "electron .",
    "electron:dev": "concurrently \"vite\" \"wait electron .\"",
    "electron:build": "electron-builder"
  },
  "dependencies": {
    "electron": "^31.7.7",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "zustand": "^4.5.0",
    "i18next": "^23.7.0",
    "react-i18next": "^14.0.0",
    "lucide-react": "^0.344.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@types/node": "^20.11.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "vite-plugin-electron": "^0.28.0",
    "electron-builder": "^24.13.3",
    "concurrently": "^8.2.0",
    "wait-on": "^7.2.0"
  }
}
```

**Step 2: 安装依赖**

Run: `npm install`
Expected: 成功安装所有依赖

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: install React, Vite, TypeScript and related dependencies"
```

### Task 2: 创建 TypeScript 配置

**Files:**
- Create: `tsconfig.json`
- Create: `src/renderer/vite-env.d.ts`

**Step 1: 创建根目录 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/renderer/*"]
    }
  },
  "include": ["src", "electron.vite.config.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 2: 创建 tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 3: 创建 vite-env.d.ts**

```typescript
/// <reference types="vite/client" />

interface Window {
  proxyApp: {
    getStatus: () => Promise<ProxyStatus>;
    startServer: () => Promise<void>;
    stopServer: () => Promise<void>;
    getConfig: () => Promise<ProxyConfig>;
    saveConfig: (config: ProxyConfig) => Promise<SaveConfigResult>;
    listLogs: (max?: number) => Promise<LogEntry[]>;
    clearLogs: () => Promise<{ ok: boolean }>;
  };
}

interface ProxyStatus {
  running: boolean;
  metrics?: {
    requests: number;
    errors: number;
    avgLatencyMs: number;
  };
}

interface ProxyConfig {
  server: {
    host: string;
    port: number;
    authEnabled: boolean;
    localBearerToken?: string;
  };
  compat: {
    strictMode: boolean;
  };
  ui: {
    language: 'zh-CN' | 'en-US';
    theme: 'light' | 'dark' | 'system';
    autoStart: boolean;
  };
  groups: Group[];
}

interface Group {
  id: string;
  name: string;
  path: string;
  activeRuleId: string | null;
  rules: Rule[];
}

interface Rule {
  id: string;
  model: string;
  token: string;
  apiAddress: string;
  direction: 'oc' | 'co';
}

interface SaveConfigResult {
  ok: boolean;
  config: ProxyConfig;
  restarted: boolean;
  status?: ProxyStatus;
}

interface LogEntry {
  timestamp: number;
  requestAddress?: string;
  httpStatus?: number;
  status?: string;
  requestBody?: any;
  forwardingAddress?: string;
  error?: { message: string };
}
```

**Step 4: Commit**

```bash
git add tsconfig.json tsconfig.node.json src/renderer/vite-env.d.ts
git commit -m "config: add TypeScript configuration and type definitions"
```

### Task 3: 创建 Vite 配置

**Files:**
- Create: `vite.config.ts`

**Step 1: 创建 vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: './',
  root: 'src/renderer',
  build: {
    outDir: '../../out/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
    },
  },
  plugins: [react()],
});
```

**Step 2: Commit**

```bash
git add vite.config.ts
git commit -m "config: add Vite configuration"
```

---

## Phase 2: 类型定义

### Task 4: 创建类型定义文件

**Files:**
- Create: `src/renderer/types/config.ts`
- Create: `src/renderer/types/proxy.ts`
- Create: `src/renderer/types/index.ts`

**Step 1: 创建 config.ts**

```typescript
export interface ServerConfig {
  host: string;
  port: number;
  authEnabled: boolean;
  localBearerToken?: string;
}

export interface CompatConfig {
  strictMode: boolean;
}

export interface UIConfig {
  language: 'zh-CN' | 'en-US';
  theme: 'light' | 'dark' | 'system';
  autoStart: boolean;
}
```

**Step 2: 创建 proxy.ts**

```typescript
export interface Rule {
  id: string;
  model: string;
  token: string;
  apiAddress: string;
  direction: 'oc' | 'co';
}

export interface Group {
  id: string;
  name: string;
  path: string;
  activeRuleId: string | null;
  rules: Rule[];
}

export interface ProxyStatus {
  running: boolean;
  metrics?: ProxyMetrics;
}

export interface ProxyMetrics {
  requests: number;
  errors: number;
  avgLatencyMs: number;
}

export interface LogEntry {
  timestamp: number;
  requestAddress?: string;
  httpStatus?: number;
  status?: string;
  requestBody?: any;
  forwardingAddress?: string;
  error?: { message: string };
}
```

**Step 3: 创建 index.ts**

```typescript
export * from './config';
export * from './proxy';

export interface ProxyConfig {
  server: ServerConfig;
  compat: CompatConfig;
  ui: UIConfig;
  groups: Group[];
}

export interface SaveConfigResult {
  ok: boolean;
  config: ProxyConfig;
  restarted: boolean;
  status?: ProxyStatus;
}
```

**Step 4: Commit**

```bash
"git add src/renderer/types/
git commit -m "types: add TypeScript type definitions for config and proxy"
```

---

## Phase 3: IPC 通信层

### Task 5: 创建 IPC 工具

**Files:**
- Create: `src/renderer/utils/ipc.ts`

**Step 1: 创建 IPC 工具模块**

```typescript
import type {
  ProxyConfig,
  ProxyStatus,
  SaveConfigResult,
  LogEntry
} from '@/types';

export const ipc = {
  getStatus: (): Promise<ProxyStatus> => {
    return window.proxyApp.getStatus();
  },

  startServer: (): Promise<void> => {
    return window.proxyApp.startServer();
  },

  stopServer: (): Promise<void> => {
    return window.proxyApp.stopServer();
  },

  getConfig: (): Promise<ProxyConfig> => {
    return window.proxyApp.getConfig();
  },

  saveConfig: (config: ProxyConfig): Promise<SaveConfigResult> => {
    return window.proxyApp.saveConfig(config);
  },

  listLogs: (max?: number): Promise<LogEntry[]> => {
    return window.proxyApp.listLogs(max);
  },

  clearLogs: (): Promise<{ ok: boolean }> => {
    return window.proxyApp.clearLogs();
  }
};
```

**Step 2: Commit**

```bash
git add src/renderer/utils/ipc.ts
git commit -m "utils: add IPC utility module for main process communication"
```

---

## Phase 4: 状态管理（Zustand）

### Task 6: 创建 Zustand Store

**Files:**
- Create: `src/renderer/store/proxyStore.ts`

**Step 1: 创建 proxyStore.ts**

```typescript
import { create } from 'zustand';
import type { ProxyConfig, ProxyStatus, Group, LogEntry } from '@/types';
import { ipc } from '@/utils/ipc';

interface ProxyState {
  config: ProxyConfig | null;
  status: ProxyStatus | null;
  logs: LogEntry[];
  activeGroupId: string | null;

  // Actions
  init: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshLogs: () => Promise<void>;
  saveConfig: (config: ProxyConfig) => Promise<void>;
  setActiveGroupId: (id: string | null) => void;
  clearLogs: () => Promise<void>;
}

export const useProxyStore = create<ProxyState>((set, get) => ({
  config: null,
  status: null,
  logs: [],
  activeGroupId: null,

  init: async () => {
    const config = await ipc.getConfig();
    const status = await ipc.getStatus();
    const logs = await ipc.listLogs(100);

    set({
      config,
      status,
      logs,
      activeGroupId: config.groups[0]?.id || null
    });
  },

  refreshStatus: async () => {
    const status = await ipc.getStatus();
    set({ status });
  },

  refreshLogs: async () => {
    const logs = await ipc.listLogs(100);
    set({ logs });
  },

  saveConfig: async (config) => {
    const result = await ipc.saveConfig(config);
    set({
      config: result.config,
      status: result.status || get().status
    });
  },

  setActiveGroupId: (id) => {
    set({ activeGroupId: id });
  },

  clearLogs: async () => {
    await ipc.clearLogs();
    set({ logs: [] });
  }
}));
```

**Step 2: Commit**

```bash
git add src/renderer/store/proxyStore.ts
git commit -m "store: add Zustand store for proxy state management"
```

---

## Phase 5: Hooks

### Task 7: 创建自定义 Hooks

**Files:**
- Create: `src/renderer/hooks/useProxyConfig.ts`
- Create: `src/renderer/hooks/useProxyStatus.ts`
- Create: `src/renderer/hooks/useLogs.ts`
- Create: `src/renderer/hooks/useTranslation.ts`
- Create: `src/renderer/hooks/useTheme.ts`

**Step 1: 创建 useProxyConfig.ts**

```typescript
import { useEffect } from 'react';
import { useProxyStore } from '@/store/proxyStore';

export const useProxyConfig = () => {
  const config = useProxyStore((state) => state.config);
  const saveConfig = useProxyStore((state) => state.saveConfig);

  return { config, saveConfig };
};
```

**Step 2: 创建 useProxyStatus.ts**

```typescript
import { useEffect } from 'react';
import { useProxyStore } from '@/store/proxyStore';

export const useProxyStatus = () => {
  const status = useProxyStore((state) => state.status);
  const refreshStatus = useProxyStore((state) => state.refreshStatus);
  const running = status?.running ?? false;

  useEffect(() => {
    const interval = setInterval(() => {
      refreshStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [refreshStatus]);

  return { status, running, refreshStatus };
};
```

**Step 3: 创建 useLogsTranslation.ts**

```typescript
import { useEffect, useState } from 'react';
import { useProxyStore } from '@/store/proxyStore';
import { ipc } from '@/utils/ipc';

export const useLogs = (max = 100) => {
  const logs = useProxyStore((state) => state.logs);
  const refreshLogs = useProxyStore((state) => state.refreshLogs);
  const clearLogs = useProxyStore((state) => state.clearLogs);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshLogs();
    }, 3000);

    return () => clearInterval(interval);
  }, [refreshLogs]);

  return { logs, refreshLogs, clearLogs };
};
```

**Step 4: 创建 useTranslation.ts**

```typescript
import i18n from '@/i18n';

export const useTranslation = () => {
  return {
    t: (key: string) => i18n.t(key)
  };
};
```

**Step 5: 创建 useTheme.ts**

```typescript
import { useEffect } from 'react';
import { useProxyStore } from '@/store/proxyStore';
import { ipc } from '@/utils/ipc';

export const useTheme = () => {
  const config = useProxyStore((state) => state.config);
  const saveConfig = useProxyStore((state) => state.saveConfig);
  const theme = config?.ui.theme || 'light';

  const setTheme = async (newTheme: 'light' | 'dark' | 'system') => {
    if (!config) return;

    const newConfig = {
      ...config,
      ui: {
        ...config.ui,
        theme: newTheme
      }
    };

    await saveConfig(newConfig);
  };

  useEffect(() => {
    let actualTheme = theme;

    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      actualTheme = prefersDark ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-theme', actualTheme);
  }, [theme]);

  return { theme, setTheme };
};
```

**Step 6: Commit**

```bash
git add src/renderer/hooks/
git commit -m "hooks: add custom hooks for config, status, logs, translation and theme"
```

---

## Phase 6: 国际化

### Task 8: 配置 i18next

**Files:**
- Create: `src/renderer/i18n/zh-CN.ts`
- Create: `src/renderer/i18n/en-US.ts`
- Create: `src/renderer/i18n/index.ts`

**Step 1: 创建 zh-CN.ts（中文翻译）**

```typescript
export const zhCN = {
  app: {
    title: '协议中转服务',
    status: {
      loading: '状态加载中...',
      running: '运行中',
      stopped: '已停止'
    }
  },
  header: {
    serviceToggle: '服务开关',
    addGroup: '添加分组',
    settings: '设置',
    logs: '日志'
  },
  service: {
    noGroups: '暂无分组，请先点击"添加分组"。',
    selectGroup: '请选择一个分组。',
    entryUrl: '入口 URL',
    copyEntry: '复制入口 URL',
    addRule: '添加规则',
    deleteGroup: '删除分组',
    noRules: '该分组暂无规则，请点击"添加规则"。',
    model: '模型名称',
    direction: {
      oc: 'OpenAI → Anthropic',
      co: 'Anthropic → OpenAI'
    },
    active: '当前生效',
    saveRule: '保存规则',
    deleteRule: '删除'
  },
  settings: {
    title: '服务设置',
    host: {
      label: '监听 Host',
      tip: '服务监听的地址，0.0.0.0 表示监听所有网卡'
    },
    port: {
      label: '服务端口',
      tip: 'HTTP 服务监听端口，请确保端口未被占用'
    },
    strictMode: {
      label: '严格模式',
      tip: '启用后，不兼容的字段会直接报错而非忽略'
    },
    language: {
      label: '语言',
'      tip: '切换界面显示语言'
    },
    theme: {
      label: '主题',
      tip: '选择界面主题颜色风格',
      light: '浅色',
      dark: '深色',
      system: '跟随系统'
    },
    autoStart: {
      label: '开机启动',
      tip: '系统启动时自动运行代理服务'
    },
    save: '保存',
    cancel: '取消'
  },
  logs: {
    title: '请求链路日志',
    subtitle: '最近 100 条',
    refresh: '刷新',
    clear: '清空',
    empty: '暂无日志',
    back: '返回服务'
  },
  modal: {
    addGroup: {
      title: '添加分组',
      name: '分组名称',
      path: '转发 Path',
      pathHint: '请求路径示例：`/oc/claude`（具体转发方向由生效规则决定）',
      create: '创建'
    },
    deleteGroup: {
      title: '删除分组确认',
      confirm: '确认删除'
    },
    common: {
      cancel: '取消',
      confirm: '确认'
    }
  },
  toast: {
    entryCopied: '入口 URL 已复制',
    ruleCreated: '规则已创建',
    ruleSaved: '规则已保存',
    ruleDeleted: '规则已删除',
    groupCreated: '分组已创建',
    groupDeleted: '分组已删除',
    settingsSaved: '设置已保存',
    logsCleared: '日志已清空',
    serverStarted: '服务已启动',
    serverStopped: '服务已停止',
    restartComplete: '重启完成'
  },
  errors: {
    fillRequired: '请填写必填字段',
    pathExists: '该 path 已存在',
    invalidPort: '端口必须是 1-65535 的整数',
    operationFailed: '操作失败'
  }
};
```

**Step 2: 创建 en-US.ts（英文翻译）**

```typescript
export const enUS = {
  app: {
    title: 'Protocol Proxy Service',
    status: {
      loading: 'Loading status...',
      running: 'Running',
      stopped: 'Stopped'
    }
  },
  header: {
    serviceToggle: 'Service Toggle',
    addGroup: 'Add Group',
    settings: 'Settings',
    logs: 'Logs'
  },
  service: {
    noGroups: 'No groups yet. Click "Add Group" to create one.',
    selectGroup: 'Please select a group.',
    entryUrl: 'Entry URL',
    copyEntry: 'Copy Entry URL',
    addRule: 'Add Rule',
    deleteGroup: 'Delete Group',
    noRules: 'No rules yet. Click "Add Rule" to create one.',
    model: 'Model Name',
    direction: {
      oc: 'OpenAI → Anthropic',
      co: 'Anthropic → OpenAI'
    },
    active: 'Active',
    saveRule: 'Save Rule',
    deleteRule: 'Delete'
  },
  settings: {
    title: 'Service Settings',
    host: {
      label: 'Listen Host',
      tip: 'Address to listen on. 0.0.0.0 means listen on all interfaces'
    },
    port: {
      label: 'Service Port',
      tip: 'HTTP service port. Make sure the port is not in use'
    },
    strictMode: {
      label: 'Strict Mode',
      tip: 'When enabled, incompatible fields will cause errors instead of being ignored'
    },
    language: {
      label: 'Language',
      tip: 'Switch interface language'
    },
    theme: {
      label: 'Theme',
      tip: 'Choose interface theme',
      light: 'Light',
      dark: 'Dark',
      system: 'System'
    },
    autoStart: {
      label: 'Auto Start',
      tip: 'Automatically start proxy service on system startup'
    },
    save: 'Save',
    cancel: 'Cancel'
  },
  logs: {
    title: 'Request Chain Logs',
    subtitle: 'Recent 100 entries',
    refresh: 'Refresh',
    clear: 'Clear',
    empty: 'No logs yet',
    back: 'Back to Service'
  },
  modal: {
    addGroup: {
      title: 'Add Group',
      name: 'Group Name',
      path: 'Forward Path',
      pathHint: 'Example path: `/oc/claude` (forwarding direction depends on active rule)',
      create: 'Create'
    },
    deleteGroup: {
      title: 'Delete Group Confirmation',
      confirm: 'Confirm Delete'
    },
    common: {
      cancel: 'Cancel',
      confirm: 'Confirm'
    }
    },
  toast: {
    entryCopied: 'Entry URL copied',
    ruleCreated: 'Rule created',
    ruleSaved: 'Rule saved',
    ruleDeleted: 'Rule deleted',
    groupCreated: 'Group created',
    groupDeleted: 'Group deleted',
    settingsSaved: 'Settings saved',
    logsCleared: 'Logs cleared',
    serverStarted: 'Server started',
    serverStopped: 'Server stopped',
    restartComplete: 'Restart complete'
  },
  errors: {
    fillRequired: 'Please fill in required fields',
    pathExists: 'This path already exists',
    invalidPort: 'Port must be an integer between 1 and 65535',
    operationFailed: 'Operation failed'
  }
};
```

**Step 3: 创建 i18n/index.ts**

```typescript
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { zhCN } from './zh-CN';
import { enUS } from './en-US';

const resources = {
  'zh-CN': { translation: zhCN },
  'en-US': { translation: enUS }
};

i18next
  .use(initReactI18next)
  .init({
    resources,
    lng: 'zh-CN',
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false
    }
  });

export default i18next;
```

**Step 4: Commit**

```bash
git add src/renderer/i18n/
git commit -m "i18n: add internationalization support for Chinese and English"
```

---

## Phase 7: 主题样式

### Task 9: 创建主题样式文件

**Files:**
- Create: `src/renderer/styles/variables.css`
- Create: `src/renderer/styles/reset.css`
- Create: `src/renderer/styles/global.css`

**Step 1: 创建 variables.css（颜色和字体变量）**

```css
:root {
  /* Colors */
  --bg-a: #f4f9ff;
  --bg-b: #fff7ee;
  --bg-c: #f8fffa;
  --text: #142033;
  --text-secondary: #32435e;
  --muted: #5f6f8a;
  --panel: rgba(255, 255, 255, 0.86);
  --panel-strong: #ffffff;
  --line: #d9e5f4;
  --line-strong: #b8cce4;
  --accent: #0c8b73;
  --accent-ink: #0b6c59;
  --accent-hover: #10a287;
  --danger: #c14a4a;
  --danger-bg: #fff8f8;
  --danger-border: #f0c4c4;
  --shadow: 0 14px 44px rgba(30, 52, 84, 0.12);

  /* Font weights */
  --font-light: 300;
  --font-normal: 400;
  --font-medium: 500;

  /* Font sizes */
  --font-xs: 11px;
  --font-sm: 12px;
  --font-base: 13px;
  --font-md: 14px;
  --font-lg: 16px;
  --font-xl: 18px;
  --font-2xl: 24px;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;

  /* Border radius */
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-lg: 12px;
  --radius-xl: 14px;
  --radius-2xl: 16px;
  --radius-full: 999px;
}

/* Dark theme */
[data-theme='dark'] {
  --bg-a: #1a2332;
  --bg-b: #1f2937;
  --bg-c: #1e2a38;
  --text: #e8f4f8;
  --text-secondary: #c5d5e0;
  --muted: #8b9bb4;
  --panel: rgba(30, 41, 59, 0.9);
  --panel-strong: #1f2937;
  --line: #374151;
  --line-strong: #4b5563;
  --accent: #3dd5a3;
  --accent-ink: #2eb38a;
  --accent-hover: #34d399;
  --danger: #f87171;
  --danger-bg: #3d1515;
  --danger-border: #7c2d2d;
  --shadow: 0 14px 44px rgba(0, 0, 0, 0.4);
}
```

**Step 2: 创建 reset.css（样式重置）**

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  color: var(--text);
  font-family: 'Avenir Next', 'SF Pro Display', 'Noto Sans SC', 'PingFang SC', 'Segoe UI', sans-serif;
  font-size: var(--font-base);
  font-weight: var(--font-light);
  line-height: 1.55;
  background:
    radial-gradient(1200px 500px at 0% 0%, rgba(118, 188, 255, 0.2), transparent 60%),
    radial-gradient(1000px 520px at 100% 0%, rgba(238, 201, 146, 0.2), transparent 58%),
    linear-gradient(160deg, var(--bg-a), var(--bg-b) 48%, var(--bg-c));
  min-height: 100vh;
}

input,
select,
button {
  font: inherit;
}

input,
select {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: #fff;
  padding: 9px 10px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

input:focus,
select:focus {
  outline: none;
  border-color: rgba(12, 139, 115, 0.55);
  box-shadow: 0 0 0 3px rgba(12, 139, 115, 0.12);
}

button {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: #fff;
  color: var(--text-secondary);
  padding: 8px 12px;
  font-weight: var(--font-normal);
  cursor: pointer;
  transition: all 0.18s ease;
}

button:hover {
  border-color: #99b0cd;
  transform: translateY(-1px);
}

a {
  color: var(--accent);
  text-decoration: none;
}

code {
  font-family: 'IBM Plex Mono', 'Consolas', monospace;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--line);
}
```

**Step 3: 创建 global.css（全局样式）**

```css
.app-shell {
  max-width: 1360px;
  margin: 22px auto;
  padding: 0 18px 30px;
  display: grid;
  gap: 16px;
}

.hidden {
  display: none;
}

.container {
  border-radius: var(--radius-2xl);
  border: 1px solid var(--line);
  background: var(--panel);
  backdrop-filter: blur(8px);
  box-shadow: var(--shadow);
}

.row {
  display: flex;
  gap: var(--space-2);
}

.row-center {
  align-items: center;
}

.row-between {
  justify-content: space-between;
}

.hint {
  font-size: var(--font-xs);
  color: var(--muted);
  line-height: 1.5;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.active {
  background: var(--accent);
}

.status-dot.inactive {
  background: var(--muted);
}
```

**Step 4: Commit**

```bash
git add src/renderer/styles/
git commit -m "styles: add theme variables, reset and global styles"
```

---

## Phase 8: 基础组件

### Task 10: 创建 Button 组件

**Files:**
- Create: `src/renderer/components/common/Button.tsx`
- Create: `src/renderer/components/common/Button.module.css`

**Step 1: 创建 Button.tsx**

```typescript
import styles from './Button.module.css';

interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'danger' | 'ghost';
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}

export const Button = ({
  children,
  variant = 'default',
  onClick,
  type = 'button',
  disabled = false
}: ButtonProps) => {
  return (
    <button
      type={type}
      className={`${styles.button} ${styles[variant]}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};
```

**Step 2: 创建 Button.module.css**

```css
.button {
  padding: 8px 14px;
  font-weight: var(--font-normal);
  font-size: var(--font-sm);
  letter-spacing: 0.01em;
}

.primary {
  background: linear-gradient(135deg, #10a287, #0c8b73);
  color: #fff;
  border-color: rgba(12, 139, 115, 0.65);
}

.primary:hover {
  border-color: rgba(12, 139, 115, 0.9);
}

.danger {
  color: var(--danger);
  border-color: var(--danger-border);
  background: var(--danger-bg);
}

.ghost {
  background: transparent;
  border-color: transparent;
}

.ghost:hover {
  border-color: var(--line);
}
```

**Step 3: Commit**

```bash
git add src/renderer/components/common/Button.tsx src/renderer/components/common/Button.module.css
git commit -m "component: add Button component with variants"
```

### Task 11: 创建 Input 组件

**Files:**
- Create: `src/renderer/components/common/Input.tsx`
- Create: `src/renderer/components/common/Input.module.css`

**Step 1: 创建 Input.tsx**

```typescript
import styles from { './Input.module.css';

interface InputProps {
  type?: 'text' | 'password' | 'number';
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
}

export const Input = ({
  type = 'text',
  placeholder,
  value,
  onChange,
  label,
  hint,
  disabled = false
}: InputProps) => {
  return (
    <div className={styles.wrapper}>
      {label && <label className={styles.label}>{label}</label>}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        className={styles.input}
      />
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
};
```

**Step 2: 创建 Input.module.css**

```css
.wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: var(--font-xs);
  color: var(--muted);
}

.input {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: #fff;
  padding: 9px 10px;
  font-size: var(--font-base);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.input:focus {
  outline: none;
  border-color: rgba(12, 139, 115, 0.55);
  box-shadow: 0 0 0 3px rgba(12, 139, 115, 0.12);
}

.hint {
  font-size: var(--font-xs);
  color: var(--muted);
  line-height: 1.5;
  margin: 0;
}
```

**Step 3: Commit**

```bash
git add src/renderer/components/common/Input.tsx src/renderer/components/common/Input.module.css
git commit -m "component: add Input component with label and hint support"
```

### Task 12: 创建 Switch 组件

**Files:**
- Create: `src/renderer/components/common/Switch.tsx`
- Create: `src/renderer/components/common/Switch.module.css`

**Step 1: 创建 Switch.tsx**

```typescript
import styles from './Switch.module.css';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export const Switch = ({ checked, onChange, label }: SwitchProps) => {
  return (
    <label className={styles.wrapper}>
      {label && <span className={styles.label}>{label}</span>}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={styles.switch}
      />
    </label>
  );
};
```

**Step 2: 创建 Switch.module.css**

```css
.wrapper {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: var(--font-sm);
  border: 1px solid var(--line);
  border-radius: var(--radius-full);
);
  background: rgba(255, 255, 255, 0.88);
  padding: 6px 10px;
  cursor: pointer;
}

.switch {
  appearance: none;
  width: 42px;
  height: 24px;
  border-radius: var(--radius-full);
  border: 1px solid var(--line-strong);
  background: #d3dce9;
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
}

.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}

.switch:checked {
  background: rgba(12, 139, 115, 0.48);
  border-color: rgba(12, 139, 115, 0.7);
}

.switch:checked::after {
  transform: translateX(18px);
}
```

**Step 3: Commit**

```bash
git add src/renderer/components/common/Switch.tsx src/renderer/components/common/Switch.module.css
git commit -m "component: add Switch component for toggle controls"
```

### Task 13: 创建 Modal 组件

**Files:**
- Create: `src/renderer/components/common/Modal.tsx`
- Create: `src/renderer/components/common/Modal.module.css`

**Step 1: 创建 Modal.tsx**

```typescript
import styles from './Modal.module.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export const Modal = ({ isOpen, onClose, title, children, actions }: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>{title}</h3>
        <div className={styles.content}>
          {children}
        </div>
        {actions && (
          <div className={styles.actions}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
```

**Step 2: 创建 Modal.module.css**

```css
.overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(19, 31, 52, 0.46);
}

.card {
  width: min(540px, 92vw);
  border-radius: var(--radius-2xl);
  border: 1px solid var(--line);
  background: #fff;
  padding: 14px;
  display: grid;
  gap: 8px;
  box-shadow: var(--shadow);
}

.title {
  margin: 0 0 4px;
  font-size: var(--font-lg);
  font-weight: var(--font-medium);
}

.content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}
```

**Step 3: Commit**

```bash
git add src/renderer/components/common/Modal.tsx src/renderer/components/common/Modal.module.css
git commit -m "component: add Modal component for dialogs"
```

### Task 14: 创建 Toast 组件

**Files:**
- Create: `src/renderer/components/common/Toast.tsx`
- Create: `src/renderer/components/common/Toast.module.css`

**Step 1: 创建 Toast Context 和组件**

```typescript
import React, { createContext, useContext, useState, useCallback } from 'react';
import styles from './Toast.module.css';

interface ToastContextValue {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [message, setMessage] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const showToast = useCallback((msg: string) => {
    setMessage(msg);
    setIsVisible(true);

    setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => setMessage(null), 220);
    }, 2200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message && (
        <div className={`${styles.toast} ${isVisible ? styles.visible : ''}`}>
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
};
```

**Step 2: 创建 Toast.module.css**

```css
.toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 50;
  border-radius: var(--radius-md);
  border: 1px solid rgba(12, 139, 115, 0.25);
  background: #17334d;
  color: #fff;
  padding: 10px 14px;
  font-size: var(--font-sm);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.visible {
  opacity: 1;
  transform: translateY(0);
}
```

**Step 3: Commit**

```bash
git add src/renderer/components/common/Toast.tsx src/renderer/components/common/Toast.module.css
git commit -m "component: add Toast component with context provider"
```

---

## Phase 9: Layout 组件

### Task 15: 创建 Header 组件

**Files:**
- Create: `src/renderer/components/Layout/Header.tsx`
- Create: `src/renderer/components/Layout/Header.module.css`

**Step 1: 创建 Header.tsx**

```typescript
import { useNavigate } from 'react-router-dom';
import { Settings, FileText } from 'lucide-react';
import { Switch, Button } from '@/components/common';
import { useProxyConfig, useProxyStatus, useTranslation } from '@/hooks';
import styles from './Header.module.css';

export const Header = () => {
  const navigate = useNavigate();
  const { config, saveConfig } = useProxyConfig();
  const { running, refreshStatus } = useProxyStatus();
  const { t } = useTranslation();

  const handleToggleService = async () => {
    if (running) {
      await window.proxyApp.stopServer();
    } else {
      await window.proxyApp.startServer();
    }
    await refreshStatus();
  };

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <h1 className={styles.title}>{t('app.title')}</h1>
        <div className={styles.status}>
          {config && (
            <span className={styles.statusText}>
              {running ? t('app.status.running') : t('app.status.stopped')} |
              {config.server.host}:{config.server.port}
              {running && config.status?.metrics && (
                <>
                  | {t('service.requests')}: {config.status.metrics.requests}
                  | {t('service.errors')}: {config.status.metrics.errors}
                  | {t('service.avgLatency')}: {config.status.metrics.avgLatencyMs}ms
                </>
              )}
            </span>
          )}
        </div>
      </div>
      <div className={styles.actions}>
        <Switch
          checked={running}
          onChange={handleToggleService}
          label={t('header.serviceToggle')}
        />
        <Button onClick={() => navigate('/settings')}>
          <Settings size={16} />
          {t('header.settings')}
        </Button>
        <Button onClick={() => navigate('/logs')}>
          <FileText size={16} />
          {t('header.logs')}
        </Button>
      </div>
    </header>
  );
};
```

**Step 2: 创建 Header.module.css**

```css
.header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  padding: 18px 20px;
}

.left h1 {
  margin: 0;
  font-size: var(--font-2xl);
  font-weight: var(--font-medium);
  letter-spacing: 0.01em;
}

.status {
  margin-top: 8px;
  color: var(--muted);
  font-size: var(--font-sm);
  line-height: 1.5;
  padding: 6px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.76);
  width: fit-content;
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
```

**Step 3: Commit**

```bash
git add src/renderer/components/Layout/Header.tsx src/renderer/components/Layout/Header.module.css
git commit -m "component: add Header component with navigation"
```

---

## Phase 10: ServicePage 组件

### Task 16: 创建 GroupTabs 组件

**Files:**
- Create: `src/renderer/components/ServicePage/GroupTabs.tsx`
- Create: `src/renderer/components/ServicePage/GroupTabs.module.css`
- Create: `src/renderer/components/ServicePage/index.ts`

**Step 1: 创建 GroupTabs.tsx**

```typescript
import { useProxyStore } from '@/store/proxyStore';
import { useTranslation } from '@/hooks';
import styles from './GroupTabs.module.css';

export const GroupTabs = () => {
  const { config, activeGroupId, setActiveGroupId } = useProxyStore();
  const { t } = useTranslation();

  if (!config?.groups || config.groups.length === 0) {
    return (
      <div className={styles.empty}>
        {t('service.noGroups')}
      </div>
    );
  }

  return (
    <div className={styles.tabs}>
      {config.groups.map((group) => (
        <button
          key={group.id}
          className={`${styles.tab} ${group.id === activeGroupId ? styles.active : ''}`}
          onClick={() => setActiveGroupId(group.id)}
        >
          {group.name}
        </button>
      ))}
    </div>
  );
};
```

**Step 2: 创建 GroupTabs.module.css**

```css
.tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.tab {
  white-space: nowrap;
  border-radius: var(--radius-full);
  border: 1px solid var(--line);
  background: #fff;
  color: #3a4b66;
  padding: 8px 14px;
  font-weight: var(--font-normal);
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: all 0.18s ease;
}

.tab:hover {
  border-color: #99b0cd;
}

.active {
  background: linear-gradient(120deg, #dbf6f0, #effaf7);
  border-color: rgba(12, 139, 115, 0.45);
  color: var(--accent-ink);
}

.empty {
  color: var(--muted);
  font-size: var(--font-sm);
}
```

**Step 3: 创建 index.ts**

```typescript
export { GroupTabs } from './GroupTabs';
export { RuleCard } from './RuleCard';
export { RuleEdit } from './RuleEdit';
```

**Step 4: Commit**

```bash
git add src/renderer/components/ServicePage/
git commit -m "component: add GroupTabs component"
```

### Task 17: 创建 RuleCard 组件

**Files:**
- Create: `src/renderer/components/ServicePage/RuleCard.tsx`
- Create: `src/renderer/components/ServicePage/RuleCard.module.css`

**Step 1: 创建 RuleCard.tsx**

```typescript
import { navigate } from 'react-router-dom';
import { useProxyStore } from '@/store/proxyStore';
import { useTranslation } from '@/hooks';
import styles from './RuleCard.module.css';

interface RuleCardProps {
  groupId: string;
  rule: Rule;
}

export const RuleCard = ({ groupId, rule }: RuleCardProps) => {
  const { config } = useProxyStore();
  const { t } = useTranslation();

  const group = config?.groups.find((g) => g.id === groupId);
  const isActive = group?.activeRuleId === rule.id;

  const handleClick = () => {
    navigate(`/rule/${rule.id}?groupId=${groupId}`);
  };

  return (
    <div
      className={`${styles.card} ${isActive ? styles.active : ''}`}
      onClick={handleClick}
    >
      <div className={styles.header}>
        <span className={styles.model}>{rule.model || t('service.unnamed')}</span>
        <div className={styles.meta}>
          <span className={styles.direction}>
            {rule.direction === 'oc' ? t('service.direction.oc') : t('service.direction.co')}
          </span>
          <span className={`${styles.status} ${isActive ? styles.statusActive : ''}`}>
            {isActive ? t('service.active') : ''}
          </span>
        </div>
      </div>
    </div>
  );
};
```

**Step 2: 创建 RuleCard.module.css**

```css
.card {
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  padding: 12px;
  background: var(--panel-strong);
  cursor: pointer;
  transition: all 0.18s ease;
}

.card:hover {
  border-color: rgba(12, 139, 115, 0.3);
  transform: translateY(-2px);
}

.active {
  border-color: rgba(12, 139, 115, 0.5);
  background: linear-gradient(135deg, rgba(219, 246, 240, 0.3), rgba(239, 250, 247, 0.3));
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.model {
  font-size: var(--font-base);
  font-weight: var(--font-normal);
}

.meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.direction {
  font-size: var(--font-xs);
  color: var(--muted);
}

.status {
  font-size: var(--font-xs);
  color: var(--muted);
}

.statusActive {
  color: var(--accent-ink);
}
```

**Step 3: Commit**

```bash
git add src/renderer/components/ServicePage/RuleCard.tsx
git commit -m "component: add RuleCard component with basic info display"
```

### Task 18: 创建 ServicePage 主组件

**Files:**
- Create: `src/renderer/components/ServicePage/ServicePage.tsx`
- Create: `src/renderer/components/ServicePage/ServicePage.module.css`

**Step 1: 创建 ServicePage.tsx**

```typescript
import { GroupTabs, RuleCard } from './ServicePage';
import { Button } from '@/components/common';
import { useProxyStore } from '@/store/proxyStore';
import { useTranslation } from '@/hooks';
import styles from './ServicePage.module.css';

export const ServicePage = () => {
  const { config, activeGroupId } = useProxyStore();
  const { t } = useTranslation();

  const activeGroup = config?.groups.find((g) => g.id === activeGroupId);

  if (!activeGroup) {
    return (
      <div className={styles.container}>
        <GroupTabs />
      </div>
    );
  }

  const port = config?.server.port || 3000;
  const entryUrl = `http://localhost:${port}/oc/${activeGroup.path}`;

  return (
    <div className={styles.container}>
      <GroupTabs />

      <div className={styles.groupDetail}>
        <div className={styles.groupHeader}>
          <div className={styles.groupInfo}>
            <h2 className={styles.groupName}>{activeGroup.name}</h2>
            <p className={styles.groupMeta}>
              {t('service.groupPath')}: <code>{activeGroup.path}</code>
            </p>
            <div className={styles.entryLine}>
              <span>{t('service.entryUrl')}:</span>
              <code className={styles.entryUrl}>{entryUrl}</code>
              <Button variant="ghost" onClick={() => navigator.clipboard.writeText(entryUrl)}>
                {t('service.copyEntry')}
              </Button>
            </div>
          </div>
          <div className={styles.groupActions}>
            <Button variant="primary" onClick={() => {/* TODO: Add rule */}}>
              {t('service.addRule')}
            </Button>
          </div>
        </div>

        <div className={styles.rulesList}>
          {activeGroup.rules?.length === 0 ? (
            <p className={styles.empty}>{t('service.noRules')}</p>
          ) : (
            activeGroup.rules.map((rule) => (
              <RuleCard key={rule.id} groupId={activeGroup.id} rule={rule} />
            ))
          )}
        </div>
      </div>
    </div>
  );
};
```

**Step 2: 创建 ServicePage.module.css**

```css
.container {
  padding: 12px;
}

.groupDetail {
  margin-top: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.groupHeader {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  padding: 12px;
  background: var(--panel-strong);
  margin-bottom: 12px;
}

.groupName {
  margin: 0 0 8px;
  font-size: var(--font-xl);
  font-weight: var(--font-medium);
}

.groupMeta {
  color: var(--muted);
  font-size: var(--font-sm) !important;
  margin: 0;
  line-height: 1.55;
}

.entryLine {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.entryUrl {
  border: 1px solid #dce8f7;
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  background: #f8fcff;
  color: #314866;
  font-size: var(--font-xs) !important;
}

.groupActions {
  display: flex;
  gap: 8px;
}

.rulesList {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty {
  color: var(--muted);
  font-size: var(--font-sm);
}
```

**Step 3: Commit**

```bash
git add src/renderer/components/ServicePage/ServicePage.tsx
git commit -m "component: add ServicePage with group detail and rules list"
```

---

## Phase 11: SettingsPage 组件

### Task 19: 创建 SettingsPage 组件

**Files:**
- Create: `src/renderer/components/SettingsPage/SettingsPage.tsx`
- Create: `src/renderer/components/SettingsPage/SettingsPage.module.css`
- Create: `src/renderer/components/SettingsPage/index.ts`

**Step 1: 创建 SettingsPage.tsx**

```typescript
import { useState } from 'react';
import { Input, Switch, Button } from '@/components/common';
import { useProxyConfig, useTranslation, useTheme } from '@/hooks';
import styles from './SettingsPage.module.css';

export const SettingsPage = () => {
  const { config, saveConfig } = useProxyConfig();
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const [host, setHost] = useState(config?.server.host || '0.0.0.0');
  const [port, setPort] = useState(String(config?.server.port || 3000));
  const [strictMode, setStrictMode] = useState(config?.compat.strictMode || false);
  const [language, setLanguage] = useState(config?.ui.language || 'zh-CN');
  const [selectedTheme, setSelectedTheme] = useState(config?.ui.theme || 'light');
  const [autoStart, setAutoStart] = useState(config?.ui.autoStart || false);

  if (!config) return null;

  const handleSave = async () => {
    const portNum = Number(port);
    if (portNum < 1 || portNum > 65535) {
      alert(t('errors.invalidPort'));
      return;
    }

    const newConfig = {
      ...config,
      server: {
        ...config.server,
        host,
        port: portNum
      },
      compat: {
        ...config.compat,
        strictMode
      },
      ui: {
        ...config.ui,
        language,
        theme: selectedTheme,
        autoStart
      }
    };

    await saveConfig(newConfig);
    alert(t('toast.settingsSaved'));
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{t('settings.title')}</h2>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>服务设置</h3>

        <Input
          label={t('settings.host.label')}
          hint={t('settings.host.tip')}
          value={host}
          onChange={setHost}
        />

        <Input
          type="number"
          label={t('settings.port.label')}
          hint={t('settings.port.tip')}
          value={port}
          onChange={setPort}
        />

        <div className={styles.switchRow}>
          <Switch
            checked={strictMode}
            onChange={setStrictMode}
            label={t('settings.strictMode.label')}
          />
          <p className={styles.hint}>{t('settings.strictMode.tip')}</p>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>界面设置</h3>

        <div className={styles.selectRow}>
          <label>{t('settings.language.label')}</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as 'zh-CN' | 'en-US')}
          >
            <option value="zh-CN">中文</option>
            <option value="en-US">English</option>
          </select>
          <p className={styles.hint}>{t('settings.language.tip')}</p>
        </div>

        <div className={styles.selectRow}>
          <label>{t('settings.theme.label')}</label>
          <select
            value={selectedTheme}
            onChange={(e) => setSelectedTheme(e.target.value as 'light' | 'dark' | 'system')}
          >
            <option value="light">{t('settings.theme.light')}</option>
            <option value="dark">{t('settings.theme.dark')}</option>
            <option value="system">{t('settings.theme.system')}</option>
          </select>
          <p className={styles.hint}>{t('settings.theme.tip')}</p>
        </div>

        <div className={styles.switchRow}>
          <Switch
            checked={autoStart}
            onChange={setAutoStart}
            label={t('settings.autoStart.label')}
          />
          <p className={styles.hint}>{t('settings.autoStart.tip')}</p>
        </div>
      </section>

      <div className={styles.actions}>
        <Button onClick={() => window.history.back()}>
          {t('settings.cancel')}
        </Button>
        <Button variant="primary" onClick={handleSave}>
          {t('settings.save')}
        </Button>
      </div>
    </div>
  );
};
```

**Step 2: 创建 SettingsPage.module.css**

```css
.container {
  padding: 24px;
}

.title {
  margin: 0 0 24px;
  font-size: var(--font-2xl);
  font-weight: var(--font-medium);
}

.section {
  margin-bottom: 24px;
}

.sectionTitle {
  margin: 0 0 16px;
  font-size: var(--font-lg);
  font-weight: var(--font-normal);
}

.switchRow,
.selectRow {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.switchRow label,
.selectRow label {
  font-size: var(--font-base);
  color: var(--text);
}

.hint {
  font-size: var(--font-xs);
  color: var(--muted);
  line-height: 1.5;
  margin: 0;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
}

select {
  width: 100%;
  max-width: 200px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: #fff;
  padding: 9px 10px;
  font-size: var(--font-base);
}

select:focus {
  outline: none;
  border-color: rgba(12, 139, 115, 0.55);
  box-shadow: 0 0 0 3px rgba(12, 139, 115, 0.12);
}
```

**Step 3: 创建 index.ts**

```typescript
export { SettingsPage } from './SettingsPage';
```

**Step 4: Commit**

```bash
git add src/renderer/components/SettingsPage/
git commit -m "component: add SettingsPage with all configuration options and tips"
```

---

## Phase 12: LogsPage 组件

### Task 20: 创建 LogsPage 组件

**Files:**
- Create: `src/renderer/components/LogsPage/LogsPage.tsx`
- Create: `src/renderer/components/LogsPage/LogsPage.module.css`
- Create: `src/renderer/components/LogsPage/index.ts`

**Step 1: 创建 LogsPage.tsx**

```typescript
import { useLogs, useTranslation } from '@/hooks';
import { Button } from '@/components/common';
import { ArrowLeft, RefreshCw, Trash2 } from 'lucide-react';
import styles from './LogsPage.module.css';

export const LogsPage = () => {
  const { logs, refreshLogs, clearLogs } = useLogs();
  const { t } = useTranslation();

  const handleRefresh = async () => {
    await refreshLogs();
  };

  const handleClear = async () => {
    if (confirm(t('logs.clearConfirm'))) {
      await clearLogs();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Button onClick={() => window.history.back()}>
          <ArrowLeft size={16} />
          {t('logs.back')}
        </Button>
        <h2 className={styles.title}>
          {t('logs.title')} <span className={styles.subtitle}>({t('logs.subtitle')})</span>
        </h2>
        <div className={styles.actions}>
          <Button onClick={handleRefresh}>
            <RefreshCw size={16} />
            {t('logs.refresh')}
          </Button>
          <Button variant="danger" onClick={handleClear}>
            <Trash2 size={16} />
            {t('logs.clear')}
          </Button>
        </div>
      </div>

      <pre className={styles.logs}>
        {logs.length === 0 ? (
          <div className={styles.empty}>{t('logs.empty')}</div>
        ) : (
          logs.slice().reverse().map((log, index) => (
            <div key={index} className={styles.logEntry}>
              <div className={styles.logLine}>
                <span className={styles.timestamp}>
                  {new Date(log.timestamp).toISOString()}
                </span>
                <span className={styles.status}>
                  {log.httpStatus ? `HTTP ${log.httpStatus}` : '-'}
                </span>
              </div>
              {log.requestAddress && (
                <div className={styles.logLine}>
                  {t('logs.request')}: {log.requestAddress}
                </div>
              )}
              {log.forwardingAddress && (
                <div className={styles.logLine}>
                  {t('logs.forwarding')}: {log.forwardingAddress}
                </div>
              )}
              {log.error && (
                <div className={styles.logLine + ' ' + styles.error}>
                  {t('logs.error')}: {log.error.message}
                </div>
              )}
              <div className={styles.divider} />
            </div>
          ))
        )}
      </pre>
    </div>
  );
};
```

**Step 2: 创建 LogsPage.module.css**

```css
.container {
  padding: 12px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.title {
  margin: 0;
  font-size: var(--font-xl);
  font-weight: var(--font-medium);
}

.subtitle {
  font-size: var(--font-sm);
  color: var(--muted);
}

.actions {
  display: flex;
  gap: 8px;
}

.logs {
  margin-top: 12px;
  min-height: 260px;
  max-height: 70vh;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 12px;
  background: #ffffff;
  color: #1f3552;
  font-family: 'IBM Plex Mono', 'Consolas', monospace;
  font-size: var(--font-xs) !important;
  line-height: 1.55;
  white-space: pre-wrap;
;
  word-break: break-word;
}

.empty {
  color: var(--muted);
  text-align: center;
  padding: 40px 0;
}

.logEntry {
  margin-bottom: 12px;
}

.logLine {
  margin-bottom: 4px;
}

.timestamp {
  color: var(--muted);
}

.status {
  color: var(--accent-ink);
}

.error {
  color: var(--danger);
}

.divider {
  border-bottom: 1px solid var(--line);
  margin-bottom: 12px;
}
```

**Step 3: 创建 index.ts**

```typescript
export { LogsPage } from './LogsPage';
```

**Step 4: Commit**

```bash
git add src/renderer/components/LogsPage/
git commit -m "component: add LogsPage with refresh and clear functionality"
```

---

## Phase 13: App 组件和路由

### Task 21: 创建 App.tsx

**Files:**
- Create: `src/renderer/App.tsx`

**Step 1: 创建 App.tsx**

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from '@/components/common';
import { ToastProvider } from '@/components/common/Toast';
import { Header } from '@/components/Layout';
import { ServicePage } from '@/components/ServicePage';
import { SettingsPage } from '@/components/SettingsPage';
import { LogsPage } from '@/components/LogsPage';
import './styles/global.css';

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout><ServicePage /></Layout>} />
            <Route path="/settings" element={<Layout><SettingsPage /></Layout>} />
            <Route path="/logs" element={<Layout><LogsPage /></Layout>} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Header />
      {children}
    </div>
  );
}

export default App;
```

**Step 2: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "component: add App component with React Router setup"
```

### Task 22: 创建 main.tsx 入口文件

**Files:**
- Create: `src/renderer/main.tsx`

**Step 1: 创建 main.tsx**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/variables.css';
import './styles/reset.css';

import '@/i18n';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Step 2: 更新 index.html**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OA Proxy</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

**Step 3: Commit**

```bash
git add src/renderer/main.tsx src/renderer/index.html
git commit -m "entry: add React entry point and update HTML template"
```

---

## Phase 14: 主进程 TypeScript 迁移

### Task 23: 迁移主进程到 TypeScript

**Files:**
- Modify: `src/main/main.js` → `src/main/index.ts`
- Modify: `src/main/preload.js` → `src/main/preload.ts`
- Modify: `src/main/logStore.js` → `src/main/logStore.ts`

**Step 1: 创建 index.ts**

```typescript
import path from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import { ConfigStore } from '../proxy/configStore';
import { ProxyServer } from '../proxy/server';
import { LogStore } from './logStore';

let mainWindow: BrowserWindow | null = null;
let configStore: ConfigStore | null = null;
let proxyServer: ProxyServer | null = null;
let logStore: LogStore | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function hasServerSettingChanged(prev: any, next: any) {
  return prev.server.host !== next.server.host
    || prev.server.port !== next.server.port
    || prev.server.authEnabled !== next.server.authEnabled
    || prev.server.localBearerToken !== next.server.localBearerToken;
}

function setupIpc()() {
  ipcMain.handle('app:get-status', async () => {
    return proxyServer?.getStatus();
  });

  ipcMain.handle('app:start-server', async () => {
    return proxyServer?.start();
  });

  ipcMain.handle('app:stop-server', async () => {
    return proxyServer?.stop();
  });

  ipcMain.handle('config:get', async () => {
    return configStore?.get();
  });

  ipcMain.handle('config:save', async (_event, nextConfig) => {
    if (!configStore || !proxyServer) return { ok: false };

    const prevConfig = configStore.get();
    const saved = configStore.save(nextConfig);

    let restarted = false;
    if (proxyServer.isRunning() && hasServerSettingChanged(prevConfig, saved)) {
      await proxyServer.stop();
      await proxyServer.start();
      restarted = true;
    }

    return {
      ok: true,
      config: saved,
      restarted,
      status: proxyServer.getStatus()
    };
  });

  ipcMain.handle('logs:list', async (_event, max) => {
    return logStore?.list(max || 100);
  });

  ipcMain.handle('logs:clear', async () => {
    logStore?.clear();
    return { ok: true };
  });
}

app.whenReady().then(async () => {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  configStore = new ConfigStore(configPath);
  logStore = new LogStore(100);

  configStore.initialize();
  proxyServer = new ProxyServer(configStore, logStore);

  setupIpc();

  try {
    await proxyServer.start();
  } catch (err) {
    console.error('Failed to auto-start proxy service:', err);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    if (proxyServer && proxyServer.isRunning()) {
      await proxyServer.stop();
    }
    app.quit();
  }
});
```

**Step 2: 创建 preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('proxyApp', {
  getStatus: () => ipcRenderer.invoke('app:get-status'),
  startServer: () => ipcRenderer.invoke('app:start-server'),
  stopServer: () => ipcRenderer.invoke('app:stop-server'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config: any) => ipcRenderer.invoke('config:save', config),
  listLogs: (max?: number) => ipcRenderer.invoke('logs:list', max),
  clearLogs: () => ipcRenderer.invoke('logs:clear')
});
```

**Step 3: 创建 logStore.ts**

```typescript
export class LogStore {
  private max: number;
  private logs: any[] = [];

  constructor(max: number) {
    this.max = max;
  }

  add(log: any) {
    this.logs.push(log);
    if (this.logs.length > this.max) {
      this.logs.shift();
    }
  }

  list(max?: number) {
    const limit = max ?? this.max;
    return this.logs.slice(-limit);
  }

  clear() {
    this.logs = [];
  }
}
```

**Step 4: 删除旧的 JS 文件**

```bash
rm src/main/main.js src/main/preload.js src/main/logStore.js
```

**Step 5: 更新 package.json main 入口**

```json
{
  "main": "out/main/index.js"
}
```

**Step 6: Commit**

```bash
git add src/main/ package.json
git commit -m "refactor: migrate main process to TypeScript"
```

---

## Phase 15: 清理和测试

### Task 24: 清理旧代码

**Files:**
- Delete: `src/renderer/app.js`
- Delete: `src/renderer/index.html` (moved location)
- Delete: `src/renderer/styles.css`
- Delete: `src/renderer/` 下的其他旧文件

**Step 1: 删除旧的前端文件**

```bash
rm -rf src/renderer/app.js src/renderer/styles.css src/renderer/index.html.bak
```

**Step 2: Commit**

```bash
git add -u
git commit -m "cleanup: remove old vanilla JS frontend code"
```

### Task 25: 更新构建脚本和测试

**Files:**
- Modify: `package.json`
- Create: `electron-builder.json`

**Step 1: 更新 package.json 脚本**

```json
{
  "scripts": {
    "dev": "vite",
    "build:renderer": "tsc && vite build",
    "build:main": "tsc -p tsconfig.main.json",
    "build": "npm run build:main && npm run build:renderer",
    "start": "electron .",
    "dist": "electron-builder"
  }
}
```

**Step 2: 创建 tsconfig.main.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "../out/main",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "node"
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 3: 测试构建**

Run: `npm run build`
Expected: 成功构建，输出到 out/ 目录

**Step 4: 测试运行**

Run: `npm start`
Expected: Electron 应用启动，界面正常显示

**Step 5: Commit**

```bash
git add package.json tsconfig.main.json electron-builder.json
git commit -m "build: finalize build configuration and scripts"
```

---

## 验收检查清单

- [ ] Vite 开发服务器正常启动
- [ ] React 应用正确渲染
- [ ] 路由切换工作正常（服务页、设置页、日志页）
- [ ] 国际化切换正常（中英文）
- [ ] 主题切换正常（浅色/深色/跟随系统）
- [ ] 代理服务启动/停止正常
- [ ] 分组创建/删除正常
- [ ] 规则创建/编辑/删除正常
- [ ] 设置保存正常，包含所有新配置项
- [ ] 日志显示和清空正常
- [ ] 字体大小和字重符合设计规范
- [ ] 构建生成的应用可正常运行
- [ ] 无 TypeScript 类型错误
