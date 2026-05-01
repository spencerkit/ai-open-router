//! Module Overview
//! Config migration logic between schema versions.
//! Transforms legacy config payloads to the current schema in a deterministic way.

use serde_json::{Map, Value};

pub const CURRENT_CONFIG_VERSION: u32 = 5;

/// Migrates arbitrary config payload into the latest supported schema version.
pub fn migrate_config(input: Value) -> Result<Value, String> {
    let mut root = ensure_object_root(input);
    let mut version = detect_config_version(&root);

    if version > CURRENT_CONFIG_VERSION {
        return Err(format!(
            "configVersion {version} is newer than supported version {CURRENT_CONFIG_VERSION}"
        ));
    }

    while version < CURRENT_CONFIG_VERSION {
        root = match version {
            1 => migrate_v1_to_v2(root),
            2 => migrate_v2_to_v3(root),
            3 => migrate_v3_to_v4(root),
            4 => migrate_v4_to_v5(root),
            _ => {
                return Err(format!(
                    "missing migrator for configVersion {version} -> {}",
                    version + 1
                ));
            }
        };
        version += 1;
    }

    if let Some(obj) = root.as_object_mut() {
        obj.insert(
            "configVersion".to_string(),
            Value::Number((CURRENT_CONFIG_VERSION as u64).into()),
        );
    }

    Ok(root)
}

/// Ensures migration always works with an object root.
fn ensure_object_root(input: Value) -> Value {
    if input.is_object() {
        input
    } else {
        Value::Object(Map::new())
    }
}

/// Detects config version from payload and defaults to v1 for legacy data.
fn detect_config_version(root: &Value) -> u32 {
    root.get("configVersion")
        .and_then(Value::as_u64)
        .and_then(|v| u32::try_from(v).ok())
        .unwrap_or(1)
}

