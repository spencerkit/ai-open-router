//! Module Overview
//! Service layer orchestration for feature-specific workflows.
//! Coordinates validation, persistence, runtime sync, and structured results.

use crate::app_state::{apply_launch_on_startup_setting, sync_runtime_config, SharedState};
use crate::backup::extract_groups_from_import_payload;
use crate::models::{
    AuthSessionStatus, GroupBackupImportResult, GroupImportMode, ProxyConfig, ProxyStatus,
    SaveConfigResult,
};
use crate::services::{AppError, AppResult};
use serde_json::Value;
use tauri::AppHandle;

/// Performs get config.
pub fn get_config(state: &SharedState) -> ProxyConfig {
    state.config_store.get()
}

/// Builds the remote admin auth session status for local or remote callers.
pub fn auth_session_status(
    state: &SharedState,
    remote_request: bool,
    authenticated: bool,
) -> AuthSessionStatus {
    let password_configured = state.remote_admin_auth.password_configured();
    AuthSessionStatus {
        authenticated: if remote_request && password_configured {
            authenticated
        } else {
            true
        },
        remote_request,
        password_configured,
    }
}

/// Sets the remote admin password used by `/api/*` and `/management`.
pub fn set_remote_admin_password(
    state: &SharedState,
    password: String,
    remote_request: bool,
) -> AppResult<AuthSessionStatus> {
    state
        .remote_admin_auth
        .set_password(&password)
        .map_err(AppError::validation)?;
    Ok(auth_session_status(state, remote_request, true))
}

/// Clears the remote admin password used by `/api/*` and `/management`.
pub fn clear_remote_admin_password(
    state: &SharedState,
    remote_request: bool,
) -> AppResult<AuthSessionStatus> {
    state
        .remote_admin_auth
        .clear_password()
        .map_err(AppError::internal)?;
    Ok(auth_session_status(state, remote_request, true))
}

/// Saves config for this module's workflow.
pub async fn save_config(
    state: &SharedState,
    app: &AppHandle,
    next_config: Value,
) -> AppResult<SaveConfigResult> {
    let prev = state.config_store.get();
    let saved = state.config_store.save(next_config)?;

    apply_launch_on_startup_setting(app, saved.ui.launch_on_startup);
    let (restarted, status) = sync_runtime_config(state, prev, saved.clone()).await?;

    Ok(SaveConfigResult {
        ok: true,
        config: saved,
        restarted,
        status,
    })
}

/// Performs import groups payload.
pub async fn import_groups_payload(
    state: &SharedState,
    parsed: Value,
    _mode: Option<GroupImportMode>,
) -> AppResult<(usize, ProxyConfig, bool, ProxyStatus)> {
    let imported_groups =
        extract_groups_from_import_payload(&parsed).map_err(AppError::validation)?;
    let imported_group_count = imported_groups.len();
    let prev = state.config_store.get();
    let mut next = prev.clone();

    // 覆盖模式：直接替换 groups，清空 providers
    next.groups = imported_groups;
    next.providers = vec![];

    let saved = state.config_store.save_config(next)?;
    let (restarted, status) = sync_runtime_config(state, prev, saved.clone()).await?;

    Ok((imported_group_count, saved, restarted, status))
}

