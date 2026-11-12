"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Download, KeyRound, LogOut, ShieldCheck, Trash2, Upload } from "lucide-react";
import { changePasswordAction, createTokenAction, deleteTokenAction, logoutAction, signOutOthersAction } from "@/lib/actions";
import { fmtDate } from "@/lib/format";
import type { ImportResult } from "@/lib/import-schema";

export type TokenRow = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-plane px-3 py-2.5 font-mono text-xs whitespace-nowrap text-ink-2" aria-label={label}>
        {value}
      </code>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label="Скопіювати"
        className="icon-btn bg-surface-2"
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  );
}

export function TokensManager({ tokens, origin }: { tokens: TokenRow[]; origin: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <form
        className="grid gap-2 sm:flex"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setFresh(await createTokenAction(name || "Токен"));
            setName("");
            router.refresh();
          });
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Назва: Claude, iPhone…" aria-label="Назва токена" className="field min-w-0 flex-1" />
        <button type="submit" disabled={pending} className="btn btn-primary">
          <KeyRound size={16} /> Створити токен
        </button>
      </form>

      {fresh && (
        <div className="space-y-3 rounded-2xl bg-accent/10 p-4">
          <p className="text-sm">Новий токен — скопіюйте зараз, пізніше його не буде видно:</p>
          <CopyField value={fresh} label="Токен" />
          <p className="text-xs text-ink-2">Адреса для Claude (звичайний конектор у claude.ai):</p>
          <CopyField value={`${origin}/api/mcp?key=${fresh}`} label="Адреса MCP з токеном" />
          <p className="text-xs text-ink-2">Команда для Claude Code:</p>
          <CopyField value={`claude mcp add --transport http workout ${origin}/api/mcp --header "Authorization: Bearer ${fresh}"`} label="Команда для Claude Code" />
        </div>
      )}

      {tokens.length > 0 && (
        <ul className="divide-y divide-line">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{t.name}</span>
                <span className="block text-xs text-muted">
                  <code className="font-mono">{t.prefix}…</code> · створено {fmtDate(t.createdAt)} ·{" "}
                  {t.lastUsedAt ? `використано ${fmtDate(t.lastUsedAt)}` : "ще не використовувався"}
                </span>
              </span>
              <button
                aria-label={`Видалити токен ${t.name}`}
                onClick={() =>
                  window.confirm(`Видалити токен «${t.name}»? Усе, що ним користується, втратить доступ.`) &&
                  start(async () => {
                    await deleteTokenAction(t.id);
                    router.refresh();
                  })
                }
                className="icon-btn size-9 hover:text-critical"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="grid items-end gap-2 sm:flex sm:flex-wrap">
      <label className="space-y-1">
        <span className="block text-xs text-muted">Поточний пароль</span>
        <input name="current" type="password" autoComplete="current-password" required className="field sm:w-44" />
      </label>
      <label className="space-y-1">
        <span className="block text-xs text-muted">Новий пароль</span>
        <input name="next" type="password" autoComplete="new-password" required minLength={8} className="field sm:w-44" />
      </label>
      <button type="submit" disabled={pending} className="btn btn-ghost">
        Змінити
      </button>
      {state?.error && (
        <p role="alert" className="w-full text-sm text-critical">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="w-full text-sm text-ink-2">Пароль змінено.</p>}
    </form>
  );
}

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="btn btn-ghost">
        <LogOut size={16} /> Вийти
      </button>
    </form>
  );
}

/** Download a copy of everything, and sign every other device out. */
type ImportState = { busy?: boolean; error?: string; result?: ImportResult };

