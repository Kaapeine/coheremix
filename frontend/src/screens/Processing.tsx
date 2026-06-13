import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { JobStatus } from "../types/payload";

const STAGE_LABELS: Record<string, string> = {
  decode: "Decode",
  gainmatch: "Gain-match",
  waveform: "Waveform",
  stft: "Frequency",
  spatial: "Stereo",
  aggregates: "Aggregates",
};

const STAGE_ORDER = ["decode", "gainmatch", "waveform", "stft", "spatial", "aggregates"];

function ProcTrack({
  role,
  name,
  stages,
}: {
  role: "mix" | "reference";
  name: string;
  stages: Record<string, string>;
}) {
  const roleClass = role === "mix" ? "a" : "b";
  const entries = STAGE_ORDER.map((key) => ({
    key,
    label: STAGE_LABELS[key] ?? key,
    status: stages[key] ?? "pending",
  }));

  const doneCount = entries.filter((e) => e.status === "done").length;
  const progress = entries.length > 0 ? (doneCount / entries.length) * 100 : 0;

  return (
    <div className={`proc-track ${roleClass}`}>
      <div className="proc-name">{name}</div>
      <div className="proc-role">
        {role === "mix" ? "A · your mix" : "B · reference"}
      </div>
      <div className="proc-stages">
        {entries.map(({ key, label, status }) => {
          const cls =
            status === "done" ? "done" : status === "running" ? "active" : "";
          return (
            <div className={`proc-stage ${cls}`} key={key}>
              <span className="st-ic">
                {status === "running" ? (
                  <svg
                    className="spin"
                    viewBox="0 0 16 16"
                    width={14}
                    height={14}
                    fill="none"
                    stroke="var(--b)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M8 2a6 6 0 1 1-6 6" />
                  </svg>
                ) : (
                  <span className="st-dot" />
                )}
              </span>
              <span className="st-name">{label}</span>
              {status === "done" && (
                <span
                  className="mono"
                  style={{ fontSize: 10, color: "var(--good)" }}
                >
                  ✓
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="proc-bar">
        <div className="pf" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export function ProcessingScreen({
  compId,
  jobId,
  onDone,
}: {
  compId: string;
  jobId: string;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackNames, setTrackNames] = useState<Record<string, string>>({});
  const onDoneRef = useRef(onDone);
  useLayoutEffect(() => { onDoneRef.current = onDone; });

  useEffect(() => {
    api
      .get(compId)
      .then((comp) => {
        const names: Record<string, string> = {};
        for (const t of comp.tracks) names[t.role] = t.name;
        setTrackNames(names);
      })
      .catch(() => {});
  }, [compId]);

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const j = await api.job(jobId);
        setJob(j);
        if (j.state === "done") {
          clearInterval(t);
          onDoneRef.current();
        }
        if (j.state === "failed") {
          clearInterval(t);
          setError(j.error ?? "Analysis failed");
        }
      } catch {
        // transient fetch error — keep polling
      }
    }, 600);
    return () => clearInterval(t);
  }, [jobId]);

  const handleCancel = () => {
    api.remove(compId).catch(() => {});
    navigate("/");
  };

  const mixStages = (job?.stages?.["mix"] ?? {}) as Record<string, string>;
  const refStages = (job?.stages?.["reference"] ?? {}) as Record<string, string>;

  return (
    <div className="overlay">
      <div className="modal" style={{ width: "min(760px, 96vw)" }}>
        <div className="modal-head">
          <div className="modal-eyebrow">Analyzing</div>
          <h1 className="modal-title">Computing the comparison</h1>
          <p className="modal-desc">
            Each track is decoded and reduced to its feature substrates once.
            The transport goes live as soon as decode finishes.
          </p>
        </div>

        <div className="modal-body">
          {error ? (
            <div
              style={{
                padding: "20px",
                color: "var(--warn)",
                fontSize: 13,
                background: "var(--warn-soft)",
                borderRadius: "var(--radius)",
              }}
            >
              Analysis failed: {error}
            </div>
          ) : (
            <div className="proc-tracks">
              <ProcTrack
                role="mix"
                name={trackNames["mix"] ?? "Mix"}
                stages={mixStages}
              />
              <ProcTrack
                role="reference"
                name={trackNames["reference"] ?? "Reference"}
                stages={refStages}
              />
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn-ghost" onClick={handleCancel}>
            Cancel
          </button>
          <span className="hint">
            {error
              ? "You can try uploading again."
              : "Long files can take up to a minute — you can start aligning once waveforms appear."}
          </span>
        </div>
      </div>
    </div>
  );
}
