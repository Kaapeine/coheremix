from __future__ import annotations

import numpy as np
from scipy.signal import welch

# Matches schemas.ComparisonDefaults.bandEdges.
DEFAULT_BANDS: list[tuple[float, float]] = [
    (20, 60), (60, 120), (120, 400), (400, 2000),
    (2000, 5000), (5000, 10000), (10000, 20000),
]


def _block_count(n_samples: int, hop: int) -> int:
    return n_samples // hop


_SILENCE_MSQ = 1e-6  # ~ -60 dBFS mean-square; below this, ratios are noise-floor and unstable


def correlation_series(
    pcm: np.ndarray, sample_rate: int, hop_s: float = 0.1, win_s: float = 0.3
) -> np.ndarray:
    """Normalised L/R cross-correlation over a trailing ~win_s window, -1..1.

    Near-silent windows are NaN (undefined) rather than normalising
    noise-floor energy, which produces an unstable ratio.
    """
    L = pcm[0].astype(np.float64)
    R = pcm[1].astype(np.float64)
    hop = int(round(hop_s * sample_rate))
    n = _block_count(L.shape[0], hop)
    if n == 0:
        return np.zeros(0)
    Lr = L[: n * hop].reshape(n, hop)
    Rr = R[: n * hop].reshape(n, hop)
    sLL = (Lr * Lr).sum(axis=1)
    sRR = (Rr * Rr).sum(axis=1)
    sLR = (Lr * Rr).sum(axis=1)
    cLL = np.concatenate([[0.0], np.cumsum(sLL)])
    cRR = np.concatenate([[0.0], np.cumsum(sRR)])
    cLR = np.concatenate([[0.0], np.cumsum(sLR)])
    win_blocks = max(1, int(round(win_s / hop_s)))
    out = np.full(n, np.nan)
    for i in range(n):
        lo = max(0, i - win_blocks + 1)
        nsamp = (i - lo + 1) * hop
        ll = cLL[i + 1] - cLL[lo]
        rr = cRR[i + 1] - cRR[lo]
        lr = cLR[i + 1] - cLR[lo]
        if ll / nsamp > _SILENCE_MSQ and rr / nsamp > _SILENCE_MSQ:
            out[i] = lr / np.sqrt(ll * rr)
    return out


def ms_ratio_series(pcm: np.ndarray, sample_rate: int, hop_s: float = 0.1) -> np.ndarray:
    """Side/Mid energy ratio per block (0 = mono, larger = wider).

    Near-silent blocks are NaN (undefined) rather than taking a ratio of
    noise-floor energy, which is unstable.
    """
    M = (pcm[0] + pcm[1]) * 0.5
    S = (pcm[0] - pcm[1]) * 0.5
    hop = int(round(hop_s * sample_rate))
    n = _block_count(M.shape[0], hop)
    if n == 0:
        return np.zeros(0)
    Me = (M[: n * hop].astype(np.float64) ** 2).reshape(n, hop).mean(axis=1)
    Se = (S[: n * hop].astype(np.float64) ** 2).reshape(n, hop).mean(axis=1)
    out = np.full(n, np.nan)
    valid = Me > _SILENCE_MSQ
    out[valid] = Se[valid] / Me[valid]
    return out


def balance_series(pcm: np.ndarray, sample_rate: int, hop_s: float = 0.1) -> np.ndarray:
    """L/R balance in dB per block; positive = right louder.

    Near-silent blocks are NaN (undefined) rather than taking a dB ratio of
    noise-floor energy, which is unstable.
    """
    hop = int(round(hop_s * sample_rate))
    n = _block_count(pcm.shape[1], hop)
    if n == 0:
        return np.zeros(0)
    Le = (pcm[0][: n * hop].astype(np.float64) ** 2).reshape(n, hop).mean(axis=1)
    Re = (pcm[1][: n * hop].astype(np.float64) ** 2).reshape(n, hop).mean(axis=1)
    out = np.full(n, np.nan)
    valid = (Le > _SILENCE_MSQ) & (Re > _SILENCE_MSQ)
    out[valid] = 10.0 * np.log10(Re[valid] / Le[valid])
    return out


def width_per_band(
    pcm: np.ndarray, sample_rate: int, bands: list[tuple[float, float]] = DEFAULT_BANDS
) -> list[float]:
    """Whole-file Side/Mid energy ratio within each band (via Welch PSD)."""
    M = (pcm[0] + pcm[1]) * 0.5
    S = (pcm[0] - pcm[1]) * 0.5
    nper = min(4096, pcm.shape[1])
    f, PM = welch(M.astype(np.float64), fs=sample_rate, nperseg=nper)
    _, PS = welch(S.astype(np.float64), fs=sample_rate, nperseg=nper)
    out = []
    for lo, hi in bands:
        sel = (f >= lo) & (f < hi)
        m = PM[sel].sum()
        s = PS[sel].sum()
        out.append(round(float(s / m) if m > 0 else 0.0, 3))
    return out


def compute_substrate3(pcm: np.ndarray, sample_rate: int, hop_s: float = 0.1) -> dict:
    """Substrate-3 (spatial family): correlation, M/S, balance, per-band width."""
    corr = correlation_series(pcm, sample_rate, hop_s)
    ms = ms_ratio_series(pcm, sample_rate, hop_s)
    bal = balance_series(pcm, sample_rate, hop_s)

    def _l(a: np.ndarray) -> list[float | None]:
        return [None if np.isnan(x) else round(float(x), 3) for x in a]

    def _nanmedian(a: np.ndarray, ndigits: int) -> float:
        valid = a[~np.isnan(a)]
        return round(float(np.nanmedian(valid)), ndigits) if valid.size else 0.0

    return {
        "features": {"correlation": _l(corr), "sideMidRatio": _l(ms), "balance": _l(bal)},
        "static": {
            "avgCorrelation": _nanmedian(corr, 2),
            "sideMidRatioAvg": _nanmedian(ms, 3),
            "widthPerBand": width_per_band(pcm, sample_rate),
        },
    }
