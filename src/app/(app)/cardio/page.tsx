import { redirect } from "next/navigation";

/** Cardio no longer has a tab of its own: sessions live with the workouts, the charts in analytics. */
export default function Page() {
  redirect("/workouts?t=cardio");
}