/// Performs import groups with source.
pub async fn import_groups_with_source(
    state: &SharedState,
    parsed: Value,
    source: &str,
    file_path: Option<String>,
    mode: Option<GroupImportMode>,
) -> AppResult<GroupBackupImportResult> {
    let (groups_len, saved, restarted, status) = import_groups_payload(state, parsed, mode).await?;

    Ok(GroupBackupImportResult {
        ok: true,
        canceled: false,
        source: Some(source.to_string()),
        file_path,
        imported_group_count: Some(groups_len),
        config: Some(saved),
        restarted: Some(restarted),
        status: Some(status),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_state::AppState;
    use crate::config::schema::default_config;
    use crate::domain::entities::{default_group_failover_config, default_rule_cost_config, default_rule_quota_config, Group, RouteEntry, Rule};
    use crate::integration_store::IntegrationStore;
    use crate::log_store::LogStore;
    use crate::models::{AppInfo, GroupImportMode};
    use crate::proxy::ProxyRuntime;
    use crate::stats_store::StatsStore;
    use serde_json::json;
    use std::collections::HashMap;
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// Performs provider.
    fn provider(id: &str, name: &str, model: &str) -> Rule {
        Rule {
            id: id.to_string(),
            name: name.to_string(),
            protocol: crate::domain::entities::RuleProtocol::Openai,
            token: "token".to_string(),
            api_address: "https://example.com".to_string(),
            website: String::new(),
            models: Vec::new(),
            default_model: Some(model.to_string()),
            model_mappings: Some(HashMap::new()),
            header_passthrough_allow: Vec::new(),
            header_passthrough_deny: Vec::new(),
            quota: default_rule_quota_config(),
            cost: default_rule_cost_config(),
        }
    }

    /// Performs group.
    fn group(id: &str, name: &str, providers: Vec<Rule>) -> Group {
        let default_route = RouteEntry {
            request_model: "default".to_string(),
            provider_id: String::new(),
            target_model: String::new(),
        };
        Group {
            id: id.to_string(),
            name: name.to_string(),
            routing_table: vec![default_route],
            models: Some(vec!["model-a".to_string()]),
            provider_ids: None,
            active_provider_id: None,
            providers: Some(providers),
            failover: Some(default_group_failover_config()),
        }
    }

    fn test_shared_state() -> SharedState {
        let unique_id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time must move forward")
            .as_nanos();
        let base_dir = std::env::temp_dir().join(format!("oc-proxy-config-service-{unique_id}"));
        std::fs::create_dir_all(&base_dir).expect("temp dir should be created");

        let config_store = crate::config_store::ConfigStore::new(base_dir.join("config.json"));
        config_store
            .initialize()
            .expect("config store should initialize");

        let integration_store = IntegrationStore::new(base_dir.join("integrations.json"));
        integration_store
            .initialize()
            .expect("integration store should initialize");

        let remote_admin_auth =
            crate::auth::RemoteAdminAuthStore::new(base_dir.join("remote-admin-auth.json"));
        remote_admin_auth
            .initialize()
            .expect("remote admin auth should initialize");

        let stats_store = StatsStore::new(base_dir.join("stats.sqlite"));
        stats_store
            .initialize()
            .expect("stats store should initialize");

        let runtime = ProxyRuntime::new(
            config_store.shared_config(),
            config_store.shared_revision(),
            LogStore::new(64),
            stats_store,
        )
        .expect("runtime should initialize");

        Arc::new(AppState {
            app_info: AppInfo {
                name: "test".to_string(),
                version: "0.0.0".to_string(),
            },
            config_store,
            integration_store,
            remote_admin_auth,
            runtime,
            renderer_ready: AtomicBool::new(false),
        })
    }

    #[test]
    fn set_remote_admin_password_marks_remote_request_authenticated() {
        let state = test_shared_state();

        let status =
            set_remote_admin_password(&state, "correct horse battery staple".to_string(), true)
                .expect("password should be set");

        assert!(status.remote_request);
        assert!(status.password_configured);
        assert!(status.authenticated);
    }

    #[tokio::test]
    async fn import_groups_incremental_keeps_existing_top_level_config() {
        let state = test_shared_state();
        let mut initial = default_config();
        initial.server.host = "127.0.0.1".to_string();
        initial.ui.theme = "dark".to_string();
        initial.groups = vec![group(
            "group-local",
            "Local",
            vec![provider("p-local", "alpha", "old-model")],
        )];
        initial.providers = initial.groups[0].providers.as_ref().unwrap().clone();
        state
            .config_store
            .save_config(initial)
            .expect("initial config should save");

        let parsed = json!({
            "groups": [
                {
                    "id": "group-local",
                    "name": "Imported",
                    "models": ["model-b"],
                    "activeProviderId": "p-import",
                    "providers": [
                        {
                            "id": "p-import",
                            "name": "alpha",
                            "protocol": "openai",
                            "token": "token",
                            "apiAddress": "https://example.com",
                            "defaultModel": "new-model"
                        }
                    ]
                }
            ]
        });

        let (_, saved, _, _) =
            import_groups_payload(&state, parsed, Some(GroupImportMode::Incremental))
                .await
                .expect("incremental import should succeed");

        assert_eq!(saved.server.host, "127.0.0.1");
        assert_eq!(saved.ui.theme, "dark");
        assert_eq!(saved.groups.len(), 1);
        assert_eq!(saved.groups[0].id, "group-local");
        assert_eq!(saved.groups[0].providers.as_ref().unwrap().len(), 1);
        assert_eq!(saved.groups[0].providers.as_ref().unwrap()[0].name, "alpha");
        assert_eq!(
            saved.groups[0].providers.as_ref().unwrap()[0]
                .default_model
                .as_deref(),
            Some("new-model")
        );
    }

    #[tokio::test]
    async fn import_groups_without_mode_defaults_to_incremental() {
        let state = test_shared_state();
        let mut initial = default_config();
        initial.groups = vec![group(
            "group-local",
            "Local",
            vec![provider("p-local", "alpha", "old-model")],
        )];
        initial.providers = initial.groups[0].providers.as_ref().unwrap().clone();
        state
            .config_store
            .save_config(initial)
            .expect("initial config should save");

        let parsed = json!({
            "groups": [
                {
                    "id": "group-local",
                    "name": "Imported",
                    "models": ["model-b"],
                    "activeProviderId": "p-import",
                    "providers": [
                        {
                            "id": "p-import",
                            "name": "alpha",
                            "protocol": "openai",
                            "token": "token",
                            "apiAddress": "https://example.com",
                            "defaultModel": "new-model"
                        }
                    ]
                }
            ]
        });

        let (_, saved, _, _) = import_groups_payload(&state, parsed, None)
            .await
            .expect("default import should succeed");

        assert_eq!(saved.groups.len(), 1);
        assert_eq!(saved.groups[0].name, "Imported");
        assert_eq!(saved.groups[0].providers.as_ref().unwrap().len(), 1);
        assert_eq!(saved.groups[0].providers.as_ref().unwrap()[0].name, "alpha");
        assert_eq!(
            saved.groups[0].providers.as_ref().unwrap()[0]
                .default_model
                .as_deref(),
            Some("new-model")
        );
    }

    #[tokio::test]
    async fn import_groups_overwrite_replaces_groups_and_global_providers_only() {
        let state = test_shared_state();
        let mut initial = default_config();
        initial.server.host = "127.0.0.1".to_string();
        initial.server.port = 9999;
        initial.ui.theme = "dark".to_string();
        initial.groups = vec![group(
            "group-local",
            "Local",
            vec![provider("p-local", "alpha", "old-model")],
        )];
        initial.providers = vec![
            provider("p-local", "alpha", "old-model"),
            provider("p-stale", "stale", "stale-model"),
        ];
        state
            .config_store
            .save_config(initial)
            .expect("initial config should save");

        let parsed = json!({
            "groups": [
                {
                    "id": "group-imported",
                    "name": "Imported",
                    "models": ["model-b"],
                    "activeProviderId": "p-import",
                    "providers": [
                        {
                            "id": "p-import",
                            "name": "beta",
                            "protocol": "openai",
                            "token": "token",
                            "apiAddress": "https://example.com",
                            "defaultModel": "new-model"
                        }
                    ]
                }
            ]
        });

        let (_, saved, _, _) =
            import_groups_payload(&state, parsed, Some(GroupImportMode::Overwrite))
                .await
                .expect("overwrite import should succeed");

        assert_eq!(saved.server.host, "127.0.0.1");
        assert_eq!(saved.server.port, 9999);
        assert_eq!(saved.ui.theme, "dark");
        assert_eq!(saved.groups.len(), 1);
        assert_eq!(saved.groups[0].id, "group-imported");
        assert_eq!(saved.groups[0].providers.as_ref().unwrap().len(), 1);
        assert_eq!(saved.groups[0].providers.as_ref().unwrap()[0].name, "beta");
        assert_eq!(saved.providers.len(), 1);
        assert_eq!(saved.providers[0].name, "beta");
        assert!(!saved
            .providers
            .iter()
            .any(|provider| provider.name == "stale"));
    }
}
