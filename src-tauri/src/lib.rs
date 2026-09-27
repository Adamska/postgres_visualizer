//! Table++ backend: database sessions, catalog introspection and local storage exposed to the
//! web front end through Tauri commands.

pub mod commands;
pub mod db;
pub mod error;
pub mod menu;
pub mod storage;

use tauri::{Emitter, Manager};

/// Builds and runs the Tauri application.
///
/// # Panics
/// Panics when the Tauri runtime cannot start, which is fatal for a desktop app.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(db::SessionRegistry::default())
        .menu(menu::build)
        .on_menu_event(|app, event| {
            let _ = app.emit(menu::MENU_EVENT, event.id().0.as_str());
        })
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    use window_vibrancy::{
                        apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState,
                    };
                    let _ = apply_vibrancy(
                        &window,
                        NSVisualEffectMaterial::Sidebar,
                        Some(NSVisualEffectState::FollowsWindowActiveState),
                        None,
                    );
                }
                let _ = window.show();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::connect,
            commands::test_connection,
            commands::disconnect,
            commands::server_version,
            commands::execute_sql,
            commands::execute_transaction,
            commands::ping,
            commands::cancel_query,
            commands::list_schemas,
            commands::list_relations,
            commands::list_functions,
            commands::table_structure,
            commands::schema_graph,
            commands::load_document,
            commands::save_document,
            commands::get_password,
            commands::set_password,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Table++");
}
