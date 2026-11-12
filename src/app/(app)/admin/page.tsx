import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ErrorList, InviteManager, UserList } from "@/components/admin";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { getAdmin } from "@/lib/auth";
import { recentErrors } from "@/lib/errors";
import { listInvites, listUsers } from "@/lib/invites";

export const metadata = { title: "Користувачі" };

async function Content() {
  const admin = await getAdmin();
  if (!admin) notFound();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const [users, invites, errors] = await Promise.all([listUsers(), listInvites(), recentErrors(40)]);
  const names = new Map(users.map((u) => [u.id, u.username]));
  const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

  return (
    <>
      <PageHeader
        title="Користувачі"
        subtitle={
          <Link href="/settings" className="text-accent">
            ← Налаштування
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 xl:items-start">
        <Card title="Запросити">
          <p className="mb-4 text-sm text-ink-2">
            Реєстрація закрита. Новий користувач може зайти вперше лише за посиланням-запрошенням: там він сам задає логін і
            двічі вводить пароль.
          </p>
          <InviteManager
            origin={origin}
            invites={invites.map((i) => ({
              ...i,
              createdAt: iso(i.createdAt)!,
              expiresAt: iso(i.expiresAt)!,
              usedAt: iso(i.usedAt),
            }))}
          />
        </Card>
        <Card title={`Акаунти · ${users.length}`}>
          <UserList
            origin={origin}
            selfId={admin.id}
            users={users.map((u) => ({ ...u, createdAt: iso(u.createdAt)!, lastWorkoutAt: iso(u.lastWorkoutAt) }))}
          />
          <p className="mt-3 text-xs text-muted">
            Кожен бачить лише власні тренування, показники й токени. Ключ біля акаунта створює посилання для нового пароля.
          </p>
        </Card>
        <Card title={`Помилки · ${errors.length}`} className="xl:col-span-2">
          <ErrorList
            errors={errors.map((e) => ({
              id: e.id,
              source: e.source,
              message: e.message,
              detail: e.detail,
              path: e.path,
              createdAt: iso(e.createdAt)!,
              username: e.userId ? (names.get(e.userId) ?? null) : null,
            }))}
          />
        </Card>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}
