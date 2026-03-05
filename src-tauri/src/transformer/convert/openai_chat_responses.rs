//! OpenAI Chat Completions to OpenAI Responses conversion

use serde_json::{json, Value};

pub fn openai_chat_to_responses(chat_req: &[u8], model: &str) -> Result<Vec<u8>, String> {
    let req: Value = serde_json::from_slice(chat_req)
        .map_err(|e| format!("parse: {}", e))?;

    let mut input = Vec::new();
    if let Some(messages) = req.get("messages").and_then(|m| m.as_array()) {
        for msg in messages {
            let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("user");
            let mut item = json!({"type": "message", "role": role});

            let mut content_parts = Vec::new();
            if let Some(content) = msg.get("content") {
                if let Some(text) = content.as_str() {
                    content_parts.push(json!({"type": "input_text", "text": text}));
                }
            }
            item["content"] = json!(content_parts);
            input.push(item);
        }
    }

    let resp_req = json!({
        "model": model,
        "input": input,
        "stream": req.get("stream").unwrap_or(&json!(false))
    });

    serde_json::to_vec(&resp_req).map_err(|e| format!("serialize: {}", e))
}

pub fn openai_responses_to_chat(resp: &[u8]) -> Result<Vec<u8>, String> {
    let resp: Value = serde_json::from_slice(resp)
        .map_err(|e| format!("parse: {}", e))?;

    let mut text = String::new();
    if let Some(output) = resp.get("output").and_then(|o| o.as_array()) {
        for item in output {
            if item.get("type").and_then(|t| t.as_str()) == Some("message") {
                if let Some(parts) = item.get("content").and_then(|c| c.as_array()) {
                    for part in parts {
                        if part.get("type").and_then(|t| t.as_str()) == Some("output_text") {
                            if let Some(t) = part.get("text").and_then(|t| t.as_str()) {
                                text.push_str(t);
                            }
                        }
                    }
                }
            }
        }
    }

    let chat_resp = json!({
        "id": resp.get("id").unwrap_or(&json!("chatcmpl-id")),
        "object": "chat.completion",
        "created": 1234567890,
        "model": resp.get("model").unwrap_or(&json!("gpt-4")),
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": text
            },
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": resp.get("usage").and_then(|u| u.get("input_tokens")).unwrap_or(&json!(0)),
            "completion_tokens": resp.get("usage").and_then(|u| u.get("output_tokens")).unwrap_or(&json!(0)),
            "total_tokens": 0
        }
    });

    serde_json::to_vec(&chat_resp).map_err(|e| format!("serialize: {}", e))
}
