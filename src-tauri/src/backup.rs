//! Module Overview
//! Group backup/import payload helpers and compatibility handling.
//! Builds export envelopes and reads historical payload shapes for import.

use chrono::Utc;

use crate::models::{Group, GroupsBackupPayload, Rule};

/// Creates groups backup payload for this module's workflow.
pub fn create_groups_backup_payload(groups: &[Group], providers: &[Rule]) -> GroupsBackupPayload {
    GroupsBackupPayload {
        format: "ai-open-router-groups-backup".to_string(),
        version: 1,
        exported_at: Utc::now().to_rfc3339(),
        groups: groups.to_vec(),
        providers: providers.to_vec(),
    }
}

/// Extracts groups from import payload for this module's workflow.
pub fn extract_groups_from_import_payload(input: &serde_json::Value) -> Result<Vec<Group>, String> {
    if let Some(arr) = input.as_array() {
        return serde_json::from_value::<Vec<Group>>(serde_json::Value::Array(arr.clone()))
            .map_err(|e| format!("Invalid groups array: {e}"));
    }

    if let Some(groups) = input.get("groups") {
        return serde_json::from_value::<Vec<Group>>(groups.clone())
            .map_err(|e| format!("Invalid groups field: {e}"));
    }

    if let Some(config) = input.get("config") {
        if let Some(groups) = config.get("groups") {
            return serde_json::from_value::<Vec<Group>>(groups.clone())
                .map_err(|e| format!("Invalid config.groups field: {e}"));
        }
    }

    Err("Invalid import JSON: expected a groups array".to_string())
}

