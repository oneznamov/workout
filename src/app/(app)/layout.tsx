import { Suspense } from "react";
import { OfflineBoot } from "@/components/connection";
import { Nav } from "@/components/nav";
import { TeamInviteDot } from "@/components/team-dot";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <OfflineBoot />
      <Suspense>
        <Nav
          teamBadge={
            <Suspense fallback={null}>
              <TeamInviteDot />
            </Suspense>
          }
        />
      </Suspense>
      {/* Desktop: the page lives in the area to the right of the sidebar and is centred there, not in the whole window. */}
      <main className="px-4 pt-[calc(4.25rem+env(safe-area-inset-top))] pb-28 md:ml-60 md:px-8 md:pt-8 md:pb-10 xl:px-10">
        <div className="mx-auto w-full max-w-[75rem]">{children}</div>
      </main>
    </>
  );
}
