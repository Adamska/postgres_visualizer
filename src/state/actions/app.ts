// Application startup.

import { useSettings } from "../settings";
import { mutate } from "../store";
import { startConnectionWatch } from "./connections";
import { loadLayouts } from "./layouts";
import { loadProfiles } from "./profiles";
import { loadSavedViews } from "./views";
import { restoreWorkspace } from "./workspace";

export async function startApp(): Promise<void> {
  await useSettings
    .getState()
    .load()
    .catch(() => undefined);
  await loadProfiles();
  await Promise.all([loadLayouts(), loadSavedViews()]);
  if (useSettings.getState().settings.restoreWorkspace) await restoreWorkspace();
  mutate((draft) => {
    draft.ready = true;
  });
  startConnectionWatch();
}
