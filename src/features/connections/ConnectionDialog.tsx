import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { ColorDot } from "@/components/Primitives";
import { PROFILE_COLORS } from "@/lib/colors";
import { Button, Spinner } from "@/components/ui/Button";
import { Select, Switch } from "@/components/ui/Controls";
import { Field, Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Overlay";
import { newProfile, parseConnectionUrl, profileIssues } from "@/core/connection/url";
import { backend } from "@/lib/backend";
import {
  toAppError,
  type ConnectionEnvironment,
  type ConnectionProfile,
  type ProfileColor,
  type SslMode,
} from "@/lib/types";
import { connect, connectionParams } from "@/state/actions/connections";
import { deleteProfile, loadPassword, saveProfile } from "@/state/actions/profiles";
import { closeDialog, useAppStore } from "@/state/store";

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; version: string }
  | { kind: "error"; message: string };

const SSL_OPTIONS: { value: SslMode; label: string }[] = [
  { value: "disable", label: "Disabled" },
  { value: "require", label: "Required (no verification)" },
  { value: "verify-full", label: "Verify full" },
];

const ENVIRONMENT_OPTIONS: { value: ConnectionEnvironment; label: string }[] = [
  { value: "none", label: "Not set" },
  { value: "development", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "production", label: "Production" },
];

const COLOR_OPTIONS = (Object.keys(PROFILE_COLORS) as ProfileColor[]).map((color) => ({
  value: color,
  label: color === "none" ? "None" : color.charAt(0).toUpperCase() + color.slice(1),
  icon: <ColorDot color={color} size={10} />,
}));

export function ConnectionDialog({ profileId }: { profileId: string | null }) {
  const existing = useAppStore((s) => s.profiles.find((p) => p.id === profileId));
  const isNew = existing === undefined;
  const [profile, setProfile] = useState<ConnectionProfile>(() => existing ?? newProfile());
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (existing) void loadPassword(existing.id).then((stored) => setPassword(stored ?? ""));
  }, [existing]);

  const issues = profileIssues(profile);
  const patch = (changes: Partial<ConnectionProfile>) => setProfile((p) => ({ ...p, ...changes }));

  const applyUrl = () => {
    try {
      const parsed = parseConnectionUrl(url);
      setProfile((p) => ({
        ...parsed.profile,
        id: p.id,
        name: p.name || parsed.profile.name,
        color: p.color,
        group: p.group,
        createdAt: p.createdAt,
      }));
      if (parsed.password !== null) setPassword(parsed.password);
      setUrl("");
    } catch (error) {
      setTest({ kind: "error", message: toAppError(error).message });
    }
  };

  const runTest = async () => {
    setTest({ kind: "testing" });
    try {
      const version = await backend().testConnection(
        connectionParams(profile, password === "" ? null : password),
      );
      setTest({ kind: "ok", version });
    } catch (error) {
      setTest({ kind: "error", message: toAppError(error).message });
    }
  };

  const save = async () => {
    await saveProfile(profile, password);
    closeDialog();
    if (isNew) void connect(profile);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeDialog()}
      title={isNew ? "New connection" : "Edit connection"}
      width={560}
      footer={
        <>
          {!isNew && !confirmDelete && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => setConfirmDelete(true)}>
              Delete…
            </Button>
          )}
          {!isNew && confirmDelete && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => {
                void deleteProfile(profile.id);
                closeDialog();
              }}
            >
              Confirm delete
            </Button>
          )}
          <Button onClick={() => closeDialog()}>Cancel</Button>
          <Button variant="primary" disabled={issues.length > 0} onClick={() => void save()}>
            {isNew ? "Save & connect" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="grid grid-cols-[1fr_150px] gap-3">
          <Field label="Name">
            <Input
              value={profile.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Production, Local…"
              autoFocus
            />
          </Field>
          <Field label="Color">
            <Select
              value={profile.color}
              onChange={(color) => patch({ color })}
              options={COLOR_OPTIONS}
              ariaLabel="Color"
            />
          </Field>
        </div>
        <Field label="Group" hint="Optional. Groups saved connections in the sidebar.">
          <Input
            value={profile.group ?? ""}
            onChange={(e) => patch({ group: e.target.value === "" ? null : e.target.value })}
            placeholder="Production"
          />
        </Field>
        <div className="grid grid-cols-[1fr_1fr] items-end gap-3">
          <Field
            label="Environment"
            hint={
              profile.environment === "production"
                ? "Tinted window, and every write asks for confirmation."
                : "Production connections get a tinted window and confirmations."
            }
          >
            <Select
              value={profile.environment}
              onChange={(environment) =>
                patch({
                  environment,
                  // A production connection with no colour gets red, so it stands out at once.
                  color: environment === "production" && profile.color === "none" ? "red" : profile.color,
                })
              }
              options={ENVIRONMENT_OPTIONS}
              ariaLabel="Environment"
            />
          </Field>
          <div className="pb-5">
            <Switch
              checked={profile.readOnly}
              onChange={(readOnly) => patch({ readOnly })}
              label="Read-only"
              description="Sessions refuse writes; applies on connect."
            />
          </div>
        </div>
        <div className="my-1 h-px bg-line" />
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="Host">
            <Input value={profile.host} onChange={(e) => patch({ host: e.target.value })} mono />
          </Field>
          <Field label="Port">
            <Input
              type="number"
              value={profile.port}
              onChange={(e) => patch({ port: Number(e.target.value) })}
              mono
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Database">
            <Input value={profile.database} onChange={(e) => patch({ database: e.target.value })} mono />
          </Field>
          <Field label="User">
            <Input value={profile.username} onChange={(e) => patch({ username: e.target.value })} mono />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} mono />
          </Field>
          <Field label="SSL">
            <Select
              value={profile.sslMode}
              onChange={(sslMode) => patch({ sslMode })}
              options={SSL_OPTIONS}
              ariaLabel="SSL mode"
            />
          </Field>
        </div>
        <Field label="Import from URL" hint="Paste a postgresql:// URL to fill the fields above.">
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="postgresql://user:password@host:5432/database"
              mono
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && applyUrl()}
            />
            <Button disabled={url.trim() === ""} onClick={applyUrl}>
              Apply
            </Button>
          </div>
        </Field>
        <div className="flex items-center gap-3">
          <Button disabled={issues.length > 0 || test.kind === "testing"} onClick={() => void runTest()}>
            Test connection
          </Button>
          {test.kind === "testing" && <Spinner className="size-4 text-fg-muted" />}
          {test.kind === "ok" && (
            <span className="flex items-center gap-1.5 text-[12.5px] text-success">
              <CheckCircle2 className="size-4" /> Connected · PostgreSQL {test.version}
            </span>
          )}
          {test.kind === "error" && (
            <span className="flex items-center gap-1.5 text-[12.5px] text-danger" title={test.message}>
              <XCircle className="size-4 shrink-0" /> <span className="line-clamp-2">{test.message}</span>
            </span>
          )}
          {test.kind === "idle" && issues.length > 0 && (
            <span className="text-[12px] text-fg-subtle">{issues[0]}</span>
          )}
        </div>
      </div>
    </Dialog>
  );
}
