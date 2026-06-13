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


_ABS_GATE = -70.0  # LUFS absolute gate
_G = np.array([1.0, 1.0])  # channel weights (L, R equal)


def block_loudness(msq_blocks: np.ndarray) -> np.ndarray:
    """Per-block loudness L = -0.691 + 10*log10(sum_ch G_ch * msq_ch)."""
    weighted = (msq_blocks * _G[: msq_blocks.shape[1]]).sum(axis=1)
    with np.errstate(divide="ignore"):
        return -0.691 + 10.0 * np.log10(weighted)


def windowed_lufs(msq_blocks: np.ndarray, win_blocks: int) -> np.ndarray:
    """Sliding-window LUFS over the block array (trailing window).

    short-term = 30 blocks (3 s), momentary = 4 blocks (400 ms).
    Output length == number of blocks; window clamps at the start.
    """
    n = msq_blocks.shape[0]
    out = np.full(n, -120.0)
    if n == 0:
        return out
    weighted = (msq_blocks * _G[: msq_blocks.shape[1]]).sum(axis=1)
    csum = np.concatenate([[0.0], np.cumsum(weighted)])
    for i in range(n):
        lo = max(0, i - win_blocks + 1)
        mean_pow = (csum[i + 1] - csum[lo]) / (i - lo + 1)
        out[i] = -0.691 + 10.0 * np.log10(mean_pow) if mean_pow > 0 else -120.0
    return out
