import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLibrary } from "../store/library";
import type { ComparisonOut } from "../types/payload";
import { UploadModal } from "./UploadModal";

function CompCard({
  comp,
  onOpen,
  onDelete,
  onRename,
}: {
  comp: ComparisonOut;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comp.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const mix = comp.tracks.find((t) => t.role === "mix");
  const ref = comp.tracks.find((t) => t.role === "reference");

  const commitRename = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== comp.name) onRename(draft.trim());
    else setDraft(comp.name);
  };

  const date = new Date(comp.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        cursor: "pointer",
        transition: "border-color .12s, background .12s",
      }}
      onClick={onOpen}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--line-strong)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--line)")
      }
    >
      {/* name row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        {editing ? (
          <input
            ref={inputRef}
            className="fc-rename"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setEditing(false);
                setDraft(comp.name);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            style={{ flex: 1, fontSize: 14, fontWeight: 600 }}
          />
        ) : (
          <span
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--tx-1)",
              wordBreak: "break-word",
              lineHeight: 1.3,
            }}
          >
            {comp.name}
          </span>
        )}
        {comp.state === "failed" && (
          <span
            style={{
              flexShrink: 0,
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              background: "var(--warn-soft)",
              color: "var(--warn)",
              padding: "2px 6px",
              borderRadius: 2,
            }}
          >
            Failed
          </span>
        )}
      </div>

      {/* track names */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {mix && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 2,
                background: "var(--a)",
                flexShrink: 0,
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontSize: 12,
                color: "var(--tx-2)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {mix.name}
            </span>
          </div>
        )}
        {ref && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 2,
                background: "var(--b)",
                flexShrink: 0,
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontSize: 12,
                color: "var(--tx-2)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {ref.name}
            </span>
          </div>
        )}
      </div>

      {/* footer: date + actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginTop: "auto",
          paddingTop: 4,
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "var(--tx-3)",
            letterSpacing: "0.04em",
          }}
        >
          {date}
        </span>
        <span style={{ flex: 1 }} />
        <div
          style={{ display: "flex", gap: 2 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="ptool"
            title="Rename"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
              setDraft(comp.name);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            <svg
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 10.5l1.5-1.5 6-6 1.5 1.5-6 6L2 12v-1.5z" />
              <path d="M9 3.5l1.5 1.5" />
            </svg>
          </button>
          <button
            className="ptool"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={{ color: "var(--warn)" }}
          >
            <svg
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 4h10M5.5 4V2.5h3V4M3 4l.7 7.5h6.6L11 4" />
              <path d="M5.5 6.5v3.5M8.5 6.5v3.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export function Library() {
  const navigate = useNavigate();
  const { items, loading, load, remove, rename } = useLibrary();
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      {/* header */}
      <div className="header">
        <div className="brand">
          <svg
            className="brand-mark"
            viewBox="0 0 128 128"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="brand-grad" x1="18" y1="110" x2="110" y2="18" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#f2a93b"/>
                <stop offset="1" stop-color="#3fcfe0"/>
              </linearGradient>
            </defs>
            <rect width="128" height="128" rx="28" fill="#13110e"/>
            <path d="M 110.0,64.0 L 109.6,68.1 L 108.3,72.2 L 106.3,76.2 L 103.5,80.2 L 100.0,84.0 L 95.8,87.6 L 91.0,91.0 L 85.8,94.3 L 80.2,97.2 L 74.2,100.0 L 68.1,102.4 L 61.9,104.5 L 55.8,106.3 L 49.8,107.7 L 44.0,108.8 L 38.7,109.6 L 33.7,110.0 L 29.4,110.0 L 25.6,109.6 L 22.6,108.8 L 20.3,107.7 L 18.7,106.3 L 18.0,104.5 L 18.2,102.4 L 19.2,100.0 L 20.9,97.2 L 23.5,94.3 L 26.8,91.0 L 30.8,87.6 L 35.3,84.0 L 40.4,80.2 L 45.9,76.2 L 51.8,72.2 L 57.8,68.1 L 64.0,64.0 L 70.2,59.9 L 76.2,55.8 L 82.1,51.8 L 87.6,47.8 L 92.7,44.0 L 97.2,40.4 L 101.2,37.0 L 104.5,33.7 L 107.1,30.8 L 108.8,28.0 L 109.8,25.6 L 110.0,23.5 L 109.3,21.7 L 107.7,20.3 L 105.4,19.2 L 102.4,18.4 L 98.6,18.0 L 94.3,18.0 L 89.3,18.4 L 84.0,19.2 L 78.2,20.3 L 72.2,21.7 L 66.1,23.5 L 59.9,25.6 L 53.8,28.0 L 47.8,30.8 L 42.2,33.7 L 37.0,37.0 L 32.2,40.4 L 28.0,44.0 L 24.5,47.8 L 21.7,51.8 L 19.7,55.8 L 18.4,59.9 L 18.0,64.0 L 18.4,68.1 L 19.7,72.2 L 21.7,76.2 L 24.5,80.2 L 28.0,84.0 L 32.2,87.6 L 37.0,91.0 L 42.2,94.3 L 47.8,97.2 L 53.8,100.0 L 59.9,102.4 L 66.1,104.5 L 72.2,106.3 L 78.2,107.7 L 84.0,108.8 L 89.3,109.6 L 94.3,110.0 L 98.6,110.0 L 102.4,109.6 L 105.4,108.8 L 107.7,107.7 L 109.3,106.3 L 110.0,104.5 L 109.8,102.4 L 108.8,100.0 L 107.1,97.2 L 104.5,94.3 L 101.2,91.0 L 97.2,87.6 L 92.7,84.0 L 87.6,80.2 L 82.1,76.2 L 76.2,72.2 L 70.2,68.1 L 64.0,64.0 L 57.8,59.9 L 51.8,55.8 L 45.9,51.8 L 40.4,47.8 L 35.3,44.0 L 30.8,40.4 L 26.8,37.0 L 23.5,33.7 L 20.9,30.8 L 19.2,28.0 L 18.2,25.6 L 18.0,23.5 L 18.7,21.7 L 20.3,20.3 L 22.6,19.2 L 25.6,18.4 L 29.4,18.0 L 33.7,18.0 L 38.7,18.4 L 44.0,19.2 L 49.8,20.3 L 55.8,21.7 L 61.9,23.5 L 68.1,25.6 L 74.2,28.0 L 80.2,30.8 L 85.8,33.7 L 91.0,37.0 L 95.8,40.4 L 100.0,44.0 L 103.5,47.8 L 106.3,51.8 L 108.3,55.8 L 109.6,59.9 L 110.0,64.0" fill="none" stroke="url(#brand-grad)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span className="brand-name">CoheMix</span>
        </div>
        <div className="header-spacer" />
        <button
          className="btn-primary"
          style={{ height: 32, fontSize: 12 }}
          onClick={() => setShowUpload(true)}
        >
          <svg
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            width={13}
            height={13}
          >
            <path d="M7 2v10M2 7h10" />
          </svg>
          New comparison
        </button>
      </div>

      {/* body */}
      <div
        className="scroll-y"
        style={{ flex: 1, padding: "32px 40px" }}
      >
        {loading && items.length === 0 ? (
          <div
            style={{
              height: "100%",
              display: "grid",
              placeItems: "center",
              color: "var(--tx-3)",
              fontSize: 13,
            }}
          >
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 18,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                background:
                  "linear-gradient(135deg, var(--a) 0 50%, var(--b) 50% 100%)",
              }}
            />
            <div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: "var(--tx-1)",
                  marginBottom: 8,
                }}
              >
                No comparisons yet
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--tx-3)",
                  marginBottom: 24,
                }}
              >
                Upload your mix and a reference to get started
              </div>
              <button
                className="btn-primary"
                onClick={() => setShowUpload(true)}
              >
                <svg
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  width={13}
                  height={13}
                >
                  <path d="M7 2v10M2 7h10" />
                </svg>
                New comparison
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--tx-3)",
                fontWeight: 600,
                marginBottom: 18,
              }}
            >
              Your comparisons
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {items.map((comp) => (
                <CompCard
                  key={comp.id}
                  comp={comp}
                  onOpen={() => navigate(`/c/${comp.id}`)}
                  onDelete={() => remove(comp.id)}
                  onRename={(name) => rename(comp.id, name)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  );
}
