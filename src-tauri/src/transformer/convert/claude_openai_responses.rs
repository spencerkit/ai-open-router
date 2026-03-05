//! Claude Messages to OpenAI Responses conversion

use crate::transformer::types::*;
use super::common::*;
use serde_json::{json, Value};

pub fn claude_req_to_openai_responses(claude_req: &[u8], model: &str) -> Result<Vec<u8>, String> {
    let req: ClaudeRequest = serde_json::from_slice(claude_req)
        .map_err(|e| format!("parse: {}", e))?;

    let mut openai_req = json!({
        "model": model,
        "stream": req.stream
    });

    if let Some(system) = &req.system {
        openai_req["instructions"] = json!(extract_system_text(system));
    }

    let mut input = Vec::new();
    for msg in &req.messages {
        let mut item = json!({"type": "message", "role": msg.role});

        let mut content_parts = Vec::new();
        match &msg.content {
            Value::String(s) => {
                content_parts.push(json!({"type": "input_text", "text": s}));
            }
            Value::Array(blocks) => {
                for block in blocks {
                    if let Some(block_type) = block.get("type").and_then(|t| t.as_str()) {
                        match block_type {
                            "text" => {
                                if let Some(text) = block.get("text") {
                                    content_parts.push(json!({"type": "input_text", "text": text}));
                                }
                            }
                            "tool_result" => {
                                if let Some(call_id) = block.get("tool_use_id") {
                                    let content = extract_tool_result_content(
                                        block.get("content").unwrap_or(&Value::Null)
                                    );
                                    content_parts.push(json!({
                                        "type": "function_call_output",
                                        "call_id": call_id,
                                        "output": content
                                    }));
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            _ => {}
        }
        item["content"] = json!(content_parts);
        input.push(item);
    }
    openai_req["input"] = json!(input);

    if let Some(tools) = &req.tools {
        let openai_tools: Vec<Value> = tools.iter().map(|t| {
            json!({
                "type": "function",
                "name": t.name,
                "description": t.description,
                "parameters": t.input_schema
            })
        }).collect();
        openai_req["tools"] = json!(openai_tools);
    }

    serde_json::to_vec(&openai_req).map_err(|e| format!("serialize: {}", e))
}

pub fn openai_responses_to_claude(openai_resp: &[u8]) -> Result<Vec<u8>, String> {
    let resp: Value = serde_json::from_slice(openai_resp)
        .map_err(|e| format!("parse: {}", e))?;

    let mut content = Vec::new();
    let mut stop_reason = "end_turn";

    if let Some(output) = resp.get("output").and_then(|o| o.as_array()) {
        for item in output {
            match item.get("type").and_then(|t| t.as_str()) {
                Some("message") => {
                    if let Some(parts) = item.get("content").and_then(|c| c.as_array()) {
                        for part in parts {
                            if part.get("type").and_then(|t| t.as_str()) == Some("output_text") {
                                if let Some(text) = part.get("text") {
                                    content.push(json!({"type": "text", "text": text}));
                                }
                            }
                        }
                    }
                }
                Some("function_call") => {
                    if let Some(call_id) = item.get("call_id") {
                        if let Some(name) = item.get("name") {
                            let args_str = item.get("arguments")
                                .and_then(|a| a.as_str())
                                .unwrap_or("{}");
                            let input: Value = serde_json::from_str(args_str).unwrap_or(json!({}));
                            content.push(json!({
                                "type": "tool_use",
                                "id": call_id,
                                "name": name,
                                "input": input
                            }));
                            stop_reason = "tool_use";
                        }
                    }
                }
                _ => {}
            }
        }
    }

    let claude_resp = json!({
        "id": resp.get("id").unwrap_or(&json!("resp-id")),
        "type": "message",
        "role": "assistant",
        "content": content,
        "stop_reason": stop_reason,
        "usage": {
            "input_tokens": resp.get("usage").and_then(|u| u.get("input_tokens")).unwrap_or(&json!(0)),
            "output_tokens": resp.get("usage").and_then(|u| u.get("output_tokens")).unwrap_or(&json!(0))
        }
    });

    serde_json::to_vec(&claude_resp).map_err(|e| format!("serialize: {}", e))
}
