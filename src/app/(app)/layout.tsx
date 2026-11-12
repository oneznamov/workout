import { Suspense } from "react";
import { OfflineBoot } from "@/components/connection";
import { Nav } from "@/components/nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <OfflineBoot />
      <Suspense>
        <Nav />
      </Suspense>
      <main className="mx-auto w-full max-w-5xl px-4 pt-[calc(3.75rem+env(safe-area-inset-top))] pb-28 md:pt-8 md:pr-8 md:pb-10 md:pl-[17rem] lg:max-w-6xl">
        {children}
      </main>
    </>
  );
}