/** Reads an export file on the device and sends it up in parts small enough for one request each. */
async function uploadExport(file: File): Promise<ImportResult> {
  const data = JSON.parse(await file.text()) as Record<string, unknown>;
  if (data.format !== "workout-export") throw new Error("format");
  // Watch sessions come back by themselves with the next Apple Health sync — and they are heavy.
  delete data.watchWorkouts;
  const metrics = Array.isArray(data.healthMetrics) ? (data.healthMetrics as unknown[]) : [];
  const parts: Record<string, unknown>[] = [{ ...data, healthMetrics: [] }];
  for (let i = 0; i < metrics.length; i += 4000) parts.push({ format: data.format, version: data.version, healthMetrics: metrics.slice(i, i + 4000) });
  const total: ImportResult = { workouts: 0, programs: 0, exercises: 0, metrics: 0, notes: 0, skipped: 0, profile: false };
  for (const part of parts) {
    const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(part) });
    if (!res.ok) throw new Error(res.status === 400 ? "format" : res.status === 413 ? "size" : "server");
    const { result } = (await res.json()) as { result: ImportResult };
    total.workouts += result.workouts;
    total.programs += result.programs;
    total.exercises += result.exercises;
    total.metrics += result.metrics;
    total.notes += result.notes;
    total.skipped += result.skipped;
    total.profile ||= result.profile;
  }
  return total;
}

const IMPORT_ERROR: Record<string, string> = {
  format: "Це не файл експорту Workout — потрібен JSON, збережений кнопкою «Усі дані».",
  size: "Файл завеликий для імпорту.",
  server: "Не вдалося імпортувати. Перевірте звʼязок і спробуйте ще раз.",
};

export function DataAndSecurity({ ai = false }: { ai?: boolean }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [withAi, setWithAi] = useState(ai);
  const [imp, setImp] = useState<ImportState>({});
  const [pending, start] = useTransition();
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setImp({ busy: true });
    try {
      setImp({ result: await uploadExport(file) });
      router.refresh();
    } catch (e) {
      const code = e instanceof SyntaxError ? "format" : e instanceof Error && e.message in IMPORT_ERROR ? e.message : "server";
      setImp({ error: IMPORT_ERROR[code] });
    }
  };
  const r = imp.result;
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm text-ink-2">Копія всіх ваших даних: тренування, програми з історією змін, профіль, показники — і пояснення ШІ до його планів.</p>
        <div className="grid gap-2 sm:flex">
          <a href={withAi ? "/api/export?ai=1" : "/api/export"} download className="btn btn-ghost">
            <Download size={17} /> Усі дані (JSON)
          </a>
          <a href="/api/export?format=csv" download className="btn btn-ghost">
            <Download size={17} /> Підходи таблицею (CSV)
          </a>
        </div>
        {ai && (
          <label className="mt-2.5 flex items-start gap-2.5 text-sm text-ink-2">
            <input type="checkbox" checked={withAi} onChange={(e) => setWithAi(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
            <span>Додати свіжий короткий аналіз від ШІ: де ви зараз і чому він складав плани саме так. Файл готується до пів хвилини.</span>
          </label>
        )}
      </div>
      <div>
        <p className="mb-2 text-sm text-ink-2">Імпорт із такого файлу лише додає те, чого бракує: наявні тренування й записи не змінюються.</p>
        <label className={`btn btn-ghost w-full sm:w-auto ${imp.busy ? "pointer-events-none opacity-60" : ""}`}>
          <Upload size={17} /> {imp.busy ? "Імпортую…" : "Імпортувати з файлу"}
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            disabled={imp.busy}
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {imp.error && (
          <p role="alert" className="mt-2 text-sm text-critical">
            {imp.error}
          </p>
        )}
        {r && (
          <p role="status" className="mt-2 text-sm text-good">
            Додано: тренувань — {r.workouts}, програм — {r.programs}, вправ — {r.exercises}, записів показників — {r.metrics}
            {r.notes > 0 && `, оглядів ШІ — ${r.notes}`}
            {r.profile && ", доповнено профіль"}.{r.skipped > 0 && ` Пропущено (вже є або ще триває): ${r.skipped}.`}
          </p>
        )}
      </div>
      <div>
        <p className="mb-2 text-sm text-ink-2">Якщо телефон загубився або ви входили на чужому пристрої:</p>
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await signOutOthersAction();
              setDone(true);
            })
          }
          className="btn btn-ghost w-full sm:w-auto"
        >
          <ShieldCheck size={17} /> {done ? "Інші пристрої вийшли" : "Вийти на всіх інших пристроях"}
        </button>
      </div>
    </div>
  );
}
