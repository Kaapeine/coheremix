from __future__ import annotations

import numpy as np
import pyloudnorm as pyln


def integrated_lufs(pcm: np.ndarray, sample_rate: int) -> float:
    """Gated integrated loudness (BS.1770-4) for stereo PCM shape (2, n)."""
    meter = pyln.Meter(sample_rate)  # BS.1770-4 with gating
    samples = pcm.T.astype(np.float64)  # (n, 2)
    return float(meter.integrated_loudness(samples))


def gain_match(integrated: float, target_lufs: float) -> float:
    """LU offset to bring this track to the common target."""
    return round(target_lufs - integrated, 2)
