from __future__ import annotations

import numpy as np
import pyloudnorm as pyln
from scipy import signal

# BS.1770-4 K-weighting biquad coefficients @ 48 kHz (resample target).
_KW_STAGE1_B = np.array([1.53512485958697, -2.69169618940638, 1.19839281085285])
_KW_STAGE1_A = np.array([1.0, -1.69065929318241, 0.73248077421585])
_KW_STAGE2_B = np.array([1.0, -2.0, 1.0])
_KW_STAGE2_A = np.array([1.0, -1.99004745483398, 0.99007225036621])


def kweight(pcm: np.ndarray, sample_rate: int) -> np.ndarray:
    """Apply BS.1770-4 K-weighting per channel. pcm shape (ch, n) -> (ch, n)."""
    x = pcm.astype(np.float64)
    y = signal.lfilter(_KW_STAGE1_B, _KW_STAGE1_A, x, axis=-1)
    y = signal.lfilter(_KW_STAGE2_B, _KW_STAGE2_A, y, axis=-1)
    return y


def power_blocks(pcm: np.ndarray, sample_rate: int, block_s: float = 0.1) -> np.ndarray:
    """Mean-square of K-weighted signal per block, per channel.

    Returns shape (n_blocks, n_ch). n_blocks = floor(n / block_len).
    """
    k = kweight(pcm, sample_rate)
    bl = int(round(block_s * sample_rate))
    n_blocks = k.shape[1] // bl
    if n_blocks == 0:
        return np.zeros((0, pcm.shape[0]))
    trimmed = k[:, : n_blocks * bl]
    reshaped = trimmed.reshape(pcm.shape[0], n_blocks, bl)
    msq = (reshaped**2).mean(axis=2)  # (ch, n_blocks)
    return msq.T  # (n_blocks, ch)


def integrated_lufs(pcm: np.ndarray, sample_rate: int) -> float:
    """Gated integrated loudness (BS.1770-4) for stereo PCM shape (2, n)."""
    meter = pyln.Meter(sample_rate)  # BS.1770-4 with gating
    samples = pcm.T.astype(np.float64)  # (n, 2)
    return float(meter.integrated_loudness(samples))


def gain_match(integrated: float, target_lufs: float) -> float:
    """LU offset to bring this track to the common target."""
    return round(target_lufs - integrated, 2)
