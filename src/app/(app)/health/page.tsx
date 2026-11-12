import { redirect } from "next/navigation";

/** The health tab became the profile; old links and bookmarks still land in the right place. */
export default function Page() {
  redirect("/profile");
}
