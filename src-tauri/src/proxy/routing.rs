//! Module Overview
//! Path and rule resolution helpers for proxy routing.
//! Normalizes entry endpoints, selects upstream protocol paths, and computes final upstream URL.

use super::ServiceState;
use crate::domain::entities::{ProxyConfig, RouteEntry};
use crate::models::{default_rule_cost_config, default_rule_quota_config, Rule, RuleProtocol};
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use url::Url;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum EntryProtocol {
    Openai,
    Anthropic,
}

#[derive(Clone, Copy, PartialEq)]
pub(super) enum EntryEndpoint {
    ChatCompletions,
    Responses,
    Messages,
}

pub(super) struct ParsedPath {
    pub group_id: String,
    pub suffix: String,
}

pub(super) struct PathEntry {
    pub protocol: EntryProtocol,
    pub endpoint: EntryEndpoint,
}

#[derive(Clone)]
pub(super) struct ActiveRoute {
    pub group_id: String,
    pub group_name: String,
    pub routing_table: Vec<RouteEntry>,
    /// The resolved Rule (provider) for this route, populated by resolve_runtime_active_route.
    pub rule: Rule,
}

#[derive(Clone)]
pub(super) enum RouteResolution {
    Ready(ActiveRoute),
    NoRoutingTable { group_name: String },
    NoDefaultRoute { group_name: String },
}

pub(super) type RouteIndex = HashMap<String, RouteResolution>;

/// Detect downstream request protocol/endpoint from `/oc/:group/*suffix`.
///
/// Compatibility rules:
/// - Supports both `/messages` and `/v1/messages` for Anthropic clients.
/// - Supports both `/chat/completions` and `/v1/chat/completions` for OpenAI chat clients.
/// - Supports both `/responses` and `/v1/responses` for OpenAI responses clients.
/// - Empty suffix defaults to chat-completions for backward compatibility with `/oc/:group`.
pub(super) fn detect_entry_protocol(suffix: &str) -> Option<PathEntry> {
    let normalized = if suffix.is_empty() || suffix == "/" {
        "/chat/completions".to_string()
    } else {
        let mut s = suffix.to_string();
        while s.ends_with('/') && s.len() > 1 {
            s.pop();
        }
        if !s.starts_with('/') {
            s = format!("/{s}");
        }
        s
    };

    match normalized.as_str() {
        "/messages" | "/v1/messages" => Some(PathEntry {
            protocol: EntryProtocol::Anthropic,
            endpoint: EntryEndpoint::Messages,
        }),
        "/chat/completions" | "/v1/chat/completions" => Some(PathEntry {
            protocol: EntryProtocol::Openai,
            endpoint: EntryEndpoint::ChatCompletions,
        }),
        "/responses" | "/v1/responses" => Some(PathEntry {
            protocol: EntryProtocol::Openai,
            endpoint: EntryEndpoint::Responses,
        }),
        _ => None,
    }
}

/// Resolve default upstream endpoint path from the active rule protocol.
///
/// Note that OpenAI paths intentionally omit `/v1` so callers can control versioning
/// via `rule.apiAddress` (for example `https://host` vs `https://host/v1`).
pub(crate) fn resolve_upstream_path(target_protocol: &RuleProtocol) -> &'static str {
    match target_protocol {
        RuleProtocol::Anthropic => "/v1/messages",
        RuleProtocol::Openai => "/responses",
        RuleProtocol::OpenaiCompletion => "/chat/completions",
    }
}

/// Build the final upstream URL from `rule.apiAddress` and protocol default path.
///
/// Behavior summary:
/// - If `apiAddress` has no path, use `default_path` directly.
/// - If `apiAddress` already includes a prefix path (for example `/v1`),
///   append default path under that prefix (`/v1` + `/responses` => `/v1/responses`).
/// - If `default_path` already starts with the prefix path, do not duplicate it.
pub(crate) fn resolve_upstream_url(
    api_address: &str,
    default_path: &str,
) -> Result<String, String> {
    let mut url = Url::parse(api_address)
        .map_err(|_| "rule.apiAddress must be a valid absolute URL".to_string())?;

    let base_path = if url.path().is_empty() || url.path() == "/" {
        String::new()
    } else {
        url.path().trim_end_matches('/').to_string()
    };

    if base_path.is_empty() {
        url.set_path(default_path);
        return Ok(url.to_string());
    }

    if default_path == base_path || default_path.starts_with(&(base_path.clone() + "/")) {
        url.set_path(default_path);
        return Ok(url.to_string());
    }

    url.set_path(&format!("{base_path}{default_path}"));
    Ok(url.to_string())
}

