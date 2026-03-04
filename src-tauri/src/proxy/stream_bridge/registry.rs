use super::emit::{push_sse_data_json, push_sse_done, push_sse_event};
use crate::mappers::{
    map_response_by_surface, MapperSurface, OpenaiChatToAnthropicStreamMapper,
    OpenaiChatToResponsesStreamMapper, OpenaiResponsesToChatStreamMapper,
};
use axum::body::Bytes;
use serde_json::Value;

pub(super) type DynBridgeAdapter = dyn BridgeAdapter + Send;
type BridgeBuilder = fn(&str) -> Box<DynBridgeAdapter>;

const BRIDGE_REGISTRY: &[(MapperSurface, MapperSurface, BridgeBuilder)] = &[
    (
        MapperSurface::OpenaiChatCompletions,
        MapperSurface::AnthropicMessages,
        build_openai_chat_to_anthropic_bridge,
    ),
    (
        MapperSurface::OpenaiResponses,
        MapperSurface::OpenaiChatCompletions,
        build_openai_responses_to_chat_bridge,
    ),
    (
        MapperSurface::OpenaiChatCompletions,
        MapperSurface::OpenaiResponses,
        build_openai_chat_to_responses_bridge,
    ),
];

pub(super) fn build_bridge(
    source: MapperSurface,
    target: MapperSurface,
    request_model: &str,
) -> Option<Box<DynBridgeAdapter>> {
    let builder = BRIDGE_REGISTRY
        .iter()
        .find_map(|(src, tgt, build)| ((*src == source) && (*tgt == target)).then_some(*build))?;
    Some(builder(request_model))
}

pub(super) fn map_non_stream_via_bridge(
    source: MapperSurface,
    target: MapperSurface,
    payload: &Value,
    request_model: &str,
) -> Option<Value> {
    let mut adapter = build_bridge(source, target, request_model)?;
    let mut sink = Vec::new();
    adapter.on_single_response_json(payload, &mut sink);
    adapter.finish(&mut sink);
    adapter.final_response_json()
}

pub(super) trait BridgeAdapter {
    fn on_json_frame(&mut self, event: Option<&str>, payload: &Value, out: &mut Vec<Bytes>);
    fn on_done_frame(&mut self, out: &mut Vec<Bytes>);
    fn finish(&mut self, out: &mut Vec<Bytes>);
    fn on_single_response_json(&mut self, _payload: &Value, _out: &mut Vec<Bytes>) {}
    fn final_response_json(&self) -> Option<Value> {
        None
    }
}

fn build_openai_chat_to_anthropic_bridge(request_model: &str) -> Box<DynBridgeAdapter> {
    Box::new(OpenaiChatToAnthropicBridgeAdapter::new(request_model))
}

fn build_openai_responses_to_chat_bridge(request_model: &str) -> Box<DynBridgeAdapter> {
    Box::new(OpenaiResponsesToChatBridgeAdapter::new(request_model))
}

fn build_openai_chat_to_responses_bridge(request_model: &str) -> Box<DynBridgeAdapter> {
    Box::new(OpenaiChatToResponsesBridgeAdapter::new(request_model))
}

struct OpenaiChatToAnthropicBridgeAdapter {
    mapper: OpenaiChatToAnthropicStreamMapper,
}

impl OpenaiChatToAnthropicBridgeAdapter {
    fn new(request_model: &str) -> Self {
        Self {
            mapper: OpenaiChatToAnthropicStreamMapper::new(request_model),
        }
    }
}

impl BridgeAdapter for OpenaiChatToAnthropicBridgeAdapter {
    fn on_json_frame(&mut self, _event: Option<&str>, payload: &Value, out: &mut Vec<Bytes>) {
        for (event, payload) in self.mapper.on_stream_payload(payload) {
            push_sse_event(out, &event, &payload);
        }
    }

    fn on_done_frame(&mut self, out: &mut Vec<Bytes>) {
        for (event, payload) in self.mapper.on_done() {
            push_sse_event(out, &event, &payload);
        }
    }

