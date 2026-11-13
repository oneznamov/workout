import { featureOn, sectionOn } from "./config";

/**
 * Home-screen widgets: what exists, the default order and which are shown by default.
 * The default set is short on purpose — the rest is one tap away in "Налаштувати головну".
 */
export const WIDGETS = [
  { id: "goals", label: "Цілі тижня (кільця)", shown: true, wide: false },
  { id: "muscles", label: "Мʼязи цього тижня", shown: true, wide: false },
  { id: "coach", label: "Порада тренера (ШІ)", shown: true, wide: true },
  { id: "week", label: "Тиждень і місяць", shown: true, wide: true },
  { id: "stats", label: "Показники тижня", shown: true, wide: true },
  { id: "mygoals", label: "Мої цілі: прогрес", shown: true, wide: false },
  { id: "friends", label: "Команда: рейтинг тижня", shown: true, wide: false },
  { id: "plan", label: "За планом", shown: true, wide: true },
  { id: "recent", label: "Останні тренування", shown: true, wide: true },
  { id: "minutes", label: "Хвилини по днях", shown: false, wide: false },
  { id: "weight", label: "Вага тіла", shown: false, wide: false },
  { id: "cardio", label: "Останнє кардіо", shown: false, wide: true },
  { id: "vitals", label: "Пульс спокою, HRV, сон, кроки", shown: false, wide: true },
] as const;

/** Widgets that belong to a section or feature which can be switched off in app.config.ts. */
const NEEDS: Partial<Record<string, () => boolean>> = {
  friends: () => sectionOn("team"),
  cardio: () => sectionOn("cardio"),
  coach: () => featureOn("ai"),
};

export type WidgetId = (typeof WIDGETS)[number]["id"];
/** `v` — which generation of the layout was saved; older ones get one-off adjustments. */
export type DashboardConfig = { order: string[]; hidden: string[]; v?: number };
export const DASHBOARD_VERSION = 2;
export type WidgetState = { id: WidgetId; label: string; visible: boolean; wide: boolean };

/** Applies saved preferences on top of the defaults; unknown ids are dropped, new widgets appended. */
export function resolveDashboard(config: Partial<DashboardConfig> | null | undefined): WidgetState[] {
  const known = new Map(WIDGETS.map((w) => [w.id as string, w]));
  const order = (config?.order ?? []).filter((id) => known.has(id));
  const hidden = new Set(config?.hidden ?? []);
  // A layout saved before the week card learned to show the month: "minutes by day" steps
  // aside (it is off by default now) until the athlete saves the layout again.
  if (order.length > 0 && (config?.v ?? 1) < DASHBOARD_VERSION) hidden.add("minutes");
  const ids = [...new Set([...order, ...WIDGETS.map((w) => w.id)])].filter((id) => NEEDS[id]?.() ?? true);
  const seen = new Set(order);
  return ids.map((id) => {
    const w = known.get(id)!;
    // A widget added after the layout was saved keeps its default visibility.
    const visible = seen.has(id) ? !hidden.has(id) : w.shown && !hidden.has(id);
    return { id: w.id, label: w.label, visible, wide: w.wide };
  });
}
