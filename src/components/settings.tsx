"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Check, Copy, KeyRound, LogOut, Trash2 } from "lucide-react";
import { changePasswordAction, createTokenAction, deleteTokenAction, logoutAction } from "@/lib/actions";
import { fmtDate } from "@/lib/format";

export type TokenRow = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-plane px-3 py-2 font-mono text-xs whitespace-nowrap text-ink-2" aria-label={label}>
        {value}
      </code>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label="Скопіювати"
        className="btn btn-ghost px-3"
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
        className="flex flex-wrap gap-2"
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
        <div className="space-y-3 rounded-xl border border-accent/40 bg-accent/10 p-4">
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
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-critical"
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
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="space-y-1">
        <span className="block text-xs text-muted">Поточний пароль</span>
        <input name="current" type="password" autoComplete="current-password" required className="field w-44" />
      </label>
      <label className="space-y-1">
        <span className="block text-xs text-muted">Новий пароль</span>
        <input name="next" type="password" autoComplete="new-password" required minLength={8} className="field w-44" />
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
