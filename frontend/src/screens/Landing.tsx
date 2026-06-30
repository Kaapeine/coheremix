import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { UploadModal } from "./UploadModal";

function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: size, height: size, borderRadius: 4 }}
    >
      <defs>
        <linearGradient id="lp-grad" x1="18" y1="110" x2="110" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f2a93b" />
          <stop offset="1" stopColor="#3fcfe0" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="28" fill="#13110e" />
      <path
        d="M 110.0,64.0 L 109.6,68.1 L 108.3,72.2 L 106.3,76.2 L 103.5,80.2 L 100.0,84.0 L 95.8,87.6 L 91.0,91.0 L 85.8,94.3 L 80.2,97.2 L 74.2,100.0 L 68.1,102.4 L 61.9,104.5 L 55.8,106.3 L 49.8,107.7 L 44.0,108.8 L 38.7,109.6 L 33.7,110.0 L 29.4,110.0 L 25.6,109.6 L 22.6,108.8 L 20.3,107.7 L 18.7,106.3 L 18.0,104.5 L 18.2,102.4 L 19.2,100.0 L 20.9,97.2 L 23.5,94.3 L 26.8,91.0 L 30.8,87.6 L 35.3,84.0 L 40.4,80.2 L 45.9,76.2 L 51.8,72.2 L 57.8,68.1 L 64.0,64.0 L 70.2,59.9 L 76.2,55.8 L 82.1,51.8 L 87.6,47.8 L 92.7,44.0 L 97.2,40.4 L 101.2,37.0 L 104.5,33.7 L 107.1,30.8 L 108.8,28.0 L 109.8,25.6 L 110.0,23.5 L 109.3,21.7 L 107.7,20.3 L 105.4,19.2 L 102.4,18.4 L 98.6,18.0 L 94.3,18.0 L 89.3,18.4 L 84.0,19.2 L 78.2,20.3 L 72.2,21.7 L 66.1,23.5 L 59.9,25.6 L 53.8,28.0 L 47.8,30.8 L 42.2,33.7 L 37.0,37.0 L 32.2,40.4 L 28.0,44.0 L 24.5,47.8 L 21.7,51.8 L 19.7,55.8 L 18.4,59.9 L 18.0,64.0 L 18.4,68.1 L 19.7,72.2 L 21.7,76.2 L 24.5,80.2 L 28.0,84.0 L 32.2,87.6 L 37.0,91.0 L 42.2,94.3 L 47.8,97.2 L 53.8,100.0 L 59.9,102.4 L 66.1,104.5 L 72.2,106.3 L 78.2,107.7 L 84.0,108.8 L 89.3,109.6 L 94.3,110.0 L 98.6,110.0 L 102.4,109.6 L 105.4,108.8 L 107.7,107.7 L 109.3,106.3 L 110.0,104.5 L 109.8,102.4 L 108.8,100.0 L 107.1,97.2 L 104.5,94.3 L 101.2,91.0 L 97.2,87.6 L 92.7,84.0 L 87.6,80.2 L 82.1,76.2 L 76.2,72.2 L 70.2,68.1 L 64.0,64.0 L 57.8,59.9 L 51.8,55.8 L 45.9,51.8 L 40.4,47.8 L 35.3,44.0 L 30.8,40.4 L 26.8,37.0 L 23.5,33.7 L 20.9,30.8 L 19.2,28.0 L 18.2,25.6 L 18.0,23.5 L 18.7,21.7 L 20.3,20.3 L 22.6,19.2 L 25.6,18.4 L 29.4,18.0 L 33.7,18.0 L 38.7,18.4 L 44.0,19.2 L 49.8,20.3 L 55.8,21.7 L 61.9,23.5 L 68.1,25.6 L 74.2,28.0 L 80.2,30.8 L 85.8,33.7 L 91.0,37.0 L 95.8,40.4 L 100.0,44.0 L 103.5,47.8 L 106.3,51.8 L 108.3,55.8 L 109.6,59.9 L 110.0,64.0"
        fill="none"
        stroke="url(#lp-grad)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const PITCH = [
  ["Both tracks always in view", "No toggling, no switching plugin windows — A and B are visible at the same time."],
  ["See the delta instantly", "Every metric shows A, B, and the difference between them."],
  ["All in one place", "Loudness, spectrum, and stereo field without leaving the page."],
] as const;

