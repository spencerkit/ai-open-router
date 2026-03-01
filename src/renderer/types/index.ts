/**
 * OA Proxy Type Definitions
 *
 * This file exports all type definitions for the OA Proxy application.
 * These types are used across the renderer process to ensure type safety.
 */

// Config types
export type {
  ServerConfig,
  CompatConfig,
  LoggingConfig,
  UIConfig,
  ThemeMode,
  LocaleCode,
} from './config';

// Proxy types
export type {
  Rule,
  Group,
  RuleDirection,
  RuleProtocol,
  ProxyStatus,
  ProxyMetrics,
  LogEntry,
  LogEntryError,
  LogEntryStatus,
  LogEntryPhase,
} from './proxy';

import type { ServerConfig, CompatConfig, LoggingConfig, UIConfig } from './config';
import type { Group, ProxyStatus } from './proxy';

/**
 * Complete proxy configuration interface
 * Combines server, compat, logging, and groups configuration
 */
export interface ProxyConfig {
  server: ServerConfig;
  compat: CompatConfig;
  logging: LoggingConfig;
  ui: UIConfig;
  groups: Group[];
}

/**
 * Result from saving configuration
 */
export interface SaveConfigResult {
  ok: boolean;
  config: ProxyConfig;
  restarted: boolean;
  status: ProxyStatus;
}

export interface GroupBackupExportResult {
  ok: boolean;
  canceled: boolean;
  source?: 'file' | 'folder' | 'clipboard';
  filePath?: string | null;
  groupCount: number;
  charCount?: number;
}

export interface GroupBackupImportResult {
  ok: boolean;
  canceled: boolean;
  source?: 'file' | 'json';
  filePath?: string;
  importedGroupCount?: number;
  config?: ProxyConfig;
  restarted?: boolean;
  status?: ProxyStatus;
}

export interface ClipboardTextResult {
  text: string;
}
