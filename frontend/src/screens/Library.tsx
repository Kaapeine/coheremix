import React, { useEffect, useRef, useState } from "react";
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
          <div className="brand-mark" />
          <span className="brand-name">CohereMix</span>
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
