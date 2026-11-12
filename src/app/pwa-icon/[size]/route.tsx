import { ImageResponse } from "next/og";
import { AppIcon } from "@/lib/app-icon";

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}

export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size } = await ctx.params;
  const px = size === "192" ? 192 : 512;
  return new ImageResponse(<AppIcon size={px} />, { width: px, height: px });
}
