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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            fetch_ics,
            list_system_fonts,
            get_autostart,
            set_autostart
        ])
        .run(tauri::generate_context!())
        .expect("error while running winClock");
}
