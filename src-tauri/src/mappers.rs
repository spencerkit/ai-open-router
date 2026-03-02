use serde_json::{json, Value};

fn as_array<'a>(v: &'a Value, key: &str) -> Vec<&'a Value> {
    v.get(key)
        .and_then(|x| x.as_array())
        .map(|x| x.iter().collect())
        .unwrap_or_default()
}

fn str_or_empty(v: Option<&Value>) -> String {
    v.and_then(|x| x.as_str()).unwrap_or_default().to_string()
}

fn to_text_content(content: &Value) -> Vec<Value> {
    if let Some(arr) = content.as_array() {
        let mut out = vec![];
        for item in arr {
            if let Some(s) = item.as_str() {
                if !s.is_empty() {
                    out.push(json!({"type": "text", "text": s}));
                }
                continue;
            }
            if let Some(obj) = item.as_object() {
                if obj.get("type").and_then(|v| v.as_str()) == Some("text") {
                    out.push(item.clone());
                    continue;
                }
                if let Some(text) = obj.get("text").and_then(|v| v.as_str()) {
                    out.push(json!({"type": "text", "text": text}));
                    continue;
                }
                out.push(json!({"type": "text", "text": item.to_string()}));
                continue;
            }
            out.push(json!({"type": "text", "text": item.to_string()}));
        }
        return out;
    }

    if let Some(s) = content.as_str() {
        return vec![json!({"type": "text", "text": s})];
    }

    if content.is_null() {
        return vec![];
    }

    vec![json!({"type": "text", "text": content.to_string()})]
}

fn to_tool_result_content(content: &Value) -> String {
    if let Some(s) = content.as_str() {
        return s.to_string();
    }
    if let Some(arr) = content.as_array() {
        let joined = arr
            .iter()
            .filter_map(|item| {
                let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or_default();
                if item_type == "text" || item_type == "input_text" || item_type == "output_text" {
                    return item
                        .get("text")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                }
                None
            })
            .collect::<Vec<_>>()
            .join("");
        if !joined.is_empty() {
            return joined;
        }
    }
    content.to_string()
}

fn input_item_to_text(value: &Value) -> String {
    if value.is_null() {
        return String::new();
    }
    if let Some(s) = value.as_str() {
        return s.to_string();
    }
    if let Some(arr) = value.as_array() {
        let mut chunks: Vec<String> = vec![];
        for part in arr {
            if let Some(s) = part.as_str() {
                chunks.push(s.to_string());
                continue;
            }
            if let Some(obj) = part.as_object() {
                if let Some(text) = obj.get("text").and_then(|v| v.as_str()) {
                    chunks.push(text.to_string());
                    continue;
                }
                if let Some(text) = obj.get("output_text").and_then(|v| v.as_str()) {
                    chunks.push(text.to_string());
                    continue;
                }
                if let Some(text) = obj.get("input_text").and_then(|v| v.as_str()) {
                    chunks.push(text.to_string());
                    continue;
                }
            }
            chunks.push(part.to_string());
        }
        if !chunks.is_empty() {
            return chunks.join("");
        }
    }
    value.to_string()
}

fn input_item_function_arguments(value: Option<&Value>) -> String {
    match value {
        Some(v) if v.is_string() => v.as_str().unwrap_or_default().to_string(),
        Some(v) => serde_json::to_string(v).unwrap_or_else(|_| "{}".to_string()),
        None => "{}".to_string(),
    }
}

