//! Native menu bar. Every custom item carries a command id that the front end executes; the
//! accelerators shown here are the app's keyboard shortcuts, routed through the menu by macOS.

use tauri::menu::{AboutMetadataBuilder, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Runtime};

/// Event name carrying a command id to the front end.
pub const MENU_EVENT: &str = "menu";

/// Custom items: `(command id, label, accelerator)`.
type Item = (&'static str, &'static str, Option<&'static str>);

const FILE_ITEMS: &[Item] = &[
    (
        "connection.new",
        "New Connection…",
        Some("CmdOrCtrl+Shift+N"),
    ),
    ("query.new", "New Query Tab", Some("CmdOrCtrl+T")),
    ("", "", None),
    ("sqlFile", "Run SQL File…", None),
    ("export", "Export…", Some("CmdOrCtrl+Shift+E")),
    ("", "", None),
    ("tab.close", "Close Tab", Some("CmdOrCtrl+W")),
];

const VIEW_ITEMS: &[Item] = &[
    ("view.sidebar", "Toggle Sidebar", Some("CmdOrCtrl+B")),
    (
        "view.inspector",
        "Toggle Row Inspector",
        Some("Alt+CmdOrCtrl+I"),
    ),
    ("", "", None),
    (
        "tab.previous",
        "Previous Tab",
        Some("CmdOrCtrl+Shift+BracketLeft"),
    ),
    ("tab.next", "Next Tab", Some("CmdOrCtrl+Shift+BracketRight")),
];

const TABLE_ITEMS: &[Item] = &[
    ("table.refresh", "Refresh", Some("CmdOrCtrl+R")),
    ("table.filter", "Toggle Filters", Some("CmdOrCtrl+Shift+F")),
    ("", "", None),
    ("table.addRow", "Add Row", Some("Alt+CmdOrCtrl+N")),
    ("table.commit", "Commit Changes…", Some("CmdOrCtrl+S")),
    ("table.discard", "Discard Changes", Some("Alt+CmdOrCtrl+Z")),
];

const QUERY_ITEMS: &[Item] = &[
    ("query.run", "Run Statement", Some("CmdOrCtrl+Enter")),
    ("query.runAll", "Run All", Some("CmdOrCtrl+Shift+Enter")),
    ("", "", None),
    ("query.explain", "Explain", Some("Alt+CmdOrCtrl+E")),
    (
        "query.explainAnalyze",
        "Explain Analyze",
        Some("Alt+CmdOrCtrl+Shift+E"),
    ),
];

fn submenu<R: Runtime>(
    app: &AppHandle<R>,
    title: &str,
    items: &[Item],
) -> tauri::Result<tauri::menu::Submenu<R>> {
    let mut builder = SubmenuBuilder::new(app, title);
    for (id, label, accelerator) in items {
        if id.is_empty() {
            builder = builder.separator();
            continue;
        }
        let mut item = MenuItemBuilder::with_id(*id, *label);
        if let Some(accelerator) = accelerator {
            item = item.accelerator(*accelerator);
        }
        builder = builder.item(&item.build(app)?);
    }
    builder.build()
}

/// Builds the menu bar.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let about = AboutMetadataBuilder::new()
        .name(Some("Table++"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .build();
    let app_menu = SubmenuBuilder::new(app, "Table++")
        .about(Some(about))
        .separator()
        .item(
            &MenuItemBuilder::with_id("settings", "Settings…")
                .accelerator("CmdOrCtrl+Comma")
                .build(app)?,
        )
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .fullscreen()
        .build()?;
    MenuBuilder::new(app)
        .items(&[
            &app_menu,
            &submenu(app, "File", FILE_ITEMS)?,
            &edit,
            &submenu(app, "View", VIEW_ITEMS)?,
            &submenu(app, "Table", TABLE_ITEMS)?,
            &submenu(app, "Query", QUERY_ITEMS)?,
            &window,
        ])
        .build()
}