/// Build outbound request headers for the selected upstream protocol.
///
/// - Anthropic uses `x-api-key` + `Anthropic-version`.
/// - OpenAI surfaces use standard `Authorization: Bearer ...`.
pub(crate) fn build_rule_headers(protocol: &RuleProtocol, rule: &Rule) -> HashMap<String, String> {
    let mut headers = HashMap::new();
    headers.insert("content-type".to_string(), "application/json".to_string());
    match protocol {
        RuleProtocol::Anthropic => {
            headers.insert("x-api-key".to_string(), rule.token.clone());
            headers.insert("anthropic-version".to_string(), "2023-06-01".to_string());
        }
        RuleProtocol::Openai | RuleProtocol::OpenaiCompletion => {
            headers.insert(
                "authorization".to_string(),
                format!("Bearer {}", rule.token),
            );
        }
    }
    headers
}

/// Build final outbound request headers, optionally enabling safe passthrough.
pub(super) fn build_forward_headers(
    entry_protocol: EntryProtocol,
    target_protocol: &RuleProtocol,
    rule: &Rule,
    downstream_headers: &axum::http::HeaderMap,
    header_passthrough_enabled: bool,
) -> HashMap<String, String> {
    let mut forwarded_headers = HashMap::new();
    let allow_set = normalized_header_set(&rule.header_passthrough_allow);
    let deny_set = normalized_header_set(&rule.header_passthrough_deny);
    let mut passthrough_anthropic_version = None;

    if header_passthrough_enabled {
        for (name, value) in downstream_headers {
            let normalized_name = normalize_header_name(name.as_str());
            if normalized_name.is_empty() || deny_set.contains(&normalized_name) {
                continue;
            }

            let normalized_value = match value.to_str() {
                Ok(raw) => raw.trim(),
                Err(_) => continue,
            };
            if normalized_value.is_empty() {
                continue;
            }

            if normalized_name == "anthropic-version" {
                if should_passthrough_anthropic_version(
                    entry_protocol,
                    target_protocol,
                    &allow_set,
                    normalized_value,
                ) {
                    passthrough_anthropic_version = Some(normalized_value.to_string());
                }
                continue;
            }

            if is_hard_blocked_passthrough_header(&normalized_name) {
                continue;
            }

            forwarded_headers.insert(normalized_name, normalized_value.to_string());
        }
    }

    let mut rule_headers = build_rule_headers(target_protocol, rule);
    if let Some(version) = passthrough_anthropic_version {
        rule_headers.insert("anthropic-version".to_string(), version);
    }
    forwarded_headers.extend(rule_headers);
    forwarded_headers
}

fn normalize_header_name(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn normalized_header_set(values: &[String]) -> std::collections::HashSet<String> {
    values
        .iter()
        .map(|value| normalize_header_name(value))
        .filter(|value| !value.is_empty())
        .collect()
}

fn is_hard_blocked_passthrough_header(name: &str) -> bool {
    matches!(
        name,
        "accept"
            | "accept-encoding"
            | "anthropic-beta"
            | "anthropic-dangerous-direct-browser-access"
            | "api-key"
            | "authorization"
            | "connection"
            | "content-encoding"
            | "content-length"
            | "cookie"
            | "forwarded"
            | "host"
            | "keep-alive"
            | "openai-organization"
            | "openai-project"
            | "origin"
            | "proxy-authorization"
            | "proxy-connection"
            | "referer"
            | "set-cookie"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
            | "via"
            | "x-api-key"
            | "x-real-ip"
    ) || name.starts_with("cf-")
        || name.starts_with("sec-")
        || name.starts_with("x-forwarded-")
}

fn should_passthrough_anthropic_version(
    entry_protocol: EntryProtocol,
    target_protocol: &RuleProtocol,
    allow_set: &std::collections::HashSet<String>,
    value: &str,
) -> bool {
    entry_protocol == EntryProtocol::Anthropic
        && *target_protocol == RuleProtocol::Anthropic
        && allow_set.contains("anthropic-version")
        && is_valid_anthropic_version(value)
}

fn is_valid_anthropic_version(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| matches!(index, 4 | 7) || byte.is_ascii_digit())
}