fn push_responses_input_item_as_message(messages: &mut Vec<Value>, item: &Value) {
    if item.is_null() {
        return;
    }

    let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or_default();

    if item_type == "function_call" {
        messages.push(json!({
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": item
                        .get("call_id")
                        .or_else(|| item.get("id"))
                        .cloned()
                        .unwrap_or_else(|| json!("call_generated")),
                    "type": "function",
                    "function": {
                        "name": item
                            .get("name")
                            .or_else(|| item.get("function").and_then(|f| f.get("name")))
                            .and_then(|v| v.as_str())
                            .unwrap_or("tool"),
                        "arguments": input_item_function_arguments(
                            item.get("arguments").or_else(|| item.get("function").and_then(|f| f.get("arguments")))
                        ),
                    },
                }
            ],
        }));
        return;
    }

    if item_type == "function_call_output" {
        messages.push(json!({
            "role": "tool",
            "tool_call_id": item
                .get("call_id")
                .or_else(|| item.get("id"))
                .cloned()
                .unwrap_or_else(|| json!("call_generated")),
            "content": input_item_to_text(item.get("output").or_else(|| item.get("content")).unwrap_or(&Value::Null)),
        }));
        return;
    }

    let role = item
        .get("role")
        .and_then(|v| v.as_str())
        .or_else(|| if item_type == "message" { Some("user") } else { None });

    if let Some(role_value) = role {
        messages.push(json!({
            "role": role_value,
            "content": item.get("content").cloned().unwrap_or_else(|| json!("")),
        }));
        return;
    }

    if item_type == "input_text" {
        if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
            messages.push(json!({ "role": "user", "content": text }));
        }
    }
}

pub fn normalize_openai_request(path: &str, body: &Value) -> Value {
    if path != "/v1/responses" {
        return body.clone();
    }

    let mut messages: Vec<Value> = vec![];
    let input = body.get("input").unwrap_or(&Value::Null);

    if let Some(s) = input.as_str() {
        messages.push(json!({ "role": "user", "content": s }));
    } else if let Some(arr) = input.as_array() {
        for item in arr {
            push_responses_input_item_as_message(&mut messages, item);
        }
    } else if input.is_object() {
        push_responses_input_item_as_message(&mut messages, input);
    }

    json!({
        "model": body.get("model").cloned().unwrap_or(Value::Null),
        "messages": messages,
        "stream": body.get("stream").cloned().unwrap_or(Value::Null),
        "max_tokens": body
            .get("max_tokens")
            .or_else(|| body.get("max_output_tokens"))
            .cloned()
            .unwrap_or(Value::Null),
        "temperature": body.get("temperature").cloned().unwrap_or(Value::Null),
        "top_p": body.get("top_p").cloned().unwrap_or(Value::Null),
        "tools": body.get("tools").cloned().unwrap_or(Value::Null),
        "tool_choice": body.get("tool_choice").cloned().unwrap_or(Value::Null),
        "metadata": body.get("metadata").cloned().unwrap_or(Value::Null),
        "stop": body.get("stop").cloned().unwrap_or(Value::Null),
        "system": body
            .get("system")
            .or_else(|| body.get("instructions"))
            .cloned()
            .unwrap_or(Value::Null),
        "thinking": body.get("thinking").cloned().unwrap_or(Value::Null),
        "context_management": body.get("context_management").cloned().unwrap_or(Value::Null),
    })
}

