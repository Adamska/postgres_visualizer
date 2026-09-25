// File dialogs and clipboard, falling back to browser APIs outside Tauri.

import { isTauri } from "./platform";

export async function copyText(text: string): Promise<void> {
  if (isTauri()) {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(text);
  } else {
    await navigator.clipboard.writeText(text);
  }
}

export async function saveTextFile(defaultName: string, contents: string): Promise<boolean> {
  if (!isTauri()) {
    const blob = new Blob([contents], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = defaultName;
    link.click();
    URL.revokeObjectURL(link.href);
    return true;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  const path = await save({ defaultPath: defaultName });
  if (!path) return false;
  await writeTextFile(path, contents);
  return true;
}

export interface OpenedFile {
  name: string;
  contents: string;
}

export async function openTextFile(extensions: string[]): Promise<OpenedFile | null> {
  if (!isTauri()) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = extensions.map((e) => `.${e}`).join(",");
      input.onchange = async () => {
        const file = input.files?.[0];
        resolve(file ? { name: file.name, contents: await file.text() } : null);
      };
      input.click();
    });
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  const path = await open({ multiple: false, filters: [{ name: "Files", extensions }] });
  if (typeof path !== "string") return null;
  return { name: path.split("/").pop() ?? path, contents: await readTextFile(path) };
}