/// Refresh in-memory route index when config revision changes.
///
/// This keeps hot-path routing lock-free from full config traversal while still
/// reacting to runtime config updates.
pub(super) fn refresh_route_index_if_needed(state: &ServiceState) -> Result<(), String> {
    let observed_revision = state.config_revision.load(Ordering::Acquire);
    let cached_revision = state.route_index_revision.load(Ordering::Acquire);
    if observed_revision == cached_revision {
        return Ok(());
    }

    let next_index = state
        .config
        .read()
        .map_err(|_| "config lock poisoned".to_string())
        .map(|cfg| build_route_index(&cfg))?;

    let mut guard = state
        .route_index
        .write()
        .map_err(|_| "route index lock poisoned".to_string())?;
    *guard = next_index;
    state
        .route_index_revision
        .store(observed_revision, Ordering::Release);

    Ok(())
}

/// Resolve the runtime active route by looking up the request model in the routing table.
///
/// Returns the resolved ActiveRoute (with the matched RouteEntry isolated) and a reference
/// to the selected Rule (provider).
pub(super) fn resolve_runtime_active_route<'a>(
    state: &ServiceState,
    route: &'a ActiveRoute,
    request_model: &str,
) -> Result<ActiveRoute, String> {
    // 1. Find all routes where the incoming model contains the route's request_model (fuzzy match)
    let matches: Vec<&RouteEntry> = route
        .routing_table
        .iter()
        .filter(|e| request_model.contains(&e.request_model))
        .collect();

    // 2. If matches exist, pick the longest request_model (most specific match)
    let entry: &RouteEntry = if matches.is_empty() {
        // No fuzzy match — fall back to "default"
        route
            .routing_table
            .iter()
            .find(|e| e.request_model == "default")
            .ok_or("No default route found in routing table")?
    } else {
        // Pick the match with the longest request_model
        matches
            .into_iter()
            .max_by_key(|e| e.request_model.len())
            .unwrap()
    };

    // 2. Look up the provider by provider_id
    let config = state.config.read().map_err(|_| "config lock poisoned")?;
    let provider = config
        .providers
        .iter()
        .find(|p| p.id == entry.provider_id)
        .ok_or_else(|| format!("Provider {} not found", entry.provider_id))?
        .clone();

    // 3. Return resolved route with the matched entry isolated
    let mut resolved = route.clone();
    resolved.routing_table = vec![entry.clone()];
    resolved.rule = provider;
    Ok(resolved)
}

/// Build a fast lookup table `group_id -> active route resolution`.
///
/// The index carries three states so request handling can distinguish:
/// - group exists with routing table and a "default" entry (ready),
/// - group exists but routing table is empty,
/// - group exists but routing table has no "default" entry.
pub(super) fn build_route_index(config: &ProxyConfig) -> RouteIndex {
    let mut index = HashMap::with_capacity(config.groups.len());
    for group in &config.groups {
        if group.routing_table.is_empty() {
            index.insert(
                group.id.clone(),
                RouteResolution::NoRoutingTable {
                    group_name: group.name.clone(),
                },
            );
            continue;
        }
        let has_default = group
            .routing_table
            .iter()
            .any(|e| e.request_model == "default");
        if !has_default {
            index.insert(
                group.id.clone(),
                RouteResolution::NoDefaultRoute {
                    group_name: group.name.clone(),
                },
            );
            continue;
        }
        let resolution = RouteResolution::Ready(ActiveRoute {
            group_id: group.id.clone(),
            group_name: group.name.clone(),
            routing_table: group.routing_table.clone(),
            rule: Rule {
                id: String::new(),
                name: String::new(),
                protocol: RuleProtocol::Anthropic,
                token: String::new(),
                api_address: String::new(),
                website: String::new(),
                models: Vec::new(),
                default_model: None,
                model_mappings: None,
                header_passthrough_allow: Vec::new(),
                header_passthrough_deny: Vec::new(),
                quota: default_rule_quota_config(),
                cost: default_rule_cost_config(),
                model_costs: HashMap::new(),
            },
        });
        index.insert(group.id.clone(), resolution);
    }
    index
}

/// Validate required active-rule fields before forwarding traffic.
pub(super) fn assert_rule_ready(rule: &Rule) -> Result<(), (u16, String)> {
    if rule.name.trim().is_empty() {
        return Err((409, "Active rule name is empty".into()));
    }
    if rule.api_address.trim().is_empty() {
        return Err((409, "Active rule apiAddress is empty".into()));
    }
    Ok(())
}

/// Resolve target model from a route entry.
pub(super) fn resolve_target_model(entry: &RouteEntry) -> String {
    entry.target_model.clone()
}
