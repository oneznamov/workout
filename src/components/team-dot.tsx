import { getUserId } from "@/lib/auth";
import { countMyTeamInvites } from "@/lib/team";

/** A red dot while someone is waiting for the user to accept a team invitation. */
export async function TeamInviteDot() {
  const userId = await getUserId();
  if (!userId || (await countMyTeamInvites(userId)) === 0) return null;
  return <span role="status" aria-label="Є запрошення в команду" className="block size-2.5 rounded-full bg-critical ring-2 ring-plane" />;
}
