import { Button } from "@/components/ui/Button";
import { Segmented, Select, Switch } from "@/components/ui/Controls";
import { Dialog } from "@/components/ui/Overlay";
import { PAGE_SIZES } from "@/core/query/tableQuery";
import type { PasswordStorage } from "@/lib/types";
import { migratePasswords } from "@/state/actions/profiles";
import { useSettings, type ThemeSetting } from "@/state/settings";
import { closeDialog, pushToast } from "@/state/store";

const LIMITS = [200, 500, 1000, 5000, 10000, 50000];

export function SettingsDialog() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const numberOptions = (values: number[]) =>
    values.map((v) => ({ value: String(v), label: v.toLocaleString("en-US") }));
  const changePasswordStorage = async (storage: PasswordStorage) => {
    const previous = settings.passwordStorage;
    if (storage === previous) return;
    await update({ passwordStorage: storage });
    const moved = await migratePasswords(previous, storage);
    if (moved > 0) {
      pushToast({
        tone: "success",
        title: `Moved ${moved} password${moved === 1 ? "" : "s"} to the ${storage === "file" ? "app folder" : "keychain"}`,
      });
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeDialog()}
      title="Settings"
      width={520}
      footer={
        <Button variant="primary" onClick={closeDialog}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <Section title="Appearance">
          <Row label="Theme">
            <Segmented<ThemeSetting>
              size="sm"
              value={settings.theme}
              onChange={(theme) => void update({ theme })}
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </Row>
          <Row label="Editor font size">
            <Select
              size="sm"
              value={String(settings.editorFontSize)}
              onChange={(v) => void update({ editorFontSize: Number(v) })}
              options={numberOptions([11, 12, 13, 14, 15, 16, 18])}
              className="w-24"
            />
          </Row>
          <Row label="Grid font size">
            <Select
              size="sm"
              value={String(settings.gridFontSize)}
              onChange={(v) => void update({ gridFontSize: Number(v) })}
              options={numberOptions([11, 12, 13, 14, 15, 16])}
              className="w-24"
            />
          </Row>
        </Section>
        <Section title="Data">
          <Row label="Default rows per page">
            <Select
              size="sm"
              value={String(settings.pageSize)}
              onChange={(v) => void update({ pageSize: Number(v) })}
              options={numberOptions(PAGE_SIZES)}
              className="w-28"
            />
          </Row>
          <Row label="Query result limit">
            <Select
              size="sm"
              value={String(settings.queryRowLimit)}
              onChange={(v) => void update({ queryRowLimit: Number(v) })}
              options={numberOptions(LIMITS)}
              className="w-28"
            />
          </Row>
        </Section>
        <Section title="Behaviour">
          <Switch
            checked={settings.restoreWorkspace}
            onChange={(v) => void update({ restoreWorkspace: v })}
            label="Reopen connections and tabs at launch"
          />
          <Switch
            checked={settings.showSystemSchemas}
            onChange={(v) => void update({ showSystemSchemas: v })}
            label="Show system schemas"
            description="pg_catalog, information_schema…"
          />
          <Switch
            checked={settings.confirmBeforeCommit}
            onChange={(v) => void update({ confirmBeforeCommit: v })}
            label="Show the SQL preview before committing"
          />
        </Section>
        <Section title="Passwords">
          <Row label="Store passwords in">
            <Segmented<PasswordStorage>
              size="sm"
              value={settings.passwordStorage}
              onChange={(v) => void changePasswordStorage(v)}
              options={[
                { value: "keychain", label: "Keychain" },
                { value: "file", label: "App folder" },
              ]}
            />
          </Row>
          <p className="pb-1 text-[11.5px] leading-relaxed text-fg-subtle">
            {settings.passwordStorage === "keychain"
              ? "The macOS keychain asks for permission until it trusts this build; unsigned builds are trusted per build, so a rebuild asks again. Passwords are read once per launch."
              : "Passwords are kept unencrypted in secrets.json inside the app's data folder, readable only by your user account. No keychain prompts."}
          </p>
        </Section>
      </div>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{title}</h2>
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-sunken/50 px-4 py-2">
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[13px]">{label}</span>
      {children}
    </div>
  );
}
