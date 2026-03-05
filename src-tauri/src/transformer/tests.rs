#[cfg(test)]
mod tests {
    use crate::transformer::convert::{claude_openai, openai_claude};
    use serde_json::json;

    #[test]
    fn test_claude_to_openai_request() {
        let claude_req = json!({
            "model": "claude-3-5-sonnet-20241022",
            "max_tokens": 1024,
            "messages": [
                {"role": "user", "content": "Hello"}
            ]
        });

        let result = claude_openai::claude_req_to_openai(
            serde_json::to_vec(&claude_req).unwrap().as_slice(),
            "gpt-4"
        );

        assert!(result.is_ok());
        let openai_req: serde_json::Value = serde_json::from_slice(&result.unwrap()).unwrap();
        assert_eq!(openai_req["model"], "gpt-4");
        assert_eq!(openai_req["messages"][0]["role"], "user");
        assert_eq!(openai_req["messages"][0]["content"], "Hello");
    }

    #[test]
    fn test_openai_to_claude_response() {
        let openai_resp = json!({
            "id": "chatcmpl-123",
            "object": "chat.completion",
            "created": 1677652288,
            "model": "gpt-4",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "Hello! How can I help you?"
                },
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 20,
                "total_tokens": 30
            }
        });

        let result = openai_claude::openai_resp_to_claude(
            serde_json::to_vec(&openai_resp).unwrap().as_slice()
        );

        assert!(result.is_ok());
        let claude_resp: serde_json::Value = serde_json::from_slice(&result.unwrap()).unwrap();
        assert_eq!(claude_resp["type"], "message");
        assert_eq!(claude_resp["role"], "assistant");
        assert_eq!(claude_resp["content"][0]["type"], "text");
        assert_eq!(claude_resp["content"][0]["text"], "Hello! How can I help you?");
        assert_eq!(claude_resp["stop_reason"], "end_turn");
    }
}
