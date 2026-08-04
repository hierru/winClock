#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Fetch an iCal feed server-side to avoid webview CORS restrictions.
#[tauri::command]
async fn fetch_ics(url: String) -> Result<String, String> {
    if !url.starts_with("https://") {
        return Err("https:// 주소만 지원합니다".to_string());
    }
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.text().await.map_err(|e| e.to_string())
}

/// List installed font family names from the Windows registry.
#[tauri::command]
fn list_system_fonts() -> Vec<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    const STYLES: [&str; 16] = [
        "Bold", "Italic", "Light", "SemiBold", "Semibold", "Medium", "Black", "Thin",
        "ExtraLight", "ExtraBold", "Condensed", "SemiLight", "Semilight", "Oblique",
        "Regular", "Narrow",
    ];

    fn base_name(value_name: &str) -> Option<String> {
        // "Arial Bold Italic (TrueType)" -> "Arial"
        let n = value_name.split(" (").next()?.trim();
        if n.is_empty() || n.contains(',') {
            return None; // legacy bitmap entries like "Courier 10,12,15"
        }
        let mut parts: Vec<&str> = n.split(' ').collect();
        while parts.len() > 1 && STYLES.contains(parts.last().unwrap()) {
            parts.pop();
        }
        Some(parts.join(" "))
    }

    let mut set = std::collections::BTreeSet::new();
    let path = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts";
    for root in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        if let Ok(key) = RegKey::predef(root).open_subkey(path) {
            for (name, _) in key.enum_values().flatten() {
                if let Some(base) = base_name(&name) {
                    set.insert(base);
                }
            }
        }
    }
    set.into_iter().collect()
}

/// Durable settings store: %APPDATA%/com.hierru.winclock/settings.json.
/// WebView2 localStorage can be lost on hard exits, so the frontend
/// mirrors its state here.
fn settings_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<String, String> {
    let path = settings_file(&app)?;
    Ok(std::fs::read_to_string(path).unwrap_or_else(|_| "{}".to_string()))
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = settings_file(&app)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, &data).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_VALUE: &str = "winClock";

#[tauri::command]
fn get_autostart() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(RUN_KEY)
        .and_then(|k| k.get_value::<String, _>(RUN_VALUE))
        .is_ok()
}

#[tauri::command]
fn set_autostart(enable: bool) -> Result<(), String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(RUN_KEY)
        .map_err(|e| e.to_string())?;
    if enable {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        key.set_value(RUN_VALUE, &format!("\"{}\"", exe.display()))
            .map_err(|e| e.to_string())
    } else {
        match key.delete_value(RUN_VALUE) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    use tauri::Manager;

    let show = MenuItem::with_id(app, "show", "열기", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("winClock")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.hide();
                    } else {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                }
            }
        })
        .build(app)?;
    Ok(())
}

fn main() {
    use tauri_plugin_window_state::StateFlags;

    tauri::Builder::default()
        // restore window position/size from the previous run; skip VISIBLE so
        // quitting from the tray while hidden never restores an invisible window
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() ^ StateFlags::VISIBLE)
                .build(),
        )
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_ics,
            list_system_fonts,
            get_autostart,
            set_autostart,
            load_settings,
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running winClock");
}
