from __future__ import annotations

import numpy as np

ZOOMS = {"z256": 256, "z512": 512, "z1024": 1024, "z2048": 2048, "z4096": 4096}


def build_peaks(pcm: np.ndarray, counts: dict[str, int] = ZOOMS) -> dict[str, list[float]]:
    """Return {zoom: [min0,max0,min1,max1,...]} from stereo PCM (2, n)."""
    mono = pcm.mean(axis=0)
    out: dict[str, list[float]] = {}
    for name, count in counts.items():
        idx = np.linspace(0, mono.size, count + 1).astype(int)
        peaks = np.empty(count * 2, dtype=np.float32)
        for i in range(count):
            seg = mono[idx[i]:idx[i + 1]]
            if seg.size == 0:
                peaks[i * 2] = 0.0
                peaks[i * 2 + 1] = 0.0
            else:
                peaks[i * 2] = float(seg.min())
                peaks[i * 2 + 1] = float(seg.max())
        out[name] = peaks.tolist()
    return out
