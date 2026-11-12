import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
  const u = size.width / 16;
  const bar = { background: "#f0efec", borderRadius: u * 0.4 };
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#3987e5" }}>
        <div style={{ ...bar, width: u * 1.4, height: u * 4 }} />
        <div style={{ ...bar, width: u * 1.4, height: u * 7, marginLeft: u * 0.4 }} />
        <div style={{ background: "#f0efec", width: u * 4, height: u * 1.2 }} />
        <div style={{ ...bar, width: u * 1.4, height: u * 7, marginRight: u * 0.4 }} />
        <div style={{ ...bar, width: u * 1.4, height: u * 4 }} />
      </div>
    ),
    size,
  );
}
