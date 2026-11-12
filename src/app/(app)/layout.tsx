import { Suspense } from "react";
import { Nav } from "@/components/nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Suspense>
        <Nav />
      </Suspense>
      {/* Page data streams behind the boundary from loading.tsx */}
      <main className="mx-auto w-full max-w-5xl px-4 pt-5 pb-28 md:pt-8 md:pr-8 md:pb-10 md:pl-64 lg:max-w-6xl">{children}</main>
    </>
  );
}
