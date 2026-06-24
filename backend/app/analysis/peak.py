from __future__ import annotations

import numpy as np
from scipy import signal


def _oversample(pcm: np.ndarray, factor: int = 4) -> np.ndarray:
    """Polyphase upsample per channel. pcm (ch, n) -> (ch, n*factor)."""
    return signal.resample_poly(pcm.astype(np.float64), factor, 1, axis=-1)


def true_peak_max(pcm: np.ndarray, sample_rate: int, factor: int = 4) -> float:
    """Max true peak across channels in dBTP (>=4x oversampled)."""
    up = _oversample(pcm, factor)
    pk = float(np.max(np.abs(up)))
    return 20.0 * np.log10(pk) if pk > 0 else -120.0


def true_peak_series(
    pcm: np.ndarray, sample_rate: int, hop_s: float = 0.1, factor: int = 4
) -> np.ndarray:
    """Per-hop max true peak (dBTP). Length = floor(n / hop_len)."""
    up = _oversample(pcm, factor)
    mag = np.max(np.abs(up), axis=0)  # (n*factor,) max across channels
    hop_up = int(round(hop_s * sample_rate)) * factor
    n_hops = mag.shape[0] // hop_up
    if n_hops == 0:
        return np.zeros(0)
    blocks = mag[: n_hops * hop_up].reshape(n_hops, hop_up)
    peaks = blocks.max(axis=1)
    with np.errstate(divide="ignore"):
        return np.where(peaks > 0, 20.0 * np.log10(peaks), -120.0)


_SILENCE_MSQ = 1e-6  # ~ -60 dBFS mean-square; below this, peak/RMS is noise-floor and unstable


def crest_series(
    pcm: np.ndarray, sample_rate: int, hop_s: float = 0.1, win_s: float = 1.0
) -> np.ndarray:
    """Windowed crest factor (dB) = peak_dB - RMS_dB over a trailing window.

    Output length = number of hops. Uses linear (un-weighted) samples.
    Near-silent windows are NaN (undefined) rather than computing peak/RMS on
    noise-floor energy, which produces unstable (often extreme) ratios.
    """
    hop = int(round(hop_s * sample_rate))
    win_blocks = max(1, int(round(win_s / hop_s)))
    mono_sq = (pcm.astype(np.float64) ** 2).mean(axis=0)
    mono_abs = np.max(np.abs(pcm.astype(np.float64)), axis=0)
    n_hops = mono_sq.shape[0] // hop
    if n_hops == 0:
        return np.zeros(0)
    sq_blocks = mono_sq[: n_hops * hop].reshape(n_hops, hop)
    abs_blocks = mono_abs[: n_hops * hop].reshape(n_hops, hop)
    block_msq = sq_blocks.mean(axis=1)
    block_peak = abs_blocks.max(axis=1)
    out = np.full(n_hops, np.nan)
    for i in range(n_hops):
        lo = max(0, i - win_blocks + 1)
        msq = block_msq[lo : i + 1].mean()
        pk = block_peak[lo : i + 1].max()
        if msq > _SILENCE_MSQ and pk > 0:
            out[i] = 20.0 * np.log10(pk / np.sqrt(msq))
    return out