    fn finish(&mut self, out: &mut Vec<Bytes>) {
        for (event, payload) in self.mapper.finish() {
            push_sse_event(out, &event, &payload);
        }
    }

    fn on_single_response_json(&mut self, payload: &Value, out: &mut Vec<Bytes>) {
        for (event, payload) in self.mapper.on_non_stream_payload(payload) {
            push_sse_event(out, &event, &payload);
        }
        for (event, payload) in self.mapper.finish() {
            push_sse_event(out, &event, &payload);
        }
    }

    fn final_response_json(&self) -> Option<Value> {
        self.mapper.final_message_json()
    }
}

struct OpenaiResponsesToChatBridgeAdapter {
    mapper: OpenaiResponsesToChatStreamMapper,
    done_sent: bool,
    request_model: String,
    non_stream_output: Option<Value>,
}

impl OpenaiResponsesToChatBridgeAdapter {
    fn new(request_model: &str) -> Self {
        Self {
            mapper: OpenaiResponsesToChatStreamMapper::new(request_model),
            done_sent: false,
            request_model: request_model.to_string(),
            non_stream_output: None,
        }
    }
}

impl BridgeAdapter for OpenaiResponsesToChatBridgeAdapter {
    fn on_json_frame(&mut self, event: Option<&str>, payload: &Value, out: &mut Vec<Bytes>) {
        for chunk in self.mapper.on_stream_payload(event, payload) {
            push_sse_data_json(out, &chunk);
        }
    }

    fn on_done_frame(&mut self, out: &mut Vec<Bytes>) {
        for chunk in self.mapper.on_done() {
            push_sse_data_json(out, &chunk);
        }
    }

    fn finish(&mut self, out: &mut Vec<Bytes>) {
        for chunk in self.mapper.finish() {
            push_sse_data_json(out, &chunk);
        }
        if !self.done_sent {
            push_sse_done(out);
            self.done_sent = true;
        }
    }

    fn on_single_response_json(&mut self, payload: &Value, _out: &mut Vec<Bytes>) {
        self.non_stream_output = Some(map_response_by_surface(
            MapperSurface::OpenaiResponses,
            MapperSurface::OpenaiChatCompletions,
            payload,
            &self.request_model,
        ));
        self.done_sent = true;
    }

    fn final_response_json(&self) -> Option<Value> {
        self.non_stream_output.clone()
    }
}

struct OpenaiChatToResponsesBridgeAdapter {
    mapper: OpenaiChatToResponsesStreamMapper,
    done_sent: bool,
    request_model: String,
    non_stream_output: Option<Value>,
}

impl OpenaiChatToResponsesBridgeAdapter {
    fn new(request_model: &str) -> Self {
        Self {
            mapper: OpenaiChatToResponsesStreamMapper::new(request_model),
            done_sent: false,
            request_model: request_model.to_string(),
            non_stream_output: None,
        }
    }
}

impl BridgeAdapter for OpenaiChatToResponsesBridgeAdapter {
    fn on_json_frame(&mut self, _event: Option<&str>, payload: &Value, out: &mut Vec<Bytes>) {
        for (event, payload) in self.mapper.on_stream_payload(payload) {
            push_sse_event(out, &event, &payload);
        }
    }

    fn on_done_frame(&mut self, out: &mut Vec<Bytes>) {
        for (event, payload) in self.mapper.on_done() {
            push_sse_event(out, &event, &payload);
        }
    }

    fn finish(&mut self, out: &mut Vec<Bytes>) {
        for (event, payload) in self.mapper.finish() {
            push_sse_event(out, &event, &payload);
        }
        if !self.done_sent {
            push_sse_done(out);
            self.done_sent = true;
        }
    }

    fn on_single_response_json(&mut self, payload: &Value, _out: &mut Vec<Bytes>) {
        self.non_stream_output = Some(map_response_by_surface(
            MapperSurface::OpenaiChatCompletions,
            MapperSurface::OpenaiResponses,
            payload,
            &self.request_model,
        ));
        self.done_sent = true;
    }

    fn final_response_json(&self) -> Option<Value> {
        self.non_stream_output.clone()
    }
}
