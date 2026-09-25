// Saved connection profiles and their passwords.

import { backend } from "@/lib/backend";
import { toAppError, type ConnectionProfile, type PasswordStorage } from "@/lib/types";

import { useSettings } from "../settings";
import { getState, mutate, pushToast } from "../store";

const DOCUMENT = "connections";

/**
 * Passwords read during this run. Reading the keychain can prompt the user (unsigned builds get a
 * fresh identity on every rebuild), so each profile is read at most once per run.
 */
const passwordCache = new Map<string, string | null>();

function passwordStorage(): PasswordStorage {
  return useSettings.getState().settings.passwordStorage;
}

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

/** Inserts or replaces a profile and stores its password. */
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
  const stored = password === "" ? null : password;
  try {
    await persistProfiles(profiles);
    await backend().setPassword(profile.id, stored, passwordStorage());
    passwordCache.set(profile.id, stored);
  } catch (error) {
    pushToast({ tone: "error", title: "Could not save the connection", message: toAppError(error).message });
  }
}

export async function deleteProfile(id: string): Promise<void> {
  const profiles = getState().profiles.filter((p) => p.id !== id);
  mutate((draft) => {
    draft.profiles = profiles;
  });
  passwordCache.delete(id);
  try {
    await persistProfiles(profiles);
    await backend().setPassword(id, null, passwordStorage());
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

/** The stored password of a profile, read once per run. */
export async function loadPassword(id: string): Promise<string | null> {
  const cached = passwordCache.get(id);
  if (cached !== undefined) return cached;
  try {
    const password = await backend().getPassword(id, passwordStorage());
    passwordCache.set(id, password);
    return password;
  } catch {
    return null;
  }
}

/** Forgets cached passwords, e.g. when the store changes. */
export function clearPasswordCache(): void {
  passwordCache.clear();
}

/**
 * Moves every profile password from one store to the other. Returns the number moved; failures
 * on individual profiles are reported but do not stop the others.
 */
export async function migratePasswords(from: PasswordStorage, to: PasswordStorage): Promise<number> {
  if (from === to) return 0;
  let moved = 0;
  for (const profile of getState().profiles) {
    try {
      const password = passwordCache.get(profile.id) ?? (await backend().getPassword(profile.id, from));
      if (password === null) continue;
      await backend().setPassword(profile.id, password, to);
      await backend().setPassword(profile.id, null, from);
      passwordCache.set(profile.id, password);
      moved += 1;
    } catch (error) {
      pushToast({
        tone: "error",
        title: `Could not move the password of ${profile.name || profile.host}`,
        message: toAppError(error).message,
      });
    }
  }
  return moved;
}
