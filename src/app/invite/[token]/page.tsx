import { Suspense } from "react";
import Link from "next/link";
import { findValidInvite } from "@/lib/invites";
import { InviteForm } from "./invite-form";

export const metadata = { title: "Запрошення" };

async function Content({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invite = await findValidInvite(token);
  if (!invite) {
    return (
      <div className="card space-y-3 p-5">
        <p className="text-[15px]">Це запрошення недійсне: його вже використали, скасували або минув термін дії.</p>
        <p className="text-sm text-muted">Попросіть нове посилання в того, хто вас запросив.</p>
        <Link href="/login" className="btn btn-ghost w-full">
          До входу
        </Link>
      </div>
    );
  }
  return (
    <>
      <p className="mb-6 text-sm text-muted">Вас запросили. Придумайте логін і пароль — далі входитимете з ними.</p>
      <InviteForm token={token} />
    </>
  );
}

export default function InvitePage(props: PageProps<"/invite/[token]">) {
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