/// Extracts groups and providers from import payload.
/// Returns (groups, providers) tuple where providers may be empty for legacy payloads.
pub fn extract_groups_and_providers_from_import_payload(
    input: &serde_json::Value,
) -> Result<(Vec<Group>, Vec<Rule>), String> {
    // Try to extract providers first
    let providers = if let Some(providers_val) = input.get("providers") {
        serde_json::from_value::<Vec<Rule>>(providers_val.clone())
            .map_err(|e| format!("Invalid providers field: {e}"))?
    } else if let Some(config) = input.get("config") {
        if let Some(providers_val) = config.get("providers") {
            serde_json::from_value::<Vec<Rule>>(providers_val.clone())
                .map_err(|e| format!("Invalid config.providers field: {e}"))?
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };

    // Extract groups
    let groups = if let Some(arr) = input.as_array() {
        serde_json::from_value::<Vec<Group>>(serde_json::Value::Array(arr.clone()))
            .map_err(|e| format!("Invalid groups array: {e}"))?
    } else if let Some(groups_val) = input.get("groups") {
        serde_json::from_value::<Vec<Group>>(groups_val.clone())
            .map_err(|e| format!("Invalid groups field: {e}"))?
    } else if let Some(config) = input.get("config") {
        if let Some(groups_val) = config.get("groups") {
            serde_json::from_value::<Vec<Group>>(groups_val.clone())
                .map_err(|e| format!("Invalid config.groups field: {e}"))?
        } else {
            return Err("Invalid import JSON: expected a groups array".to_string());
        }
    } else {
        return Err("Invalid import JSON: expected a groups array".to_string());
    };

    Ok((groups, providers))
}

/// Performs backup default file name.
pub fn backup_default_file_name() -> String {
    let now = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    format!("ai-open-router-groups-backup-{now}.json")
}

#[cfg(test)]
mod tests {
    use super::{
        backup_default_file_name, create_groups_backup_payload,
        extract_groups_and_providers_from_import_payload, extract_groups_from_import_payload,
    };
    use crate::models::{
        default_rule_cost_config, default_rule_quota_config, Group, Rule, RuleProtocol,
    };
    use chrono::DateTime;
    use serde_json::json;
    use std::collections::HashMap;

    /// Performs sample group.
    fn sample_group(id: &str, name: &str) -> Group {
        Group {
            id: id.to_string(),
            name: name.to_string(),
            routing_table: Vec::new(),
            models: Some(vec![]),
            provider_ids: Some(vec!["r1".to_string()]),
            active_provider_id: None,
            providers: Some(vec![Rule {
                id: "r1".to_string(),
                name: "rule-1".to_string(),
                protocol: RuleProtocol::Anthropic,
                token: "t1".to_string(),
                api_address: "https://api.example.com".to_string(),
                website: String::new(),
                models: Vec::new(),
                default_model: Some("claude-3-7-sonnet".to_string()),
                model_mappings: Some(HashMap::new()),
                header_passthrough_allow: Vec::new(),
                header_passthrough_deny: Vec::new(),
                quota: default_rule_quota_config(),
                cost: default_rule_cost_config(),
            }]),
            failover: Some(crate::models::default_group_failover_config()),
        }
    }

    fn sample_provider(id: &str, name: &str) -> Rule {
        Rule {
            id: id.to_string(),
            name: name.to_string(),
            protocol: RuleProtocol::Openai,
            token: "test-token".to_string(),
            api_address: "https://api.openai.com".to_string(),
            website: String::new(),
            models: vec!["gpt-4o".to_string()],
            default_model: Some("gpt-4o".to_string()),
            model_mappings: Some(HashMap::new()),
            header_passthrough_allow: Vec::new(),
            header_passthrough_deny: Vec::new(),
            quota: default_rule_quota_config(),
            cost: default_rule_cost_config(),
        }
    }

    #[test]
    /// Creates groups backup payload keeps groups and metadata for this module's workflow.
    fn create_groups_backup_payload_keeps_groups_and_metadata() {
        let groups = vec![sample_group("demo", "Demo")];
        let providers = vec![sample_provider("p1", "Provider 1")];
        let payload = create_groups_backup_payload(&groups, &providers);

        assert_eq!(payload.format, "ai-open-router-groups-backup");
        assert_eq!(payload.version, 1);
        assert_eq!(payload.groups.len(), groups.len());
        assert_eq!(payload.groups[0].id, groups[0].id);
        assert_eq!(payload.groups[0].name, groups[0].name);
        assert_eq!(payload.providers.len(), providers.len());
        assert_eq!(payload.providers[0].id, "p1");
        assert!(DateTime::parse_from_rfc3339(&payload.exported_at).is_ok());
    }

    #[test]
    /// Creates groups backup payload works with empty providers for this module's workflow.
    fn create_groups_backup_payload_works_with_empty_providers() {
        let groups = vec![sample_group("demo", "Demo")];
        let payload = create_groups_backup_payload(&groups, &[]);

        assert_eq!(payload.groups.len(), 1);
        assert_eq!(payload.providers.len(), 0);
    }

    #[test]
    /// Extracts groups from import payload supports root groups object for this module's workflow.
    fn extract_groups_from_import_payload_supports_root_groups_object() {
        let out = extract_groups_from_import_payload(&json!({
            "groups": [
                {
                    "id": "g1",
                    "name": "Group 1",
                    "models": [],
                    "activeProviderId": null,
                    "providers": []
                }
            ]
        }))
        .expect("payload should parse");
        assert_eq!(out[0].id, "g1");
    }

    #[test]
    /// Extracts groups from import payload supports groups array root for this module's workflow.
    fn extract_groups_from_import_payload_supports_groups_array_root() {
        let out = extract_groups_from_import_payload(&json!([
            {
                "id": "g2",
                "name": "Group 2",
                "models": [],
                "activeProviderId": null,
                "providers": []
            }
        ]))
        .expect("payload should parse");
        assert_eq!(out[0].id, "g2");
    }

    #[test]
    /// Extracts groups from import payload supports full config envelope for this module's workflow.
    fn extract_groups_from_import_payload_supports_full_config_envelope() {
        let out = extract_groups_from_import_payload(&json!({
            "config": {
                "groups": [
                    {
                        "id": "g3",
                        "name": "Group 3",
                        "models": [],
                        "activeProviderId": null,
                        "providers": []
                    }
                ]
            }
        }))
        .expect("payload should parse");
        assert_eq!(out[0].id, "g3");
    }

    #[test]
    /// Extracts groups from import payload supports legacy fields for this module's workflow.
    fn extract_groups_from_import_payload_supports_legacy_fields() {
        let out = extract_groups_from_import_payload(&json!({
            "groups": [
                {
                    "id": "legacy",
                    "name": "Legacy Group",
                    "models": [],
                    "activeRuleId": null,
                    "rules": []
                }
            ]
        }))
        .expect("legacy payload should parse");
        assert_eq!(out[0].id, "legacy");
    }

    #[test]
    /// Extracts groups from import payload rejects invalid payload for this module's workflow.
    fn extract_groups_from_import_payload_rejects_invalid_payload() {
        let err =
            extract_groups_from_import_payload(&json!({ "invalid": true })).expect_err("must fail");
        assert!(err.contains("expected a groups array"));
    }

    #[test]
    /// Extracts groups and providers from import payload for this module's workflow.
    fn extract_groups_and_providers_from_import_payload_works() {
        let (groups, providers) = extract_groups_and_providers_from_import_payload(&json!({
            "groups": [
                {
                    "id": "g1",
                    "name": "Group 1",
                    "models": [],
                    "activeProviderId": null,
                    "providers": []
                }
            ],
            "providers": [
                {
                    "id": "p1",
                    "name": "Provider 1",
                    "protocol": "openai",
                    "token": "test",
                    "apiAddress": "https://api.example.com",
                    "models": ["gpt-4o"]
                }
            ]
        }))
        .expect("payload should parse");
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].id, "g1");
        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].id, "p1");
    }

    #[test]
    /// Extracts groups and providers handles legacy payload without providers.
    fn extract_groups_and_providers_handles_legacy_payload() {
        let (groups, providers) = extract_groups_and_providers_from_import_payload(&json!({
            "groups": [
                {
                    "id": "g1",
                    "name": "Group 1",
                    "models": [],
                    "activeProviderId": null,
                    "providers": []
                }
            ]
        }))
        .expect("payload should parse");
        assert_eq!(groups.len(), 1);
        assert_eq!(providers.len(), 0);
    }

    #[test]
    /// Performs backup default file name has expected shape.
    fn backup_default_file_name_has_expected_shape() {
        let file_name = backup_default_file_name();
        assert!(file_name.starts_with("ai-open-router-groups-backup-"));
        assert!(file_name.ends_with(".json"));
    }
}
