// Saved connection profiles and their passwords.

import { backend } from "@/lib/backend";
import { toAppError, type ConnectionProfile } from "@/lib/types";

import { getState, mutate, pushToast } from "../store";

const DOCUMENT = "connections";

export async function loadProfiles(): Promise<void> {
  try {
    const profiles = (await backend().loadDocument<ConnectionProfile[]>(DOCUMENT)) ?? [];
    mutate((draft) => {
      draft.profiles = profiles;
    });
  } catch (error) {
    pushToast({ tone: "error", title: "Could not load connections", message: toAppError(error).message });
  }
}

async function persistProfiles(profiles: ConnectionProfile[]): Promise<void> {
  await backend().saveDocument(DOCUMENT, profiles);
}

/** Inserts or replaces a profile and stores its password in the keychain. */
export async function saveProfile(profile: ConnectionProfile, password: string | null): Promise<void> {
  const existing = getState().profiles;
  const index = existing.findIndex((p) => p.id === profile.id);
  const profiles =
    index === -1 ? [...existing, profile] : existing.map((p) => (p.id === profile.id ? profile : p));
  mutate((draft) => {
    draft.profiles = profiles;
    const connection = draft.connections[profile.id];
    if (connection) connection.profile = profile;
  });
  try {
    await persistProfiles(profiles);
    await backend().setPassword(profile.id, password === "" ? null : password);
  } catch (error) {
    pushToast({ tone: "error", title: "Could not save the connection", message: toAppError(error).message });
  }
}

export async function deleteProfile(id: string): Promise<void> {
  const profiles = getState().profiles.filter((p) => p.id !== id);
  mutate((draft) => {
    draft.profiles = profiles;
  });
  try {
    await persistProfiles(profiles);
    await backend().setPassword(id, null);
  } catch (error) {
    pushToast({
      tone: "error",
      title: "Could not delete the connection",
      message: toAppError(error).message,
    });
  }
}

export async function markConnected(id: string): Promise<void> {
  const profiles = getState().profiles.map((p) =>
    p.id === id ? { ...p, lastConnectedAt: new Date().toISOString() } : p,
  );
  mutate((draft) => {
    draft.profiles = profiles;
  });
  try {
    await persistProfiles(profiles);
  } catch {
    // Not worth interrupting the user for a timestamp.
  }
}

export async function loadPassword(id: string): Promise<string | null> {
  try {
    return await backend().getPassword(id);
  } catch {
    return null;
  }
}