pub fn map_openai_to_anthropic_request(
    body: &Value,
    strict_mode: bool,
    target_model: &str,
) -> Result<Value, String> {
    if strict_mode {
        let supported = [
            "model",
            "messages",
            "stream",
            "max_tokens",
            "max_output_tokens",
            "temperature",
            "top_p",
            "tools",
            "tool_choice",
            "parallel_tool_calls",
            "metadata",
            "stop",
            "input",
            "instructions",
            "reasoning",
            "truncation",
            "previous_response_id",
            "system",
            "thinking",
            "context_management",
        ];
        if let Some(obj) = body.as_object() {
            let unknown = obj
                .keys()
                .filter(|k| !supported.contains(&k.as_str()))
                .cloned()
                .collect::<Vec<_>>();
            if !unknown.is_empty() {
                return Err(format!(
                    "Unsupported OpenAI fields in strict mode: {}",
                    unknown.join(", ")
                ));
            }
        }
    }

    let mut system_chunks: Vec<String> = vec![];
    let mut messages: Vec<Value> = vec![];
    for msg in as_array(body, "messages") {
        let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or_default();
        if role == "system" {
            if let Some(s) = msg.get("content").and_then(|v| v.as_str()) {
                system_chunks.push(s.to_string());
            }
            continue;
        }

        if role == "assistant" {
            let mut content = vec![];
            if let Some(content_value) = msg.get("content") {
                let should_keep = match content_value {
                    Value::Null => false,
                    Value::String(s) => !s.is_empty(),
                    _ => true,
                };
                if should_keep {
                    content.extend(to_text_content(content_value));
                }
            }
            if let Some(tool_calls) = msg.get("tool_calls").and_then(|v| v.as_array()) {
                for call in tool_calls {
                    let input = call
                        .get("function")
                        .and_then(|f| f.get("arguments"))
                        .and_then(|v| v.as_str())
                        .and_then(|s| serde_json::from_str::<Value>(s).ok())
                        .unwrap_or_else(|| {
                            json!({"raw": str_or_empty(call.get("function").and_then(|f| f.get("arguments")))})
                        });
                    content.push(json!({
                        "type": "tool_use",
                        "id": str_or_empty(call.get("id")),
                        "name": str_or_empty(call.get("function").and_then(|f| f.get("name"))),
                        "input": input,
                    }));
                }
            }
            messages.push(json!({"role": "assistant", "content": content}));
            continue;
        }

        if role == "tool" {
            let tool_use_id = msg
                .get("tool_call_id")
                .and_then(|v| v.as_str())
                .unwrap_or("toolu_generated");
            messages.push(json!({
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": to_tool_result_content(msg.get("content").unwrap_or(&Value::Null)),
                    }
                ],
            }));
            continue;
        }

        messages.push(json!({
            "role": role,
            "content": to_text_content(msg.get("content").unwrap_or(&Value::Null)),
        }));
    }

    let mut req = json!({
        "model": if target_model.is_empty() { str_or_empty(body.get("model")) } else { target_model.to_string() },
        "max_tokens": body.get("max_tokens").or_else(|| body.get("max_output_tokens")).cloned().unwrap_or(json!(1024)),
        "temperature": body.get("temperature").cloned().unwrap_or(Value::Null),
        "top_p": body.get("top_p").cloned().unwrap_or(Value::Null),
        "stop_sequences": body.get("stop").cloned().unwrap_or(Value::Null),
        "stream": body.get("stream").and_then(|v| v.as_bool()).unwrap_or(false),
        "messages": messages,
    });

    if let Some(system) = body.get("system") {
        req["system"] = system.clone();
    } else if !system_chunks.is_empty() {
        req["system"] = json!(system_chunks.join("\n\n"));
    }

    if let Some(thinking) = body.get("thinking") {
        req["thinking"] = thinking.clone();
    }

    if let Some(context_management) = body.get("context_management") {
        req["context_management"] = context_management.clone();
    }

    if let Some(tools) = body.get("tools").and_then(|v| v.as_array()) {
        req["tools"] = json!(tools
            .iter()
            .map(|tool| {
                json!({
                    "name": tool.get("function").and_then(|f| f.get("name")).or_else(|| tool.get("name")).cloned().unwrap_or(json!("")),
                    "description": tool.get("function").and_then(|f| f.get("description")).or_else(|| tool.get("description")).cloned().unwrap_or(Value::Null),
                    "input_schema": tool.get("function").and_then(|f| f.get("parameters")).or_else(|| tool.get("parameters")).or_else(|| tool.get("input_schema")).cloned().unwrap_or(json!({"type": "object", "properties": {}})),
                })
            })
            .collect::<Vec<_>>());
    }

    if let Some(tool_choice) = body.get("tool_choice") {
        if tool_choice.is_string() {
            req["tool_choice"] = json!({"type": tool_choice.as_str().unwrap_or("auto")});
        } else if tool_choice.is_object() {
            req["tool_choice"] = json!({
                "type": tool_choice.get("type").and_then(|v| v.as_str()).unwrap_or("auto"),
                "name": tool_choice
                    .get("function")
                    .and_then(|f| f.get("name"))
                    .or_else(|| tool_choice.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
            });
        }
    }

    Ok(req)
}

fn flatten_anthropic_text(content: &Value) -> String {
    if let Some(s) = content.as_str() {
        return s.to_string();
    }
    if let Some(arr) = content.as_array() {
        return arr
            .iter()
            .filter_map(|block| {
                if block.get("type").and_then(|v| v.as_str()) == Some("text") {
                    return block.get("text").and_then(|v| v.as_str()).map(|s| s.to_string());
                }
                None
            })
            .collect::<Vec<_>>()
            .join("");
    }
    String::new()
}