const METRICS = [
  {
    group: "Loudness",
    items: [
      { name: "Short-term LUFS", desc: "How loud each section feels in real time. Track loudness shifts across the song and spot where your mix diverges from the reference." },
      { name: "Integrated LUFS", desc: "Overall loudness across the full track — the number streaming platforms use for normalization." },
    ],
  },
  {
    group: "Frequency",
    items: [
      { name: "LTAS — tonal balance", desc: "Long-term average spectrum. See where each track sits across the frequency range and catch tonal imbalances." },
      { name: "Live spectrum", desc: "Real-time frequency display with adjustable smoothing. Holds on pause so you can compare detail without the display decaying." },
    ],
  },
  {
    group: "Stereo",
    items: [
      { name: "Side/Mid ratio", desc: "How wide each track is, broken down per frequency band. Spot where your mix is narrower or wider than the reference." },
      { name: "Goniometer", desc: "Real-time stereo field visualization for A and B side by side — catch phase issues and mono-compatibility problems at a glance." },
    ],
  },
] as const;

export function Landing() {
  const navigate = useNavigate();
  const [showUpload, setShowUpload] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const handleDemo = async () => {
    setDemoLoading(true);
    try {
      const poll = async (): Promise<string> => {
        const { id, state } = await api.demo();
        if (state === "ready") return id;
        if (state === "failed") throw new Error("demo failed");
        await new Promise((r) => setTimeout(r, 2000));
        return poll();
      };
      navigate(`/c/${await poll()}`);
    } catch {
      setDemoLoading(false);
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div className="header">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">CohereMix</span>
        </div>
        <div className="header-spacer" />
        <button
          className="btn-ghost"
          style={{ height: 32, fontSize: 12 }}
          onClick={() => navigate("/library")}
        >
          Open Library
        </button>
      </div>

      <div className="scroll-y" style={{ flex: 1 }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 40px 80px" }}>

          {/* hero */}
          <div style={{ padding: "80px 0 64px", textAlign: "center" }}>
            <div style={{ fontSize: 34, fontWeight: 600, color: "var(--tx-1)", lineHeight: 1.2, marginBottom: 16 }}>
              Compare your mix to any reference.
            </div>
            <div style={{ fontSize: 14, color: "var(--tx-2)", lineHeight: 1.65, maxWidth: 460, margin: "0 auto 36px" }}>
              Upload your mix and a reference track. CohereMix shows loudness, frequency balance,
              and stereo width for both — side by side, without switching plugins or toggling tracks.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn-primary" onClick={() => setShowUpload(true)}>
                New comparison
              </button>
              <button className="btn-ghost" onClick={handleDemo} disabled={demoLoading}>
                {demoLoading ? "Loading sample…" : "View sample"}
              </button>
            </div>
          </div>

          {/* pitch strip */}
          <div
            style={{
              borderTop: "1px solid var(--line)",
              borderBottom: "1px solid var(--line)",
              padding: "32px 0",
              marginBottom: 64,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 40,
            }}
          >
            {PITCH.map(([title, desc]) => (
              <div key={title} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-1)" }}>{title}</div>
                <div style={{ fontSize: 12, color: "var(--tx-2)", lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>

          {/* metrics */}
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
            {METRICS.map(({ group, items }) => (
              <div key={group}>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--tx-3)",
                    fontWeight: 600,
                    marginBottom: 10,
                  }}
                >
                  {group}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 1,
                    background: "var(--line)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--radius)",
                    overflow: "hidden",
                  }}
                >
                  {items.map(({ name, desc }) => (
                    <div
                      key={name}
                      style={{
                        background: "var(--surface-1)",
                        padding: "18px 20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-1)" }}>{name}</div>
                      <div style={{ fontSize: 12, color: "var(--tx-2)", lineHeight: 1.6 }}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* footer */}
          <div
            style={{
              marginTop: 80,
              paddingTop: 32,
              borderTop: "1px solid var(--line)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div className="brand">
              <BrandMark size={24} />
              <span className="brand-name" style={{ fontSize: 16 }}>CohereMix</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--tx-3)", letterSpacing: "0.06em" }}>
              Built for mix engineers
            </div>
          </div>
        </div>
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  );
}
