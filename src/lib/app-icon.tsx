/** App icon artwork (used for the favicon, the home-screen icon and the installable app). */
export function AppIcon({ size }: { size: number }) {
  const u = size / 16;
  const bar = { background: "#a4e83c", borderRadius: u * 0.45 };
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#000000" }}>
      <div style={{ ...bar, width: u * 1.2, height: u * 3.4 }} />
      <div style={{ ...bar, width: u * 1.2, height: u * 6, marginLeft: u * 0.35 }} />
      <div style={{ background: "#a4e83c", width: u * 3.2, height: u * 1.1 }} />
      <div style={{ ...bar, width: u * 1.2, height: u * 6, marginRight: u * 0.35 }} />
      <div style={{ ...bar, width: u * 1.2, height: u * 3.4 }} />
    </div>
  );
}