pub fn map_anthropic_to_openai_request(
    body: &Value,
    strict_mode: bool,
    target_model: &str,
) -> Result<Value, String> {
    if strict_mode {
        let supported = [
            "model",
            "messages",
            "max_tokens",
            "system",
            "temperature",
            "top_p",
            "stream",
            "tools",
            "tool_choice",
            "stop_sequences",
            "metadata",
            "thinking",
            "context_management",
        ];
        if let Some(obj) = body.as_object() {
            let unknown = obj
                .keys()
                .filter(|k| !supported.contains(&k.as_str()))
                .cloned()
                .collect::<Vec<_>>();
            if !unknown.is_empty() {
                return Err(format!(
                    "Unsupported Claude fields in strict mode: {}",
                    unknown.join(", ")
                ));
            }
        }
    }

    let mut messages: Vec<Value> = vec![];
    if let Some(system) = body.get("system") {
        messages.push(json!({"role": "system", "content": system.clone()}));
    }

    if let Some(in_messages) = body.get("messages").and_then(|v| v.as_array()) {
        for msg in in_messages {
            let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or_default();
            let content = msg.get("content").cloned().unwrap_or(Value::Null);

            if role == "assistant" {
                let text = flatten_anthropic_text(&content);
                let mut assistant_msg = json!({"role": "assistant", "content": text});
                if let Some(arr) = content.as_array() {
                    let tool_calls = arr
                        .iter()
                        .filter(|block| block.get("type").and_then(|v| v.as_str()) == Some("tool_use"))
                        .map(|block| {
                            json!({
                                "id": block.get("id").cloned().unwrap_or(json!("tool_generated")),
                                "type": "function",
                                "function": {
                                    "name": block.get("name").cloned().unwrap_or(json!("tool")),
                                    "arguments": serde_json::to_string(block.get("input").unwrap_or(&json!({}))).unwrap_or_else(|_| "{}".to_string()),
                                }
                            })
                        })
                        .collect::<Vec<_>>();
                    if !tool_calls.is_empty() {
                        assistant_msg["tool_calls"] = json!(tool_calls);
                    }
                }
                messages.push(assistant_msg);
                continue;
            }

            if role == "user" {
                if let Some(arr) = content.as_array() {
                    let mut user_text = String::new();
                    for block in arr {
                        let block_type = block.get("type").and_then(|v| v.as_str()).unwrap_or_default();
                        if block_type == "tool_result" {
                            if !user_text.is_empty() {
                                messages.push(json!({"role": "user", "content": user_text}));
                                user_text = String::new();
                            }
                            messages.push(json!({
                                "role": "tool",
                                "tool_call_id": block.get("tool_use_id").cloned().unwrap_or(json!("tool_generated")),
                                "content": to_tool_result_content(block.get("content").unwrap_or(&Value::Null)),
                            }));
                        } else if block_type == "text" {
                            user_text.push_str(block.get("text").and_then(|v| v.as_str()).unwrap_or_default());
                        }
                    }
                    if !user_text.is_empty() {
                        messages.push(json!({"role": "user", "content": user_text}));
                    }
                } else {
                    messages.push(json!({"role": "user", "content": flatten_anthropic_text(&content)}));
                }
                continue;
            }

            messages.push(json!({"role": role, "content": flatten_anthropic_text(&content)}));
        }
    }

    let mut req = json!({
        "model": if target_model.is_empty() { str_or_empty(body.get("model")) } else { target_model.to_string() },
        "messages": messages,
        "max_tokens": body.get("max_tokens").cloned().unwrap_or(Value::Null),
        "temperature": body.get("temperature").cloned().unwrap_or(Value::Null),
        "top_p": body.get("top_p").cloned().unwrap_or(Value::Null),
        "stream": body.get("stream").and_then(|v| v.as_bool()).unwrap_or(false),
    });

    if let Some(tools) = body.get("tools").and_then(|v| v.as_array()) {
        req["tools"] = json!(tools
            .iter()
            .map(|tool| {
                json!({
                    "type": "function",
                    "function": {
                        "name": tool.get("name").cloned().unwrap_or(json!("")),
                        "description": tool.get("description").cloned().unwrap_or(Value::Null),
                        "parameters": tool.get("input_schema").cloned().unwrap_or(json!({"type": "object", "properties": {}})),
                    }
                })
            })
            .collect::<Vec<_>>());
    }

    if let Some(tool_choice_name) = body
        .get("tool_choice")
        .and_then(|tc| tc.get("name"))
        .and_then(|v| v.as_str())
    {
        req["tool_choice"] = json!({
            "type": "function",
            "function": { "name": tool_choice_name }
        });
    }

    if let Some(stop_sequences) = body.get("stop_sequences") {
        req["stop"] = stop_sequences.clone();
    }

    Ok(req)
}

