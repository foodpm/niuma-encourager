//! Tauri commands：前端 invoke 入口

use crate::clock::{load_profile, save_profile as save_profile_inner, ClockState};
use crate::payroll;
use crate::store::{date_of_local, Store};
use chrono::Local;
use tauri::{AppHandle, Manager};

#[derive(serde::Serialize)]
pub struct AppStateResponse {
    pub profile: payroll::Profile,
    pub earned_today: f64,
    pub paused: bool,
    pub today: String,
}

#[tauri::command]
pub fn get_state(app: AppHandle) -> AppStateResponse {
    let profile = load_profile(&app);
    let state = app.state::<ClockState>();
    let now = Local::now();
    let earned_today = *state.earned_today.lock().unwrap();
    let paused = state.paused.load(std::sync::atomic::Ordering::SeqCst);
    AppStateResponse {
        profile,
        earned_today,
        paused,
        today: date_of_local(now).format("%Y-%m-%d").to_string(),
    }
}

#[tauri::command]
pub fn save_profile(app: AppHandle, profile: payroll::Profile) -> Result<(), String> {
    let old = load_profile(&app);
    // 审计关键字段变更
    if let Ok(db_path) = app.path().app_data_dir().map(|p| p.join("niuma.db")) {
        if let Ok(store) = Store::open(&db_path) {
            if (old.monthly_salary - profile.monthly_salary).abs() > f64::EPSILON {
                let _ = store.audit_setting(
                    "monthlySalary",
                    Some(&old.monthly_salary.to_string()),
                    Some(&profile.monthly_salary.to_string()),
                );
            }
        }
    }
    save_profile_inner(&app, &profile).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pause_resume(app: AppHandle) -> String {
    let state = app.state::<ClockState>();
    let paused = !state.paused.load(std::sync::atomic::Ordering::SeqCst);
    state.paused.store(paused, std::sync::atomic::Ordering::SeqCst);
    if paused {
        // 记录暂停起点逻辑由 tick 的 delta 处理：paused 状态下不累计即等效
    }
    if paused { "break" } else { "working" }.to_string()
}

#[tauri::command]
pub fn export_csv(app: AppHandle) -> Result<String, String> {
    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("niuma.db");
    let store = Store::open(&db_path).map_err(|e| e.to_string())?;
    let out = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(format!("niuma-export-{}.csv", Local::now().format("%Y%m%d-%H%M%S")));
    store.export_csv(&out).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_data_dir(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
