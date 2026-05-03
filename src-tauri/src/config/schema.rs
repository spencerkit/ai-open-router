//! Module Overview
//! Canonical config schema and default values.
//! Defines persisted config version contract and default initialization behavior.

use crate::config::migrator::CURRENT_CONFIG_VERSION;
use crate::domain::entities::{
    CompatConfig, LoggingConfig, ProxyConfig, ProxyMetrics, RemoteGitConfig, RuleCostConfig,
    ServerConfig, UiConfig,
};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};

/// Performs default config version.
pub fn default_config_version() -> u32 {
    CURRENT_CONFIG_VERSION
}

/// Performs default quota auto refresh minutes.
pub fn default_quota_auto_refresh_minutes() -> u32 {
    5
}

/// Performs default auto start server flag.
pub fn default_auto_start_server() -> bool {
    true
}

/// Performs default auto update enabled flag.
pub fn default_auto_update_enabled() -> bool {
    true
}

/// Performs default header passthrough enabled flag.
pub fn default_header_passthrough_enabled() -> bool {
    true
}

/// Performs default remote git config.
pub fn default_remote_git_config() -> RemoteGitConfig {
    RemoteGitConfig {
        enabled: false,
        repo_url: String::new(),
        token: String::new(),
        branch: "main".to_string(),
    }
}

/// Performs default config.
pub fn default_config() -> ProxyConfig {
    ProxyConfig {
        config_version: default_config_version(),
        server: ServerConfig {
            host: "0.0.0.0".to_string(),
            port: 8899,
            auth_enabled: false,
            local_bearer_token: String::new(),
        },
        compat: CompatConfig {
            strict_mode: false,
            text_tool_call_fallback_enabled: true,
            header_passthrough_enabled: default_header_passthrough_enabled(),
        },
        logging: LoggingConfig {
            capture_body: false,
        },
        ui: UiConfig {
            theme: "light".to_string(),
            locale: "en-US".to_string(),
            locale_mode: "auto".to_string(),
            launch_on_startup: false,
            auto_start_server: default_auto_start_server(),
            close_to_tray: true,
            quota_auto_refresh_minutes: default_quota_auto_refresh_minutes(),
            auto_update_enabled: default_auto_update_enabled(),
        },
        remote_git: default_remote_git_config(),
        providers: vec![],
        groups: vec![],
    }
}