pub fn map_anthropic_to_openai_response(anthropic_response: &Value, request_model: &str) -> Value {
    let mut content_parts = vec![];
    let mut tool_calls = vec![];
    if let Some(arr) = anthropic_response.get("content").and_then(|v| v.as_array()) {
        for block in arr {
            let block_type = block.get("type").and_then(|v| v.as_str()).unwrap_or_default();
            if block_type == "text" {
                content_parts.push(block.get("text").and_then(|v| v.as_str()).unwrap_or_default().to_string());
            }
            if block_type == "tool_use" {
                tool_calls.push(json!({
                    "id": block.get("id").cloned().unwrap_or(json!("tool_generated")),
                    "type": "function",
                    "function": {
                        "name": block.get("name").cloned().unwrap_or(json!("tool")),
                        "arguments": serde_json::to_string(block.get("input").unwrap_or(&json!({}))).unwrap_or_else(|_| "{}".to_string()),
                    },
                }));
            }
        }
    }

    let mut message = json!({
        "role": "assistant",
        "content": content_parts.join(""),
    });
    if !tool_calls.is_empty() {
        message["tool_calls"] = json!(tool_calls.clone());
    }

    json!({
        "id": anthropic_response.get("id").cloned().unwrap_or(json!("chatcmpl_generated")),
        "object": "chat.completion",
        "created": chrono::Utc::now().timestamp(),
        "model": if request_model.is_empty() { anthropic_response.get("model").cloned().unwrap_or(json!("")) } else { json!(request_model) },
        "choices": [
            {
                "index": 0,
                "message": message,
                "finish_reason": if tool_calls.is_empty() { "stop" } else { "tool_calls" },
            }
        ],
        "usage": {
            "prompt_tokens": anthropic_response.get("usage").and_then(|u| u.get("input_tokens")).and_then(|v| v.as_u64()).unwrap_or(0),
            "completion_tokens": anthropic_response.get("usage").and_then(|u| u.get("output_tokens")).and_then(|v| v.as_u64()).unwrap_or(0),
            "total_tokens": anthropic_response.get("usage").and_then(|u| u.get("input_tokens")).and_then(|v| v.as_u64()).unwrap_or(0)
                + anthropic_response.get("usage").and_then(|u| u.get("output_tokens")).and_then(|v| v.as_u64()).unwrap_or(0),
        }
    })
}

