"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Download } from "lucide-react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const noop = () => () => undefined;

/** "Install as an app" — a button where the browser supports it, instructions for iPhone. */
export function InstallCard() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const standalone = useSyncExternalStore(
    noop,
    () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true,
    () => false,
  );
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone) {
    return (
      <p className="flex items-center gap-2 text-[15px]">
        <Check size={17} className="text-good" strokeWidth={3} /> Застосунок встановлено на цьому пристрої.
      </p>
    );
  }
  return (
    <div className="space-y-3 text-sm text-ink-2">
      {prompt && (
        <button
          onClick={async () => {
            await prompt.prompt();
            setPrompt(null);
          }}
          className="btn btn-primary"
        >
          <Download size={17} /> Встановити застосунок
        </button>
      )}
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <span className="text-ink">iPhone (Safari):</span> кнопка «Поділитися» → «На початковий екран».
        </li>
        <li>
          <span className="text-ink">Android (Chrome):</span> меню ⋮ → «Встановити застосунок».
        </li>
        <li>
          <span className="text-ink">Компʼютер (Chrome/Edge):</span> значок встановлення в адресному рядку.
        </li>
      </ul>
      <p className="text-xs text-muted">
        Встановлений застосунок відкривається без адресного рядка й працює без звʼязку: заплановані тренування та шаблони
        зберігаються на пристрої, а зроблене в залі надсилається на сервер, коли зʼявиться інтернет.
      </p>
    </div>
  );
}