/// Applies v1 -> v2 migration defaults for locale mode and remote-git options.
fn migrate_v1_to_v2(mut root: Value) -> Value {
    let Some(obj) = root.as_object_mut() else {
        return Value::Object(Map::new());
    };

    let locale = obj
        .get("ui")
        .and_then(Value::as_object)
        .and_then(|ui| ui.get("locale"))
        .and_then(Value::as_str)
        .unwrap_or("en-US");
    let default_locale_mode = if locale == "zh-CN" { "manual" } else { "auto" };
    let ui = obj
        .entry("ui".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if let Some(ui_obj) = ui.as_object_mut() {
        if !ui_obj.contains_key("localeMode") {
            ui_obj.insert(
                "localeMode".to_string(),
                Value::String(default_locale_mode.to_string()),
            );
        }
    }

    let remote = obj
        .entry("remoteGit".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if let Some(remote_obj) = remote.as_object_mut() {
        let repo_url = remote_obj
            .get("repoUrl")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let token = remote_obj
            .get("token")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !remote_obj.contains_key("enabled") {
            remote_obj.insert(
                "enabled".to_string(),
                Value::Bool(!repo_url.trim().is_empty() || !token.trim().is_empty()),
            );
        }
        let branch = remote_obj
            .get("branch")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if branch.trim().is_empty() {
            remote_obj.insert("branch".to_string(), Value::String("main".to_string()));
        }
    }

    obj.insert("configVersion".to_string(), Value::Number(2u64.into()));
    root
}

/// Applies v2 -> v3 migration defaults for service startup behavior.
fn migrate_v2_to_v3(mut root: Value) -> Value {
    let Some(obj) = root.as_object_mut() else {
        return Value::Object(Map::new());
    };

    let ui = obj
        .entry("ui".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if let Some(ui_obj) = ui.as_object_mut() {
        if !ui_obj.contains_key("autoStartServer") {
            ui_obj.insert("autoStartServer".to_string(), Value::Bool(true));
        }
    }

    obj.insert("configVersion".to_string(), Value::Number(3u64.into()));
    root
}

/// Applies v3 -> v4 migration defaults for auto update behavior.
fn migrate_v3_to_v4(mut root: Value) -> Value {
    let Some(obj) = root.as_object_mut() else {
        return Value::Object(Map::new());
    };

    let ui = obj
        .entry("ui".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if let Some(ui_obj) = ui.as_object_mut() {
        if !ui_obj.contains_key("autoUpdateEnabled") {
            ui_obj.insert("autoUpdateEnabled".to_string(), Value::Bool(true));
        }
    }

    obj.insert("configVersion".to_string(), Value::Number(5u64.into()));
    root
}

/// Applies v4 -> v5 migration: filters out invalid groups and providers.
fn migrate_v4_to_v5(mut root: Value) -> Value {
    let Some(obj) = root.as_object_mut() else {
        return Value::Object(Map::new());
    };

    // Filter out groups that lack both routingTable and routing_table.
    if let Some(groups) = obj.get_mut("groups").and_then(Value::as_array_mut) {
        groups.retain(|g| g.get("routingTable").is_some() || g.get("routing_table").is_some());
    }

    // Filter out providers that lack models.
    if let Some(providers) = obj.get_mut("providers").and_then(Value::as_array_mut) {
        migrate_legacy_provider_costs(providers);
        providers.retain(|p| p.get("models").is_some());
    }

    if let Some(groups) = obj.get_mut("groups").and_then(Value::as_array_mut) {
        for group in groups {
            if let Some(providers) = group.get_mut("providers").and_then(Value::as_array_mut) {
                migrate_legacy_provider_costs(providers);
            }
        }
    }

    obj.insert("configVersion".to_string(), Value::Number(4u64.into()));
    root
}

fn migrate_legacy_provider_costs(providers: &mut [Value]) {
    for provider in providers {
        migrate_legacy_provider_cost(provider);
    }
}

fn migrate_legacy_provider_cost(provider: &mut Value) {
    let Some(provider_obj) = provider.as_object_mut() else {
        return;
    };

    let Some(cost) = provider_obj.get("cost").cloned() else {
        return;
    };

    let Some(models) = provider_obj.get("models").and_then(Value::as_array) else {
        return;
    };

    let declared_models: Vec<String> = models
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|model| !model.is_empty())
        .map(ToOwned::to_owned)
        .collect();
    if declared_models.is_empty() {
        return;
    }

    let model_costs = provider_obj
        .entry("modelCosts".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let Some(model_costs_obj) = model_costs.as_object_mut() else {
        *model_costs = Value::Object(Map::new());
        return migrate_legacy_provider_cost(provider);
    };

    for model in declared_models {
        model_costs_obj.entry(model).or_insert_with(|| cost.clone());
    }
}

#[cfg(test)]
mod tests {
    use super::{migrate_config, CURRENT_CONFIG_VERSION};
    use serde_json::json;

    #[test]
    /// Performs migrate defaults missing version to current.
    fn migrate_defaults_missing_version_to_current() {
        let migrated = migrate_config(json!({})).expect("migration should succeed");
        assert_eq!(migrated["configVersion"], CURRENT_CONFIG_VERSION);
    }

    #[test]
    /// Performs migrate v1 to v2 fills locale mode and remote defaults.
    fn migrate_v1_to_v2_fills_locale_mode_and_remote_defaults() {
        let migrated = migrate_config(json!({
            "ui": {
                "locale": "zh-CN"
            },
            "remoteGit": {
                "repoUrl": "https://github.com/demo/repo.git",
                "token": "tok"
            }
        }))
        .expect("migration should succeed");

        assert_eq!(migrated["configVersion"], 5);
        assert_eq!(migrated["ui"]["localeMode"], "manual");
        assert_eq!(migrated["ui"]["autoStartServer"], true);
        assert_eq!(migrated["ui"]["autoUpdateEnabled"], true);
        assert_eq!(migrated["remoteGit"]["enabled"], true);
        assert_eq!(migrated["remoteGit"]["branch"], "main");
    }

    #[test]
    /// Performs migrate rejects future version.
    fn migrate_rejects_future_version() {
        let err = migrate_config(json!({
            "configVersion": CURRENT_CONFIG_VERSION + 1
        }))
        .expect_err("future version must fail");
        assert!(err.contains("newer than supported"));
    }

    #[test]
    /// Performs migrate is idempotent on current version.
    fn migrate_is_idempotent_on_current_version() {
        let input = json!({
            "configVersion": CURRENT_CONFIG_VERSION,
            "ui": {
                "locale": "en-US",
                "localeMode": "auto",
                "autoStartServer": true,
                "autoUpdateEnabled": true
            },
            "remoteGit": { "enabled": false, "repoUrl": "", "token": "", "branch": "main" }
        });
        let migrated = migrate_config(input.clone()).expect("migration should succeed");
        assert_eq!(migrated["configVersion"], CURRENT_CONFIG_VERSION);
        assert_eq!(migrated["ui"]["localeMode"], "auto");
        assert_eq!(migrated["remoteGit"]["branch"], "main");
    }

    #[test]
    /// Performs migrate v2 to v3 fills auto start server default.
    fn migrate_v2_to_v3_fills_auto_start_server() {
        let migrated = migrate_config(json!({
            "configVersion": 2,
            "ui": { "locale": "en-US", "localeMode": "auto" }
        }))
        .expect("migration should succeed");

        assert_eq!(migrated["configVersion"], 5);
        assert_eq!(migrated["ui"]["autoStartServer"], true);
        assert_eq!(migrated["ui"]["autoUpdateEnabled"], true);
    }

    #[test]
    fn migrate_provider_cost_to_model_costs_for_all_models() {
        let cost = json!({
            "enabled": true,
            "inputPricePerM": 1.25,
            "outputPricePerM": 6.5,
            "cacheInputPricePerM": 0.5,
            "cacheOutputPricePerM": 0.25,
            "currency": "USD"
        });

        let migrated = migrate_config(json!({
            "configVersion": 4,
            "providers": [
                {
                    "id": "provider-top-level",
                    "name": "provider-top-level",
                    "protocol": "openai",
                    "token": "secret",
                    "apiAddress": "https://example.com/v1",
                    "models": ["gpt-4.1", "gpt-4o-mini"],
                    "cost": cost
                }
            ],
            "groups": [
                {
                    "id": "group-1",
                    "name": "Group 1",
                    "routingTable": [],
                    "providers": [
                        {
                            "id": "provider-embedded",
                            "name": "provider-embedded",
                            "protocol": "openai",
                            "token": "secret",
                            "apiAddress": "https://example.com/v1",
                            "models": ["claude-sonnet-4", "claude-opus-4"],
                            "cost": {
                                "enabled": true,
                                "inputPricePerM": 3.0,
                                "outputPricePerM": 15.0,
                                "cacheInputPricePerM": 0.0,
                                "cacheOutputPricePerM": 0.0,
                                "currency": "CNY"
                            }
                        }
                    ]
                }
            ]
        }))
        .expect("migration should succeed");

        assert_eq!(
            migrated["providers"][0]["modelCosts"],
            json!({
                "gpt-4.1": {
                    "enabled": true,
                    "inputPricePerM": 1.25,
                    "outputPricePerM": 6.5,
                    "cacheInputPricePerM": 0.5,
                    "cacheOutputPricePerM": 0.25,
                    "currency": "USD"
                },
                "gpt-4o-mini": {
                    "enabled": true,
                    "inputPricePerM": 1.25,
                    "outputPricePerM": 6.5,
                    "cacheInputPricePerM": 0.5,
                    "cacheOutputPricePerM": 0.25,
                    "currency": "USD"
                }
            })
        );
        assert_eq!(
            migrated["groups"][0]["providers"][0]["modelCosts"],
            json!({
                "claude-sonnet-4": {
                    "enabled": true,
                    "inputPricePerM": 3.0,
                    "outputPricePerM": 15.0,
                    "cacheInputPricePerM": 0.0,
                    "cacheOutputPricePerM": 0.0,
                    "currency": "CNY"
                },
                "claude-opus-4": {
                    "enabled": true,
                    "inputPricePerM": 3.0,
                    "outputPricePerM": 15.0,
                    "cacheInputPricePerM": 0.0,
                    "cacheOutputPricePerM": 0.0,
                    "currency": "CNY"
                }
            })
        );
    }
}