pub fn map_openai_to_anthropic_response(openai_response: &Value, request_model: &str) -> Value {
    let choice = openai_response
        .get("choices")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .cloned()
        .unwrap_or_else(|| json!({}));
    let message = choice.get("message").cloned().unwrap_or_else(|| json!({}));

    let mut content = vec![];
    if let Some(text) = message.get("content").and_then(|v| v.as_str()) {
        if !text.is_empty() {
            content.push(json!({"type": "text", "text": text}));
        }
    }

    if let Some(tool_calls) = message.get("tool_calls").and_then(|v| v.as_array()) {
        for call in tool_calls {
            content.push(json!({
                "type": "tool_use",
                "id": call.get("id").cloned().unwrap_or(json!("tool_generated")),
                "name": call.get("function").and_then(|f| f.get("name")).cloned().unwrap_or(json!("tool")),
                "input": call
                    .get("function")
                    .and_then(|f| f.get("arguments"))
                    .and_then(|v| v.as_str())
                    .and_then(|s| serde_json::from_str::<Value>(s).ok())
                    .unwrap_or_else(|| json!({})),
            }));
        }
    }

    let finish_reason = choice
        .get("finish_reason")
        .and_then(|v| v.as_str())
        .unwrap_or("stop");

    let stop_reason = match finish_reason {
        "tool_calls" => "tool_use",
        "length" => "max_tokens",
        _ => "end_turn",
    };

    json!({
        "id": openai_response.get("id").cloned().unwrap_or(json!("msg_generated")),
        "type": "message",
        "role": "assistant",
        "model": if request_model.is_empty() { openai_response.get("model").cloned().unwrap_or(json!("")) } else { json!(request_model) },
        "content": content,
        "stop_reason": stop_reason,
        "usage": {
            "input_tokens": openai_response.get("usage").and_then(|u| u.get("prompt_tokens")).and_then(|v| v.as_u64()).unwrap_or(0),
            "output_tokens": openai_response.get("usage").and_then(|u| u.get("completion_tokens")).and_then(|v| v.as_u64()).unwrap_or(0),
        }
    })
}

