use crate::error::{MyceliumError, MyceliumResult};
use crate::state::AppState;
use crate::stubs::{check_admin, command, Manager};
use axum::{
    extract::{Multipart, State as AxumState},
    response::IntoResponse,
    Json,
};
use std::io::Write;

pub async fn upload_farming_photo(
    app: crate::stubs::AppHandle,
    file_path: String,
) -> MyceliumResult<String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| MyceliumError::Internal(format!("App dir error: {}", e)))?;
    let media_dir = app_dir.join("media");
    if !media_dir.exists() {
        std::fs::create_dir_all(&media_dir)?;
    }

    let path = std::path::Path::new(&file_path);
    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("png");
    let file_name = format!(
        "farm_{}_{}.{}",
        chrono::Local::now().timestamp(),
        uuid::Uuid::new_v4().to_string().split_at(8).0,
        extension
    );
    let target_path = media_dir.join(&file_name);

    std::fs::copy(path, &target_path)?;
    Ok(file_name)
}

pub async fn get_media_base64(
    app: crate::stubs::AppHandle,
    file_name: String,
) -> MyceliumResult<String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| MyceliumError::Internal(format!("App dir error: {}", e)))?;
    let media_path = app_dir.join("media").join(&file_name);

    if !media_path.exists() {
        return Err(MyceliumError::Internal(format!(
            "File not found: {}",
            file_name
        )));
    }

    let bytes = std::fs::read(&media_path)?;
    let extension = media_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let mime_type = match extension.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        _ => "image/png",
    };

    use base64::{engine::general_purpose, Engine as _};
    let base64_str = general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{};base64,{}", mime_type, base64_str))
}

pub async fn upload_media_axum(
    AxumState(_state): AxumState<AppState>,
    mut multipart: Multipart,
) -> MyceliumResult<Json<String>> {
    let mut file_name = String::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| MyceliumError::Internal(e.to_string()))?
    {
        let name = field.name().unwrap_or("file").to_string();
        if name == "file" {
            let original_name = field.file_name().unwrap_or("upload.png").to_string();
            let data = field
                .bytes()
                .await
                .map_err(|e| MyceliumError::Internal(e.to_string()))?;

            let extension = std::path::Path::new(&original_name)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("png");

            let new_file_name = format!(
                "farm_{}_{}.{}",
                chrono::Local::now().timestamp(),
                uuid::Uuid::new_v4().to_string().split_at(8).0,
                extension
            );

            let config_dir = crate::commands::config::get_app_config_dir()?;
            let media_dir = config_dir.join("media");
            if !media_dir.exists() {
                std::fs::create_dir_all(&media_dir)?;
            }

            let target_path = media_dir.join(&new_file_name);
            let mut file = std::fs::File::create(target_path)?;
            file.write_all(&data)?;

            file_name = new_file_name;
            break; // Expecting single file
        }
    }

    if file_name.is_empty() {
        return Err(MyceliumError::Internal("No file uploaded".to_string()));
    }

    Ok(Json(file_name))
}

pub async fn serve_media_axum(
    AxumState(_state): AxumState<AppState>,
    axum::extract::Path(filename): axum::extract::Path<String>,
) -> impl axum::response::IntoResponse {
    let config_dir = match crate::commands::config::get_app_config_dir() {
        Ok(d) => d,
        Err(_) => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Config Error",
            )
                .into_response()
        }
    };
    let path = config_dir.join("media").join(&filename);

    match std::fs::read(&path) {
        Ok(bytes) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            ([(axum::http::header::CONTENT_TYPE, mime.as_ref())], bytes).into_response()
        }
        Err(_) => (axum::http::StatusCode::NOT_FOUND, "File not found").into_response(),
    }
}
