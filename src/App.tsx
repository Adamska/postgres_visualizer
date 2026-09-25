import { useEffect } from "react";

import { TooltipProvider } from "@/components/ui/Overlay";
import { Dialogs } from "@/features/shell/Dialogs";
import { Toasts } from "@/features/shell/Toasts";
import { Inspector } from "@/features/inspector/Inspector";
import { Sidebar } from "@/features/sidebar/Sidebar";
import { Workspace } from "@/features/workspace/Workspace";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useTheme } from "@/hooks/useTheme";
import { installBackend } from "@/lib/backend";
import { isTauri } from "@/lib/platform";
import { startApp } from "@/state/actions/app";
import { useAppStore } from "@/state/store";

if (!isTauri()) {
  // Browser preview: run against the in-memory backend so the UI can be developed without Tauri.
  const { createMockBackend } = await import("@/test/mockBackend");
  const { installPreviewData } = await import("@/test/previewData");
  const mock = createMockBackend();
  installPreviewData(mock);
  installBackend(mock);
  // Lets the screenshot script drive the mock (e.g. simulate a lost server).
  (window as { __tableppMock?: unknown }).__tableppMock = mock;
}

export function App() {
  useTheme();
  useShortcuts();
  const ready = useAppStore((s) => s.ready);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const inspectorOpen = useAppStore((s) => s.inspectorOpen);

  useEffect(() => {
    void startApp();
  }, []);

  return (
    <TooltipProvider>
      <div className="flex h-full w-full overflow-hidden text-fg">
        {sidebarOpen && <Sidebar />}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
          {ready ? <Workspace /> : <div className="h-11 shrink-0" data-tauri-drag-region />}
        </main>
        {inspectorOpen && <Inspector />}
      </div>
      <Dialogs />
      <Toasts />
    </TooltipProvider>
  );
}
