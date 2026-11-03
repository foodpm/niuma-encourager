//! 牛马鼓励器 — Tauri 2 应用装配

mod clock;
mod commands;
mod payroll;
mod store;

use clock::ClockState;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_notification::init())
        .manage(ClockState::new())
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::save_profile,
            commands::pause_resume,
            commands::export_csv,
            commands::open_data_dir,
        ])
        .setup(|app| {
            // 数据目录确保存在
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;

            // 托盘
            let show = MenuItem::with_id(app, "show", "显示主窗", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("牛马鼓励器 🐂")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // 关窗隐藏到托盘
            if let Some(w) = app.get_webview_window("main") {
                let w2 = w.clone();
                w.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w2.hide();
                    }
                });
            }

            // 启动时钟
            clock::spawn_clock(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running 牛马鼓励器");
}
