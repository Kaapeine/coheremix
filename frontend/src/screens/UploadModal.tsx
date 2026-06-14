import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

interface FileInfo {
  format: string;
  sampleRate: number;
  channels: number;
  duration: number;
  size: number;
  bitDepth: number | null;
}

interface SlotFile {
  file: File;
  info: FileInfo;
  name: string;
}

const ACCEPT_EXT = ".wav,.aiff,.aif,.flac,.mp3";

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
}

function fmtSize(b: number): string {
  return (b / 1048576).toFixed(1) + " MB";
}

async function probeFile(file: File): Promise<FileInfo> {
  if (file.size > 100 * 1024 * 1024) throw new Error("File too large (max 100 MB)");
  const buf = await file.arrayBuffer();
  const ctx = new OfflineAudioContext(2, 1, 48000);
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buf.slice(0));
  } catch {
    throw new Error("Could not decode — unsupported format or corrupt file");
  }
  if (decoded.numberOfChannels !== 2) throw new Error("Stereo files only");
  return {
    format: (file.name.split(".").pop() ?? "?").toUpperCase(),
    sampleRate: decoded.sampleRate,
    channels: decoded.numberOfChannels,
    duration: decoded.duration,
    size: file.size,
    bitDepth: null,
  };
}

function FileCard({
  role,
  slotFile,
  onRemove,
  onRename,
}: {
  role: "A" | "B";
  slotFile: SlotFile;
  onRemove: () => void;
  onRename: (name: string) => void;
}) {
  const { info, name } = slotFile;
  const specs: [string, string][] = [
    ["Format", info.format],
    ["Duration", fmtDuration(info.duration)],
    ["Sample rate", (info.sampleRate / 1000).toFixed(1) + " kHz"],
    ["Bit depth", info.bitDepth ? `${info.bitDepth}-bit` : "—"],
    ["Channels", info.channels === 2 ? "Stereo" : String(info.channels)],
    ["Size", fmtSize(info.size)],
  ];
  return (
    <div className={`file-card ${role.toLowerCase()}`}>
      <div className="fc-top">
        <input
          className="fc-rename"
          defaultValue={name}
          onBlur={(e) => onRename(e.target.value.trim() || name)}
          spellCheck={false}
        />
        <span className="fc-x" onClick={onRemove} title="Remove">
          <svg
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            width={15}
            height={15}
          >
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </span>
      </div>
      <div className="ok-badge">
        <svg
          viewBox="0 0 13 13"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          width={13}
          height={13}
        >
          <path d="M2.5 7l3 3 5-5.5" />
        </svg>
        Decoded — ready
      </div>
      <div className="fc-specs">
        {specs.map(([k, v]) => (
          <div className="fc-spec" key={k}>
            <span className="k">{k}</span>
            <span className="v">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DropZone({
  role,
  probing,
  error,
  onFile,
}: {
  role: "A" | "B";
  probing: boolean;
  error: string | null;
  onFile: (file: File) => void;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div
        className={`dz ${role.toLowerCase()} ${over ? "over" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
      >
        {probing ? (
          <>
            <svg
              className="spin"
              viewBox="0 0 16 16"
              width={24}
              height={24}
              fill="none"
              stroke="var(--b)"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M8 2a6 6 0 1 1-6 6" />
            </svg>
            <div className="dz-t" style={{ color: "var(--tx-3)" }}>
              Decoding…
            </div>
          </>
        ) : (
          <>
            <svg
              className="dz-ic"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 16V5M12 5l-4 4M12 5l4 4M5 16v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" />
            </svg>
            <div className="dz-t">
              Drop <b>{role === "A" ? "your mix" : "the reference"}</b> here
            </div>
            <div className="dz-s">WAV · AIFF · FLAC · MP3</div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_EXT}
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <div
          style={{
            fontSize: 11,
            color: "var(--warn)",
            marginTop: 6,
            lineHeight: 1.4,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

export function UploadModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [a, setA] = useState<SlotFile | null>(null);
  const [b, setB] = useState<SlotFile | null>(null);
  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorB, setErrorB] = useState<string | null>(null);
  const [probingA, setProbingA] = useState(false);
  const [probingB, setProbingB] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const both = a !== null && b !== null;

  const handleFile = async (
    file: File,
    set: (s: SlotFile | null) => void,
    setError: (e: string | null) => void,
    setProbing: (v: boolean) => void,
  ) => {
    setError(null);
    set(null);
    setProbing(true);
    try {
      const info = await probeFile(file);
      set({ file, info, name: file.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setProbing(false);
    }
  };

  const handleAnalyze = async () => {
    if (!a || !b || analyzing) return;
    setAnalyzeError(null);
    setAnalyzing(true);
    try {
      const mixFile = new File([a.file], a.name, { type: a.file.type });
      const refFile = new File([b.file], b.name, { type: b.file.type });
      const { id } = await api.create(mixFile, refFile);
      onClose();
      // No router state needed — the workspace recovers the job from the
      // comparison record, so this survives a hard refresh too.
      navigate(`/c/${id}`);
    } catch (err) {
      setAnalyzeError(
        err instanceof Error ? err.message : "Upload failed — please try again",
      );
      setAnalyzing(false);
    }
  };

  const handleDemoFiles = async () => {
    setDemoLoading(true);
    setErrorA(null);
    setErrorB(null);
    try {
      const [mixBlob, refBlob] = await Promise.all([
        fetch("/api/comparisons/demo/mix", { credentials: "include" }).then((r) => {
          if (!r.ok) throw new Error("Demo mix not found");
          return r.blob();
        }),
        fetch("/api/comparisons/demo/reference", { credentials: "include" }).then((r) => {
          if (!r.ok) throw new Error("Demo reference not found");
          return r.blob();
        }),
      ]);
      const mixFile = new File([mixBlob], "mix_demo.wav", { type: "audio/wav" });
      const refFile = new File([refBlob], "reference_demo.wav", {
        type: "audio/wav",
      });
      await Promise.all([
        handleFile(mixFile, setA, setErrorA, setProbingA),
        handleFile(refFile, setB, setErrorB, setProbingB),
      ]);
    } catch (err) {
      setErrorA(err instanceof Error ? err.message : "Could not load demo files");
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-head">
          <div className="modal-eyebrow">New comparison</div>
          <h1 className="modal-title">Load two tracks to compare</h1>
          <p className="modal-desc">
            The slot a file lands in sets its identity for the whole session —{" "}
            <b style={{ color: "var(--a)" }}>your mix (A)</b> and the{" "}
            <b style={{ color: "var(--b)" }}>reference (B)</b>. We gain-match
            them internally so every comparison is honest.
          </p>
        </div>

        <div className="modal-body">
          <div className="slots">
            <div>
              <div className="slot-label">
                <span className="sd a" />
                <span className="role">
                  A · <b>Your mix</b>
                </span>
              </div>
              {a ? (
                <FileCard
                  role="A"
                  slotFile={a}
                  onRemove={() => {
                    setA(null);
                    setErrorA(null);
                  }}
                  onRename={(n) => setA({ ...a, name: n })}
                />
              ) : (
                <DropZone
                  role="A"
                  probing={probingA}
                  error={errorA}
                  onFile={(f) => handleFile(f, setA, setErrorA, setProbingA)}
                />
              )}
            </div>
            <div>
              <div className="slot-label">
                <span className="sd b" />
                <span className="role">
                  B · <b>Reference</b>
                </span>
              </div>
              {b ? (
                <FileCard
                  role="B"
                  slotFile={b}
                  onRemove={() => {
                    setB(null);
                    setErrorB(null);
                  }}
                  onRename={(n) => setB({ ...b, name: n })}
                />
              ) : (
                <DropZone
                  role="B"
                  probing={probingB}
                  error={errorB}
                  onFile={(f) => handleFile(f, setB, setErrorB, setProbingB)}
                />
              )}
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button
            className="btn-primary"
            disabled={!both || analyzing}
            onClick={handleAnalyze}
          >
            {analyzing ? "Uploading…" : "Analyze"}
            {!analyzing && (
              <svg
                viewBox="0 0 20 20"
                width={15}
                height={15}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 10h11M11 6l4 4-4 4" />
              </svg>
            )}
          </button>
          <span className="hint">
            {analyzeError
              ? analyzeError
              : both
                ? "Both tracks decoded and valid."
                : "Add both tracks to continue."}
          </span>
          <span style={{ flex: 1 }} />
          {!both && !probingA && !probingB && (
            <button
              className="link-demo"
              onClick={handleDemoFiles}
              disabled={demoLoading}
            >
              {demoLoading ? "Loading…" : "Use demo files"}
            </button>
          )}
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
