use axum::body::Bytes;
use serde_json::Value;

pub(super) fn push_sse_event(out: &mut Vec<Bytes>, event: &str, payload: &Value) {
    out.push(encode_sse_json_event(event, payload));
}

pub(super) fn push_sse_data_json(out: &mut Vec<Bytes>, payload: &Value) {
    out.push(encode_sse_data_json(payload));
}

pub(super) fn push_sse_done(out: &mut Vec<Bytes>) {
    out.push(Bytes::from("data: [DONE]\n\n"));
}

fn encode_sse_json_event(event: &str, payload: &Value) -> Bytes {
    Bytes::from(format!("event: {event}\ndata: {}\n\n", payload))
}

fn encode_sse_data_json(payload: &Value) -> Bytes {
    Bytes::from(format!("data: {}\n\n", payload))
}
