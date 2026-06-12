export function UploadModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay">
      <div className="modal" style={{ width: "min(880px, 96vw)" }}>
        <div className="modal-head">
          <div className="modal-eyebrow">New comparison</div>
          <h1 className="modal-title">Load two tracks to compare</h1>
          <p className="modal-desc">Coming in Task 19 — upload, validate, and analyze.</p>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
