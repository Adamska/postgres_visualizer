// Application startup.

import { useSettings } from "../settings";
import { mutate } from "../store";
import { loadProfiles } from "./profiles";
import { restoreWorkspace } from "./workspace";

export async function startApp(): Promise<void> {
  await useSettings
    .getState()
    .load()
    .catch(() => undefined);
  await loadProfiles();
  if (useSettings.getState().settings.restoreWorkspace) await restoreWorkspace();
  mutate((draft) => {
    draft.ready = true;
  });
}
