"use client";

import { useEffect } from "react";
import { isDemoError } from "@/components/demo-mode";
import { DEMO } from "@/lib/demo";

/** A screen that failed to render or save: say so and offer another try, instead of a blank page. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const demo = DEMO && isDemoError(error);
  useEffect(() => {
    // In the demo a refused save is not a failure — put the screen back as it was.
    if (demo) reset();
  }, [demo, reset]);
  if (demo) return null;
  return (
    <div className="card mx-auto mt-10 max-w-md space-y-3 p-6 text-center">
      <h1 className="text-xl font-bold">Щось пішло не так</h1>
      <p className="text-sm text-ink-2">Не вдалося показати цей екран. Спробуйте ще раз — якщо не допоможе, оновіть сторінку.</p>
      <button onClick={reset} className="btn btn-primary w-full">
        Спробувати ще раз
      </button>
    </div>
  );
}
