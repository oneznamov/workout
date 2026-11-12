"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "@/lib/actions";

export function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction.bind(null, token), undefined);
  return (
    <form action={action} className="card space-y-4 p-5">
      <label className="block space-y-1.5">
        <span className="text-sm text-ink-2">Логін</span>
        <input name="username" autoComplete="username" autoCapitalize="none" required minLength={2} className="field" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm text-ink-2">Пароль (щонайменше 8 символів)</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={8} className="field" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm text-ink-2">Пароль ще раз</span>
        <input name="confirm" type="password" autoComplete="new-password" required minLength={8} className="field" />
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-critical">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Зачекайте…" : "Створити акаунт"}
      </button>
    </form>
  );
}
