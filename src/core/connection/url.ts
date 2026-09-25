// libpq style connection URLs.

import type { ConnectionProfile, SslMode } from "@/lib/types";

export const DEFAULT_PORT = 5432;

export function newProfile(overrides: Partial<ConnectionProfile> = {}): ConnectionProfile {
  return {
    id: crypto.randomUUID(),
    name: "",
    host: "localhost",
    port: DEFAULT_PORT,
    database: "postgres",
    username: "postgres",
    sslMode: "disable",
    color: "none",
    group: null,
    createdAt: new Date().toISOString(),
    lastConnectedAt: null,
    ...overrides,
  };
}

export function sslModeFromLibpq(value: string): SslMode | null {
  switch (value.toLowerCase()) {
    case "disable":
    case "allow":
      return "disable";
    case "prefer":
    case "require":
    case "verify-ca":
      return "require";
    case "verify-full":
      return "verify-full";
    default:
      return null;
  }
}

export interface ParsedUrl {
  profile: ConnectionProfile;
  password: string | null;
}

export function parseConnectionUrl(input: string): ParsedUrl {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("The connection URL could not be parsed.");
  }
  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  if (scheme !== "postgres" && scheme !== "postgresql") {
    throw new Error(`Unsupported URL scheme “${scheme}”. Expected postgres:// or postgresql://.`);
  }
  const profile = newProfile();
  profile.host = decodeURIComponent(url.hostname) || "localhost";
  profile.port = url.port ? Number(url.port) : DEFAULT_PORT;
  if (url.username) profile.username = decodeURIComponent(url.username);
  const path = url.pathname.replace(/^\/+|\/+$/g, "");
  if (path) profile.database = decodeURIComponent(path);
  for (const [key, value] of url.searchParams) {
    switch (key.toLowerCase()) {
      case "sslmode": {
        const mode = sslModeFromLibpq(value);
        if (mode) profile.sslMode = mode;
        break;
      }
      case "dbname":
        profile.database = value;
        break;
      case "user":
        profile.username = value;
        break;
      case "host":
        profile.host = value;
        break;
      case "port":
        if (Number.isInteger(Number(value))) profile.port = Number(value);
        break;
      default:
        break;
    }
  }
  profile.name = `${profile.username}@${profile.host}`;
  return { profile, password: url.password ? decodeURIComponent(url.password) : null };
}

export function connectionUrl(profile: ConnectionProfile): string {
  const url = new URL("postgresql://localhost");
  url.username = profile.username;
  url.hostname = profile.host;
  url.port = String(profile.port);
  url.pathname = `/${profile.database}`;
  url.searchParams.set("sslmode", profile.sslMode);
  return url.toString();
}

export function profileDisplayName(profile: ConnectionProfile): string {
  const name = profile.name.trim();
  return name === "" ? `${profile.username}@${profile.host}/${profile.database}` : name;
}

export function profileEndpoint(profile: ConnectionProfile): string {
  return `${profile.host}:${profile.port}/${profile.database}`;
}

export function profileIssues(profile: ConnectionProfile): string[] {
  const issues: string[] = [];
  if (profile.host.trim() === "") issues.push("Host is required.");
  if (!Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) {
    issues.push("Port must be between 1 and 65535.");
  }
  if (profile.database.trim() === "") issues.push("Database is required.");
  if (profile.username.trim() === "") issues.push("Username is required.");
  return issues;
}
