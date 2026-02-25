use axum::{
    body::Body,
    extract::Request,
    http::{header, StatusCode},
    middleware::Next,
    response::Response,
};
use http_body_util::BodyExt;
use serde_json::{json, Value};

pub async fn wrap_response_middleware(req: Request, next: Next) -> Result<Response, StatusCode> {
    let path = req.uri().path().to_string();
    let res = next.run(req).await;

    // Only wrap /api responses and avoid wrapping static assets or media files
    let content_type = res
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");

    if !path.starts_with("/api")
        || path.starts_with("/api/production/media/")
        || content_type.contains("application/pdf")
        || content_type.contains("application/octet-stream")
    {
        return Ok(res);
    }

    let status = res.status();

    // Check if the response is already JSON
    let is_json = res
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|h| h.to_str().ok())
        .map_or(false, |ct| ct.contains("application/json"));

    let (mut parts, body) = res.into_parts();

    // Consume the body bytes
    let bytes = match body.collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };

    let wrapped = if is_json {
        let data: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);

        // If it's already an object and has "success", assume it's already standardized
        if let Some(obj) = data.as_object() {
            if obj.contains_key("success") {
                data
            } else {
                if status.is_success() {
                    json!({ "success": true, "data": data })
                } else {
                    json!({
                        "success": false,
                        "error": data.as_str().or(data.get("error").and_then(|v| v.as_str())).unwrap_or(&status.to_string())
                    })
                }
            }
        } else {
            // Not an object (primitive type like string, number)
            if status.is_success() {
                json!({ "success": true, "data": data })
            } else {
                json!({ "success": false, "error": data.as_str().unwrap_or(&status.to_string()) })
            }
        }
    } else {
        // Not JSON (e.g. plain text error or empty success)
        if status.is_success() {
            if bytes.is_empty() {
                json!({ "success": true, "data": null })
            } else {
                let msg = String::from_utf8_lossy(&bytes).to_string();
                json!({ "success": true, "data": msg })
            }
        } else {
            let msg = String::from_utf8_lossy(&bytes).to_string();
            json!({
                "success": false,
                "error": if msg.is_empty() { status.to_string() } else { msg }
            })
        }
    };

    let new_bytes = serde_json::to_vec(&wrapped).unwrap();

    // Update headers
    parts.headers.insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("application/json"),
    );
    parts.headers.insert(
        header::CONTENT_LENGTH,
        header::HeaderValue::from_str(&new_bytes.len().to_string()).unwrap(),
    );

    Ok(Response::from_parts(parts, Body::from(new_bytes)))
}
