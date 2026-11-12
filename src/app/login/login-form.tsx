"use client";

import { useActionState } from "react";
import { loginAction, setupAction } from "@/lib/actions";

export function LoginForm({ setup, next }: { setup: boolean; next?: string }) {
  const [state, action, pending] = useActionState(setup ? setupAction : loginAction, undefined);
  return (
    <>
      <p className="mb-6 text-sm text-muted">
        {setup ? "Перший запуск — створіть свій акаунт." : "Увійдіть, щоб продовжити."}
      </p>
      <form action={action} className="card space-y-4 p-5">
        {next && <input type="hidden" name="next" value={next} />}
        <label className="block space-y-1.5">
          <span className="text-sm text-ink-2">Логін</span>
          <input name="username" autoComplete="username" autoCapitalize="none" required className="field" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-ink-2">Пароль</span>
          <input
            name="password"
            type="password"
            autoComplete={setup ? "new-password" : "current-password"}
            required
            minLength={8}
            className="field"
          />
        </label>
        {state?.error && (
          <p role="alert" className="text-sm text-critical">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? "Зачекайте…" : setup ? "Створити акаунт" : "Увійти"}
        </button>
      </form>
    </>
  );
}
