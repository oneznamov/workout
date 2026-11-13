import "server-only";
import { addDays, dayOf } from "./format";
import { getMetricSeries } from "./health";
import { readiness } from "./readiness";

/** Today's readiness from the athlete's Apple Health data. */
export async function getReadiness(userId: string) {
  const today = dayOf();
  const rows = await getMetricSeries(userId, ["sleep_analysis", "resting_heart_rate", "heart_rate_variability"], addDays(today, -24));
  return readiness(rows, today);
}
