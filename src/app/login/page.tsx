import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasAnyUser } from "@/lib/actions";
import { LoginForm } from "./login-form";

export const metadata = { title: "Вхід" };

async function Content() {
  if (await getSessionUser()) redirect("/");
  const setup = !(await hasAnyUser());
  return <LoginForm setup={setup} />;
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-[2rem] font-bold tracking-tight">Workout</h1>
        <Suspense fallback={<p className="text-muted">Завантаження…</p>}>
          <Content />
        </Suspense>
      </div>
    </main>
  );
}
