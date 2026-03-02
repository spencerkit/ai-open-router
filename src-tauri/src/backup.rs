use chrono::Utc;

use crate::models::{Group, GroupsBackupPayload};

pub fn create_groups_backup_payload(groups: &[Group]) -> GroupsBackupPayload {
    GroupsBackupPayload {
        format: "ai-open-router-groups-backup".to_string(),
        version: 1,
        exported_at: Utc::now().to_rfc3339(),
        groups: groups.to_vec(),
    }
}

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

pub fn backup_default_file_name() -> String {
    let now = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    format!("ai-open-router-groups-backup-{now}.json")
}
