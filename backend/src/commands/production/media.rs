use crate::error::{MyceliumError, MyceliumResult};
use crate::stubs::{command, Manager, check_admin};


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


pub async fn get_media_base64(app: crate::stubs::AppHandle, file_name: String) -> MyceliumResult<String> {
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