/// Performs default metrics.
pub fn default_metrics() -> ProxyMetrics {
    ProxyMetrics {
        requests: 0,
        stream_requests: 0,
        errors: 0,
        avg_latency_ms: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        uptime_started_at: None,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialServerConfig {
    host: Option<String>,
    port: Option<u16>,
    auth_enabled: Option<bool>,
    local_bearer_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialCompatConfig {
    strict_mode: Option<bool>,
    text_tool_call_fallback_enabled: Option<bool>,
    header_passthrough_enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialLoggingConfig {
    capture_body: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialUiConfig {
    theme: Option<String>,
    locale: Option<String>,
    locale_mode: Option<String>,
    launch_on_startup: Option<bool>,
    auto_start_server: Option<bool>,
    close_to_tray: Option<bool>,
    quota_auto_refresh_minutes: Option<u32>,
    auto_update_enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialRemoteGitConfig {
    enabled: Option<bool>,
    repo_url: Option<String>,
    token: Option<String>,
    branch: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialProxyConfig {
    config_version: Option<u32>,
    server: Option<PartialServerConfig>,
    compat: Option<PartialCompatConfig>,
    logging: Option<PartialLoggingConfig>,
    ui: Option<PartialUiConfig>,
    remote_git: Option<PartialRemoteGitConfig>,
    providers: Option<serde_json::Value>,
    groups: Option<serde_json::Value>,
}

/// Normalizes config for this module's workflow.
pub fn normalize_config(input: serde_json::Value) -> Result<ProxyConfig, String> {
    let defaults = default_config();
    let partial = serde_json::from_value::<PartialProxyConfig>(input)
        .map_err(|e| format!("invalid config structure: {e}"))?;

    let groups = if let Some(raw_groups) = partial.groups {
        let parsed: Vec<crate::domain::entities::Group> = serde_json::from_value(raw_groups)
            .map_err(|e| format!("invalid groups structure: {e}"))?;
        // Normalize: ensure each group has a routing_table (default to empty Vec)
        let normalized: Vec<_> = parsed
            .into_iter()
            .map(|mut g| {
                if g.routing_table.is_empty() && g.provider_ids.is_none() && g.providers.is_none() {
                    g.routing_table = Vec::new();
                }
                if let Some(providers) = g.providers.take() {
                    g.providers = Some(
                        providers
                            .into_iter()
                            .map(normalize_provider_model_costs)
                            .collect(),
                    );
                }
                g
            })
            .collect();
        normalized
    } else {
        defaults.groups
    };
    let providers = if let Some(raw_providers) = partial.providers {
        let parsed: Vec<crate::domain::entities::Rule> = serde_json::from_value(raw_providers)
            .map_err(|e| format!("invalid providers structure: {e}"))?;
        // Normalize: ensure each provider has a models field (default to empty Vec)
        let normalized: Vec<_> = parsed
            .into_iter()
            .map(|mut p| {
                if p.models.is_empty() {
                    p.models = Vec::new();
                }
                normalize_provider_model_costs(p)
            })
            .collect();
        normalized
    } else {
        defaults.providers
    };

    let locale = partial
        .ui
        .as_ref()
        .and_then(|u| u.locale.clone())
        .unwrap_or_else(|| defaults.ui.locale.clone());
    let normalized_locale = if locale == "zh-CN" { "zh-CN" } else { "en-US" }.to_string();

    let locale_mode = partial
        .ui
        .as_ref()
        .and_then(|u| u.locale_mode.clone())
        .unwrap_or_else(|| {
            if locale == "zh-CN" {
                "manual".to_string()
            } else {
                defaults.ui.locale_mode.clone()
            }
        });
    let normalized_locale_mode = if locale_mode == "manual" {
        "manual"
    } else {
        "auto"
    }
    .to_string();

    let remote_repo_url = partial
        .remote_git
        .as_ref()
        .and_then(|r| r.repo_url.clone())
        .unwrap_or(defaults.remote_git.repo_url);
    let remote_token = partial
        .remote_git
        .as_ref()
        .and_then(|r| r.token.clone())
        .unwrap_or(defaults.remote_git.token);
    let remote_branch = partial
        .remote_git
        .as_ref()
        .and_then(|r| r.branch.clone())
        .filter(|v| !v.trim().is_empty())
        .unwrap_or(defaults.remote_git.branch);
    let remote_enabled = partial
        .remote_git
        .as_ref()
        .and_then(|r| r.enabled)
        .unwrap_or_else(|| !remote_repo_url.trim().is_empty() || !remote_token.trim().is_empty());

    Ok(ProxyConfig {
        config_version: partial.config_version.unwrap_or(default_config_version()),
        server: ServerConfig {
            host: partial
                .server
                .as_ref()
                .and_then(|s| s.host.clone())
                .filter(|v| !v.trim().is_empty())
                .unwrap_or(defaults.server.host),
            port: partial
                .server
                .as_ref()
                .and_then(|s| s.port)
                .unwrap_or(defaults.server.port),
            auth_enabled: partial
                .server
                .as_ref()
                .and_then(|s| s.auth_enabled)
                .unwrap_or(defaults.server.auth_enabled),
            local_bearer_token: partial
                .server
                .as_ref()
                .and_then(|s| s.local_bearer_token.clone())
                .unwrap_or(defaults.server.local_bearer_token),
        },
        compat: CompatConfig {
            strict_mode: partial
                .compat
                .as_ref()
                .and_then(|c| c.strict_mode)
                .unwrap_or(defaults.compat.strict_mode),
            text_tool_call_fallback_enabled: partial
                .compat
                .as_ref()
                .and_then(|c| c.text_tool_call_fallback_enabled)
                .unwrap_or(defaults.compat.text_tool_call_fallback_enabled),
            header_passthrough_enabled: partial
                .compat
                .as_ref()
                .and_then(|c| c.header_passthrough_enabled)
                .unwrap_or(defaults.compat.header_passthrough_enabled),
        },
        logging: LoggingConfig {
            capture_body: partial
                .logging
                .as_ref()
                .and_then(|l| l.capture_body)
                .unwrap_or(defaults.logging.capture_body),
        },
        ui: UiConfig {
            theme: partial
                .ui
                .as_ref()
                .and_then(|u| u.theme.clone())
                .filter(|v| v == "light" || v == "dark")
                .unwrap_or(defaults.ui.theme),
            locale: normalized_locale,
            locale_mode: normalized_locale_mode,
            launch_on_startup: partial
                .ui
                .as_ref()
                .and_then(|u| u.launch_on_startup)
                .unwrap_or(defaults.ui.launch_on_startup),
            auto_start_server: partial
                .ui
                .as_ref()
                .and_then(|u| u.auto_start_server)
                .unwrap_or(defaults.ui.auto_start_server),
            close_to_tray: partial
                .ui
                .as_ref()
                .and_then(|u| u.close_to_tray)
                .unwrap_or(defaults.ui.close_to_tray),
            quota_auto_refresh_minutes: partial
                .ui
                .as_ref()
                .and_then(|u| u.quota_auto_refresh_minutes)
                .unwrap_or(defaults.ui.quota_auto_refresh_minutes),
            auto_update_enabled: partial
                .ui
                .as_ref()
                .and_then(|u| u.auto_update_enabled)
                .unwrap_or(defaults.ui.auto_update_enabled),
        },
        remote_git: RemoteGitConfig {
            enabled: remote_enabled,
            repo_url: remote_repo_url,
            token: remote_token,
            branch: remote_branch,
        },
        providers,
        groups,
    })
}

fn normalize_provider_model_costs(
    mut provider: crate::domain::entities::Rule,
) -> crate::domain::entities::Rule {
    let valid_models: HashSet<String> = provider
        .models
        .iter()
        .map(|model| model.trim().to_string())
        .filter(|model| !model.is_empty())
        .collect();
    let mut normalized_model_costs = HashMap::new();
    for (model, cost) in std::mem::take(&mut provider.model_costs) {
        let trimmed_model = model.trim();
        if trimmed_model.is_empty() || !valid_models.contains(trimmed_model) {
            continue;
        }
        normalized_model_costs
            .entry(trimmed_model.to_string())
            .or_insert(cost);
    }
    if normalized_model_costs.is_empty() && is_meaningfully_configured_legacy_cost(&provider.cost) {
        for model in &provider.models {
            let trimmed_model = model.trim();
            if trimmed_model.is_empty() {
                continue;
            }
            normalized_model_costs.insert(trimmed_model.to_string(), provider.cost.clone());
        }
    }
    provider.model_costs = normalized_model_costs;
    provider
}

fn is_meaningfully_configured_legacy_cost(cost: &RuleCostConfig) -> bool {
    cost.enabled
        || cost.input_price_per_m != 0.0
        || cost.output_price_per_m != 0.0
        || cost.cache_input_price_per_m != 0.0
        || cost.cache_output_price_per_m != 0.0
        || cost.currency != "USD"
        || cost.template.is_some()
}

#[cfg(test)]
mod tests {
    use super::normalize_config;
    use crate::config::migrator::CURRENT_CONFIG_VERSION;
    use serde_json::json;

    #[test]
    fn normalize_config_backfills_model_costs_from_legacy_cost_for_current_version_payloads() {
        let normalized = normalize_config(json!({
            "configVersion": CURRENT_CONFIG_VERSION,
            "server": {
                "host": "0.0.0.0",
                "port": 8899,
                "authEnabled": false,
                "localBearerToken": ""
            },
            "compat": {
                "strictMode": false,
                "textToolCallFallbackEnabled": true,
                "headerPassthroughEnabled": true
            },
            "logging": {
                "captureBody": false
            },
            "ui": {
                "theme": "light",
                "locale": "en-US",
                "localeMode": "auto",
                "launchOnStartup": false,
                "autoStartServer": true,
                "closeToTray": true,
                "quotaAutoRefreshMinutes": 5,
                "autoUpdateEnabled": true
            },
            "remoteGit": {
                "enabled": false,
                "repoUrl": "",
                "token": "",
                "branch": "main"
            },
            "providers": [
                {
                    "id": "provider-1",
                    "name": "provider-1",
                    "protocol": "openai",
                    "token": "secret",
                    "apiAddress": "https://example.com/v1",
                    "models": ["gpt-4.1", "gpt-4o-mini"],
                    "cost": {
                        "enabled": true,
                        "inputPricePerM": 1.25,
                        "outputPricePerM": 6.5,
                        "cacheInputPricePerM": 0.5,
                        "cacheOutputPricePerM": 0.25,
                        "currency": "USD"
                    }
                }
            ],
            "groups": []
        }))
        .expect("normalize config should succeed");

        assert_eq!(normalized.providers.len(), 1);
        assert_eq!(normalized.providers[0].model_costs.len(), 2);
        assert!(normalized.providers[0].model_costs.contains_key("gpt-4.1"));
        assert!(normalized.providers[0]
            .model_costs
            .contains_key("gpt-4o-mini"));
        assert!(normalized.providers[0].model_costs["gpt-4.1"].enabled);
    }

    #[test]
    fn normalize_config_canonicalizes_trimmed_model_cost_keys() {
        let normalized = normalize_config(json!({
            "configVersion": CURRENT_CONFIG_VERSION,
            "server": {
                "host": "0.0.0.0",
                "port": 8899,
                "authEnabled": false,
                "localBearerToken": ""
            },
            "compat": {
                "strictMode": false,
                "textToolCallFallbackEnabled": true,
                "headerPassthroughEnabled": true
            },
            "logging": {
                "captureBody": false
            },
            "ui": {
                "theme": "light",
                "locale": "en-US",
                "localeMode": "auto",
                "launchOnStartup": false,
                "autoStartServer": true,
                "closeToTray": true,
                "quotaAutoRefreshMinutes": 5,
                "autoUpdateEnabled": true
            },
            "remoteGit": {
                "enabled": false,
                "repoUrl": "",
                "token": "",
                "branch": "main"
            },
            "providers": [
                {
                    "id": "provider-1",
                    "name": "provider-1",
                    "protocol": "openai",
                    "token": "secret",
                    "apiAddress": "https://example.com/v1",
                    "models": ["gpt-4.1"],
                    "modelCosts": {
                        " gpt-4.1 ": {
                            "enabled": true,
                            "inputPricePerM": 1.25,
                            "outputPricePerM": 6.5,
                            "cacheInputPricePerM": 0.5,
                            "cacheOutputPricePerM": 0.25,
                            "currency": "USD"
                        },
                        " stale ": {
                            "enabled": true,
                            "inputPricePerM": 9.0,
                            "outputPricePerM": 9.0,
                            "cacheInputPricePerM": 9.0,
                            "cacheOutputPricePerM": 9.0,
                            "currency": "USD"
                        }
                    }
                }
            ],
            "groups": []
        }))
        .expect("normalize config should succeed");

        assert_eq!(normalized.providers.len(), 1);
        assert_eq!(normalized.providers[0].model_costs.len(), 1);
        assert!(normalized.providers[0].model_costs.contains_key("gpt-4.1"));
        assert!(!normalized.providers[0]
            .model_costs
            .contains_key(" gpt-4.1 "));
        assert!(!normalized.providers[0].model_costs.contains_key(" stale "));
    }

    #[test]
    fn normalize_config_does_not_backfill_default_empty_legacy_cost() {
        let normalized = normalize_config(json!({
            "configVersion": CURRENT_CONFIG_VERSION,
            "server": {
                "host": "0.0.0.0",
                "port": 8899,
                "authEnabled": false,
                "localBearerToken": ""
            },
            "compat": {
                "strictMode": false,
                "textToolCallFallbackEnabled": true,
                "headerPassthroughEnabled": true
            },
            "logging": {
                "captureBody": false
            },
            "ui": {
                "theme": "light",
                "locale": "en-US",
                "localeMode": "auto",
                "launchOnStartup": false,
                "autoStartServer": true,
                "closeToTray": true,
                "quotaAutoRefreshMinutes": 5,
                "autoUpdateEnabled": true
            },
            "remoteGit": {
                "enabled": false,
                "repoUrl": "",
                "token": "",
                "branch": "main"
            },
            "providers": [
                {
                    "id": "provider-1",
                    "name": "provider-1",
                    "protocol": "openai",
                    "token": "secret",
                    "apiAddress": "https://example.com/v1",
                    "models": ["gpt-4.1"],
                    "cost": {
                        "enabled": false,
                        "inputPricePerM": 0.0,
                        "outputPricePerM": 0.0,
                        "cacheInputPricePerM": 0.0,
                        "cacheOutputPricePerM": 0.0,
                        "currency": "USD"
                    }
                }
            ],
            "groups": []
        }))
        .expect("normalize config should succeed");

        assert_eq!(normalized.providers.len(), 1);
        assert!(normalized.providers[0].model_costs.is_empty());
    }
}
