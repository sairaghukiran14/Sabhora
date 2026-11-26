/** The 1200x630 link-preview card, drawn by next/og (Satori: inline styles only, and every
 * element with more than one child needs display:flex). Brand colours from globals.css. */
const INDIGO = "#312e81";
const SAFFRON = "#f59e0b";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export const OG_SIZE = { width: 1200, height: 630 };

export function OgCard({ room, title, figure, figureNote, line }: {
  room?: string; title: string; figure?: string; figureNote?: string; line?: string;
}) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: INDIGO, color: "white", padding: "56px 64px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "white", color: INDIGO, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 700 }}>+</div>
          <div style={{ fontSize: 34, fontWeight: 700 }}>Sabhora</div>
        </div>
        {room && (
          <div style={{ display: "flex", background: SAFFRON, color: "#1c1917", borderRadius: 999, padding: "10px 24px", fontSize: 28, fontWeight: 600 }}>{room}</div>
        )}
      </div>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", gap: 22 }}>
        <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.12 }}>{clip(title, 90)}</div>
        {figure && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
            <div style={{ fontSize: 80, fontWeight: 700, color: SAFFRON }}>{figure}</div>
            <div style={{ fontSize: 32, opacity: 0.8 }}>{figureNote}</div>
          </div>
        )}
        {line && <div style={{ fontSize: 30, lineHeight: 1.35, opacity: 0.85 }}>{clip(line, 150)}</div>}
      </div>
      <div style={{ display: "flex", fontSize: 24, opacity: 0.65 }}>AI-simulated panel · a first pass to test with real people, not advice</div>
    </div>
  );
}
