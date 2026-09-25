import { ArrowRight, Database, Plus } from "lucide-react";

import { ColorDot } from "@/components/Primitives";
import { Button } from "@/components/ui/Button";
import { profileDisplayName, profileEndpoint } from "@/core/connection/url";
import { connect } from "@/state/actions/connections";
import { openDialog, useAppStore } from "@/state/store";

export function WelcomeScreen() {
  const profiles = useAppStore((s) => s.profiles);
  const recent = [...profiles]
    .sort((a, b) => (b.lastConnectedAt ?? "").localeCompare(a.lastConnectedAt ?? ""))
    .slice(0, 6);

  return (
    <div className="flex h-full flex-col items-center justify-center p-10" data-tauri-drag-region>
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="flex size-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-accent to-[#7c5cff] text-white shadow-[0_12px_30px_-10px_rgb(79_107_255/0.7)]">
          <Database className="size-8" />
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight">Table++</h1>
        <p className="max-w-md text-[13px] text-fg-muted">
          Connect to a PostgreSQL database to browse, query and edit its tables.
        </p>
      </div>
      {recent.length > 0 ? (
        <div className="flex w-[380px] flex-col gap-2">
          {recent.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => void connect(profile)}
              className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[transform,box-shadow,border-color] hover:-translate-y-px hover:border-accent/40 hover:shadow-pop"
            >
              <ColorDot color={profile.color} size={10} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-fg">
                  {profileDisplayName(profile)}
                </span>
                <span className="block truncate text-[11.5px] text-fg-muted">{profileEndpoint(profile)}</span>
              </span>
              <ArrowRight className="size-4 text-fg-subtle transition-colors group-hover:text-accent" />
            </button>
          ))}
          <Button
            variant="link"
            className="mt-2 self-center"
            onClick={() => openDialog({ kind: "connection", profileId: null })}
          >
            New connection…
          </Button>
        </div>
      ) : (
        <Button
          variant="primary"
          size="lg"
          icon={<Plus className="size-4" />}
          onClick={() => openDialog({ kind: "connection", profileId: null })}
        >
          New connection
        </Button>
      )}
    </div>
  );
}
