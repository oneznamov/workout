import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { AiSettings } from "@/components/ai";
import { InstallCard } from "@/components/install";
import { CopyField, DataAndSecurity, LogoutButton, PasswordForm, TokensManager } from "@/components/settings";
import { Card, Disclosure, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { getAiState } from "@/lib/ai";
import { getUser } from "@/lib/auth";

export const metadata = { title: "Налаштування" };

async function Content() {
  const user = await getUser();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const tokens = await db
    .select({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, createdAt: apiTokens.createdAt, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .where(eq(apiTokens.userId, user.id))
    .orderBy(desc(apiTokens.createdAt));
  const ai = await getAiState(user.id);

  return (
    <>
      <PageHeader title="Налаштування" subtitle={`Акаунт: ${user.username}`} actions={<LogoutButton />} />
      {/* Phone: one column. Desktop: the account on the left, connection guides on the right. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          {user.isAdmin && (
            <Link href="/admin" className="card flex items-center justify-between gap-3 p-4 hover:bg-surface-2">
              <span>
                <span className="block text-[15px] font-semibold">Користувачі та запрошення</span>
                <span className="block text-xs text-muted">Запросити когось за посиланням, керувати акаунтами</span>
              </span>
              <span className="text-accent">→</span>
            </Link>
          )}

          <Link href="/profile" className="card flex items-center justify-between gap-3 p-4 hover:bg-surface-2">
            <span>
              <span className="block text-[15px] font-semibold">Профіль і цілі</span>
              <span className="block text-xs text-muted">Дані про себе, заміри тіла, цілі — те, що читає ШІ</span>
            </span>
            <span className="text-accent">→</span>
          </Link>

          <Card title="Токени доступу">
            <p className="mb-4 text-sm text-ink-2">
              Токен дає доступ до ваших даних без пароля — для Claude та для синхронізації Apple Health. Створіть окремий токен
              для кожного підключення.
            </p>
            <TokensManager
              origin={origin}
              tokens={tokens.map((t) => ({ ...t, createdAt: t.createdAt.toISOString(), lastUsedAt: t.lastUsedAt?.toISOString() ?? null }))}
            />
          </Card>

          <Disclosure title="Резервна копія та безпека" hint="Завантажити дані, вийти на інших пристроях">
            <DataAndSecurity />
          </Disclosure>

          <Disclosure title="Змінити пароль">
            <PasswordForm />
          </Disclosure>
        </div>
        <div className="space-y-5">
          <Card title="ШІ-помічник" action={ai ? <span className="rounded-full bg-good/20 px-2.5 py-0.5 text-xs font-medium text-good">Підключено</span> : undefined}>
            <AiSettings state={ai} />
          </Card>

          <Disclosure title="Підключити Claude" hint="Планування та аналіз тренувань">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-2">
              <li>Створіть токен у розділі «Токени доступу» (наприклад, «Claude»).</li>
              <li>
                У claude.ai: <span className="text-ink">Settings → Connectors → Add custom connector</span> і вставте адресу з
                токеном, яку покаже форма. У Claude Code — виконайте показану команду.
              </li>
              <li>
                Пишіть Claude: «склади мені тренування ніг на завтра», «проаналізуй мій прогрес у жимі за 3 місяці», «заміни
                присідання на жим ногами в поточному тренуванні».
              </li>
            </ol>
            <div className="mt-3">
              <CopyField value={`${origin}/api/mcp`} label="Адреса MCP-сервера" />
            </div>
            <p className="mt-3 text-xs text-muted">
              Для будь-якого іншого ШІ чи скрипта: усе про вас і тренування одним документом —{" "}
              <code className="font-mono text-ink">GET {origin}/api/context</code> із заголовком{" "}
              <code className="font-mono text-ink">Authorization: Bearer ваш_токен</code>. Claude читає те саме через інструмент{" "}
              <code className="font-mono text-ink">get_athlete_context</code>.
            </p>
          </Disclosure>

          <Disclosure title="Підключити Apple Watch" hint="Синхронізація Apple Health">
            <p className="text-sm text-ink-2">
              Сайт не може сам читати Apple Health — дані має надсилати iPhone. Найпростіше через застосунок{" "}
              <span className="text-ink">Health Auto Export</span> (App Store):
            </p>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-ink-2">
              <li>Створіть токен у розділі «Токени доступу» (наприклад, «iPhone»).</li>
              <li>
                У Health Auto Export: <span className="text-ink">Automations → New Automation → REST API</span>. URL — адреса
                нижче, метод POST, формат JSON.
              </li>
              <li>
                Додайте заголовок <code className="font-mono text-ink">Authorization</code> зі значенням{" "}
                <code className="font-mono text-ink">Bearer ваш_токен</code>.
              </li>
              <li>
                Створіть дві автоматизації: <span className="text-ink">Health Metrics</span> (вага, пульс спокою, HRV, VO₂ max,
                кроки, калорії, сон; Summarize Data — по днях) і <span className="text-ink">Workouts</span> (увімкніть «Include
                Workout Metrics», Time Grouping — <span className="text-ink">Seconds</span>: так пульс точніший і краще видно
                відпочинок між підходами). Date Range — Default, синхронізація щогодини або частіше.
              </li>
            </ol>
            <div className="mt-3">
              <CopyField value={`${origin}/api/health`} label="Адреса для Apple Health" />
            </div>
            <p className="mt-3 text-xs text-muted">
              Тренування з годинника (стандартна програма «Тренування») автоматично привʼязується до запису в щоденнику, якщо
              вони перетинаються в часі: запустіть «Силове тренування» на годиннику й тренування тут — пульс і калорії
              зʼявляться в записі після синхронізації.
            </p>
          </Disclosure>

          <Disclosure title="Застосунок на телефоні" hint="Встановлення та робота без звʼязку">
            <InstallCard />
          </Disclosure>
        </div>
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
