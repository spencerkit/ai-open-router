/// <reference types="vite/client" />

import type {
  ProxyConfig,
  ProxyStatus,
  LogEntry,
  SaveConfigResult,
  GroupBackupExportResult,
  GroupBackupImportResult,
  ClipboardTextResult,
} from '@/types';

interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// IPC types based on preload.js exposure
interface ProxyApp {
  // App status operations
  getStatus: () => Promise<ProxyStatus>;
  readClipboardText: () => Promise<ClipboardTextResult>;
  startServer: () => Promise<ProxyStatus>;
  stopServer: () => Promise<ProxyStatus>;

  // Config operations
  getConfig: () => Promise<ProxyConfig>;
  saveConfig: (config: ProxyConfig) => Promise<SaveConfigResult>;
  exportGroupsBackup: () => Promise<GroupBackupExportResult>;
  exportGroupsToFolder: () => Promise<GroupBackupExportResult>;
  exportGroupsToClipboard: () => Promise<GroupBackupExportResult>;
  importGroupsBackup: () => Promise<GroupBackupImportResult>;
  importGroupsFromJson: (jsonText: string) => Promise<GroupBackupImportResult>;

  // Logs operations
  listLogs: (max?: number) => Promise<LogEntry[]>;
  clearLogs: () => Promise<{ ok: boolean }>;
}

// Extend Window interface with proxyApp
declare global {
  interface Window {
    proxyApp: ProxyApp;
  }
}

export {};
