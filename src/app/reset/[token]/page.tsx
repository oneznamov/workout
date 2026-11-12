import { Suspense } from "react";
import Link from "next/link";
import { findValidReset } from "@/lib/resets";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Новий пароль" };

async function Content({ params }: PageProps<"/reset/[token]">) {
  const { token } = await params;
  const reset = await findValidReset(token);
  if (!reset) {
    return (
      <div className="card space-y-3 p-5">
        <p className="text-[15px]">Це посилання недійсне: ним уже скористались або минув термін дії (24 години).</p>
        <p className="text-sm text-muted">Попросіть адміністратора створити нове.</p>
        <Link href="/login" className="btn btn-ghost w-full">
          До входу
        </Link>
      </div>
    );
  }
  return (
    <>
      <p className="mb-6 text-sm text-muted">
        Новий пароль для акаунта <span className="text-ink">{reset.username}</span>. Після збереження всі інші пристрої вийдуть з акаунта.
      </p>
      <ResetForm token={token} />
    </>
  );
}

export default function ResetPage(props: PageProps<"/reset/[token]">) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-[2rem] font-bold tracking-tight">Workout</h1>
        <Suspense fallback={<p className="text-muted">Завантаження…</p>}>
          <Content {...props} />
        </Suspense>
      </div>
    </main>
  );
}
