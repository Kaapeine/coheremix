from __future__ import annotations

import numpy as np

from app.analysis import loudness, peak


def _to_list(arr: np.ndarray) -> list[float]:
    return [round(float(x), 3) for x in arr]


def compute_substrate1(
    pcm: np.ndarray, sample_rate: int, integrated: float, hop_s: float = 0.1
) -> dict:
    """Substrate-1 (loudness family) + true-peak/crest features + aggregates.

    `integrated` is the whole-file gated integrated LUFS already computed in
    the gainmatch stage (kept as the authoritative value).
    """
    blocks = loudness.power_blocks(pcm, sample_rate, block_s=hop_s)  # (n,2)
    st = loudness.windowed_lufs(blocks, win_blocks=30)   # 3 s
    mo = loudness.windowed_lufs(blocks, win_blocks=4)     # 400 ms
    crest = peak.crest_series(pcm, sample_rate, hop_s=hop_s, win_s=1.0)
    tp = peak.true_peak_series(pcm, sample_rate, hop_s=hop_s)

    # align lengths to the block count (defensive; resample paths can differ by 1)
    n = blocks.shape[0]
    clip = lambda a: a[:n] if a.shape[0] >= n else np.pad(a, (0, n - a.shape[0]), constant_values=a[-1] if a.shape[0] else 0)

    tp_max = peak.true_peak_max(pcm, sample_rate)
    lra = loudness.loudness_range(st)
    crest_avg = float(round(np.median(crest[10:]) if crest.shape[0] > 10 else (crest.mean() if crest.size else 0.0), 1))

    return {
        "features": {
            "shortTermLUFS": _to_list(st),
            "momentaryLUFS": _to_list(mo),
            "crest": _to_list(clip(crest)),
            "truePeak": _to_list(clip(tp)),
        },
        "static": {
            "integrated": round(float(integrated), 2),
            "lra": lra,
            "truePeakMax": round(tp_max, 1),
            "plr": round(tp_max - integrated, 1),
            "crestAvg": crest_avg,
        },
        # per-100ms K-power blocks (per-channel mean square) for client-side
        # region-scoped gated integrated (data contract: payload.kblocks).
        "kblocks": [[round(float(v), 8) for v in row] for row in blocks],
    }