pub fn map_openai_chat_to_responses(chat_response: &Value) -> Value {
    let choice = chat_response
        .get("choices")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .cloned()
        .unwrap_or_else(|| json!({}));
    let message = choice.get("message").cloned().unwrap_or_else(|| json!({}));
    let text = message
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    let mut output = vec![json!({
        "type": "message",
        "role": "assistant",
        "content": [{"type": "output_text", "text": text}],
    })];

    if let Some(tool_calls) = message.get("tool_calls").and_then(|v| v.as_array()) {
        for tool_call in tool_calls {
            output.push(json!({
                "type": "function_call",
                "id": tool_call.get("id").cloned().unwrap_or(json!("call_generated")),
                "call_id": tool_call.get("id").cloned().unwrap_or(json!("call_generated")),
                "status": "completed",
                "name": tool_call.get("function").and_then(|f| f.get("name")).cloned().unwrap_or(json!("tool")),
                "arguments": tool_call.get("function").and_then(|f| f.get("arguments")).cloned().unwrap_or(json!("{}")),
            }));
        }
    }

    let usage = chat_response.get("usage").cloned().unwrap_or_else(|| json!({}));
    let input_tokens = usage
        .get("input_tokens")
        .and_then(|v| v.as_u64())
        .or_else(|| usage.get("prompt_tokens").and_then(|v| v.as_u64()))
        .unwrap_or(0);
    let output_tokens = usage
        .get("output_tokens")
        .and_then(|v| v.as_u64())
        .or_else(|| usage.get("completion_tokens").and_then(|v| v.as_u64()))
        .unwrap_or(0);

    json!({
        "id": chat_response.get("id").cloned().unwrap_or(json!("resp_generated")),
        "object": "response",
        "created_at": chat_response.get("created").cloned().unwrap_or(json!(chrono::Utc::now().timestamp())),
        "model": chat_response.get("model").cloned().unwrap_or(json!("")),
        "status": "completed",
        "output": output,
        "usage": {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": usage
                .get("total_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(input_tokens + output_tokens),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::{
        map_anthropic_to_openai_request, map_anthropic_to_openai_response,
        map_openai_chat_to_responses, map_openai_to_anthropic_request,
        map_openai_to_anthropic_response, normalize_openai_request,
    };
    use serde_json::json;

    #[test]
    fn openai_request_maps_to_anthropic_request() {
        let input = json!({
            "model": "m1",
            "messages": [
                { "role": "system", "content": "be concise" },
                { "role": "user", "content": "hello" }
            ],
            "stream": true,
            "max_tokens": 100
        });

        let out =
            map_openai_to_anthropic_request(&input, true, "claude-target").expect("mapping should succeed");
        assert_eq!(out["model"], "claude-target");
        assert_eq!(out["stream"], true);
        assert_eq!(out["system"], "be concise");
        assert_eq!(out["messages"][0]["role"], "user");
    }

    #[test]
    fn anthropic_request_maps_to_openai_request() {
        let input = json!({
            "model": "claude-x",
            "system": "helpful",
            "messages": [{ "role": "user", "content": [{ "type": "text", "text": "hello" }] }],
            "stream": false
        });

        let out = map_anthropic_to_openai_request(&input, true, "gpt-target")
            .expect("mapping should succeed");
        assert_eq!(out["model"], "gpt-target");
        assert_eq!(out["messages"][0]["role"], "system");
        assert_eq!(out["messages"][1]["content"], "hello");
    }

    #[test]
    fn anthropic_response_maps_to_openai_response() {
        let input = json!({
            "id": "msg_1",
            "model": "claude-z",
            "content": [{ "type": "text", "text": "hi" }],
            "usage": { "input_tokens": 3, "output_tokens": 4 }
        });

        let out = map_anthropic_to_openai_response(&input, "m1");
        assert_eq!(out["choices"][0]["message"]["content"], "hi");
        assert_eq!(out["model"], "m1");
    }

    #[test]
    fn openai_response_maps_to_anthropic_response() {
        let input = json!({
            "id": "chat_1",
            "model": "gpt-x",
            "choices": [{ "message": { "content": "ok" }, "finish_reason": "stop" }],
            "usage": { "prompt_tokens": 5, "completion_tokens": 2 }
        });

        let out = map_openai_to_anthropic_response(&input, "claude-m");
        assert_eq!(out["model"], "claude-m");
        assert_eq!(out["content"][0]["text"], "ok");
        assert_eq!(out["stop_reason"], "end_turn");
    }

    #[test]
    fn strict_mode_rejects_unknown_openai_fields() {
        let input = json!({
            "model": "m",
            "messages": [],
            "unknown_a": true
        });
        let err = map_openai_to_anthropic_request(&input, true, "m").expect_err("should fail");
        assert!(err.contains("Unsupported OpenAI fields"));
    }

    #[test]
    fn responses_input_is_normalized() {
        let normalized = normalize_openai_request(
            "/v1/responses",
            &json!({
                "model": "m",
                "input": "hello",
                "stream": false,
                "system": "sys",
                "thinking": { "type": "enabled" },
                "context_management": { "clear_function_results": false }
            }),
        );

        assert_eq!(normalized["messages"][0]["role"], "user");
        assert_eq!(normalized["messages"][0]["content"], "hello");
        assert_eq!(normalized["system"], "sys");
        assert_eq!(normalized["thinking"]["type"], "enabled");
        assert_eq!(normalized["context_management"]["clear_function_results"], false);
    }

    #[test]
    fn responses_function_call_io_is_normalized_to_chat_tool_messages() {
        let normalized = normalize_openai_request(
            "/v1/responses",
            &json!({
                "model": "m",
                "max_output_tokens": 2048,
                "instructions": "system prompt",
                "input": [
                    {
                        "type": "function_call",
                        "call_id": "call_1",
                        "name": "weather_lookup",
                        "arguments": { "city": "sf" }
                    },
                    {
                        "type": "function_call_output",
                        "call_id": "call_1",
                        "output": [{ "type": "output_text", "text": "sunny" }]
                    }
                ]
            }),
        );

        assert_eq!(normalized["max_tokens"], 2048);
        assert_eq!(normalized["system"], "system prompt");
        assert_eq!(normalized["messages"][0]["role"], "assistant");
        assert_eq!(normalized["messages"][0]["tool_calls"][0]["id"], "call_1");
        assert_eq!(normalized["messages"][1]["role"], "tool");
        assert_eq!(normalized["messages"][1]["tool_call_id"], "call_1");
    }

    #[test]
    fn strict_mode_allows_openai_system_thinking_context_fields() {
        let input = json!({
            "model": "m1",
            "messages": [{ "role": "user", "content": "hello" }],
            "system": "be concise",
            "thinking": { "type": "enabled" },
            "context_management": { "clear_function_results": false }
        });
        let out = map_openai_to_anthropic_request(&input, true, "claude-target")
            .expect("mapping should succeed");
        assert_eq!(out["system"], "be concise");
        assert_eq!(out["thinking"]["type"], "enabled");
        assert_eq!(out["context_management"]["clear_function_results"], false);
    }

    #[test]
    fn strict_mode_allows_anthropic_thinking_context_fields() {
        let input = json!({
            "model": "claude-x",
            "messages": [{ "role": "user", "content": [{ "type": "text", "text": "hello" }] }],
            "thinking": { "type": "enabled" },
            "context_management": { "clear_function_results": false }
        });
        let out = map_anthropic_to_openai_request(&input, true, "gpt-target")
            .expect("mapping should succeed");
        assert_eq!(out["model"], "gpt-target");
        assert_eq!(out["messages"][0]["role"], "user");
    }

    #[test]
    fn chat_response_to_responses_keeps_tool_calls() {
        let mapped = map_openai_chat_to_responses(&json!({
            "id": "chatcmpl_1",
            "created": 123456,
            "model": "gpt-4.1",
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": "I will call a tool",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {
                                "name": "weather_lookup",
                                "arguments": "{\"city\":\"sf\"}"
                            }
                        }
                    ]
                }
            }]
        }));

        assert_eq!(mapped["object"], "response");
        assert_eq!(mapped["output"][0]["type"], "message");
        assert_eq!(mapped["output"][1]["type"], "function_call");
        assert_eq!(mapped["output"][1]["name"], "weather_lookup");
        assert_eq!(mapped["status"], "completed");
        assert_eq!(mapped["usage"]["input_tokens"], 0);
        assert_eq!(mapped["usage"]["output_tokens"], 0);
    }

    #[test]
    fn openai_tool_message_maps_to_anthropic_tool_result() {
        let out = map_openai_to_anthropic_request(
            &json!({
                "model": "m",
                "messages": [
                    {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [{
                            "id": "call_1",
                            "type": "function",
                            "function": {
                                "name": "weather_lookup",
                                "arguments": "{\"city\":\"sf\"}"
                            }
                        }]
                    },
                    {
                        "role": "tool",
                        "tool_call_id": "call_1",
                        "content": "sunny"
                    }
                ]
            }),
            true,
            "claude-target",
        )
        .expect("mapping should succeed");

        assert_eq!(out["messages"][0]["role"], "assistant");
        assert_eq!(out["messages"][0]["content"][0]["type"], "tool_use");
        assert_eq!(out["messages"][1]["role"], "user");
        assert_eq!(out["messages"][1]["content"][0]["type"], "tool_result");
        assert_eq!(out["messages"][1]["content"][0]["tool_use_id"], "call_1");
        assert_eq!(out["messages"][1]["content"][0]["content"], "sunny");
    }

    #[test]
    fn anthropic_tool_result_maps_to_openai_tool_message() {
        let out = map_anthropic_to_openai_request(
            &json!({
                "model": "claude-x",
                "messages": [
                    {
                        "role": "assistant",
                        "content": [{
                            "type": "tool_use",
                            "id": "toolu_1",
                            "name": "weather_lookup",
                            "input": { "city": "sf" }
                        }]
                    },
                    {
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": "toolu_1",
                            "content": [{ "type": "text", "text": "sunny" }]
                        }]
                    }
                ]
            }),
            true,
            "gpt-target",
        )
        .expect("mapping should succeed");

        assert_eq!(out["messages"][0]["role"], "assistant");
        assert_eq!(out["messages"][0]["tool_calls"][0]["id"], "toolu_1");
        assert_eq!(out["messages"][1]["role"], "tool");
        assert_eq!(out["messages"][1]["tool_call_id"], "toolu_1");
        assert_eq!(out["messages"][1]["content"], "sunny");
    }

    #[test]
    fn openai_finish_reason_tool_calls_maps_to_anthropic_tool_use() {
        let out = map_openai_to_anthropic_response(
            &json!({
                "id": "chat_2",
                "model": "gpt-x",
                "choices": [{ "message": { "content": "" }, "finish_reason": "tool_calls" }],
                "usage": { "prompt_tokens": 1, "completion_tokens": 1 }
            }),
            "claude-m",
        );
        assert_eq!(out["stop_reason"], "tool_use");
    }
}
