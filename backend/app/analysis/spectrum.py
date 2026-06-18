from __future__ import annotations

import numpy as np
from scipy import signal

_FFT = 16384
_HOP = 4096  # 75% overlap
_F_LO = 20.0
_F_HI = 20000.0


def stft_mag(
    pcm: np.ndarray, sample_rate: int, fft: int = _FFT, hop: int = _HOP
) -> tuple[np.ndarray, np.ndarray]:
    """Magnitude STFT of the mono mix. Returns (freqs[fft/2+1], mag[frames, fft/2+1])."""
    mono = pcm.mean(axis=0).astype(np.float64)
    freqs = np.fft.rfftfreq(fft, 1.0 / sample_rate)
    n_frames = 1 + max(0, (mono.shape[0] - fft) // hop)
    if mono.shape[0] < fft:
        return freqs, np.zeros((0, freqs.shape[0]))
    win = signal.windows.hann(fft, sym=False)
    frames = np.empty((n_frames, freqs.shape[0]))
    for i in range(n_frames):
        seg = mono[i * hop : i * hop + fft] * win
        frames[i] = np.abs(np.fft.rfft(seg))
    return freqs, frames


def _octave_smooth(values: np.ndarray, bins: int, f_lo: float, f_hi: float, octave_width: float) -> np.ndarray:
    """Smooth a per-bin power array with a triangular window `octave_width` octaves
    wide (SPAN-style "1/3-octave smoothing"), constant in log-frequency space."""
    if octave_width <= 0:
        return values
    oct_per_bin = np.log2(f_hi / f_lo) / bins
    radius_oct = octave_width / 2.0
    radius_bins = radius_oct / oct_per_bin
    k = max(1, int(np.ceil(radius_bins)))
    offsets = np.arange(-k, k + 1)
    weights = np.maximum(0.0, 1.0 - np.abs(offsets) * oct_per_bin / radius_oct)
    out = np.empty(bins)
    for i in range(bins):
        idx = np.clip(i + offsets, 0, bins - 1)
        out[i] = np.average(values[idx], weights=weights)
    return out


def ltas(
    freqs: np.ndarray, frames: np.ndarray, bins: int = 96,
    f_lo: float = _F_LO, f_hi: float = _F_HI, smooth_octave: float = 1.0 / 3,
) -> dict:
    """Long-term average spectrum on a log-freq grid, in dB, peak-normalised to 0.

    Peak-normalisation means the curve describes tonal *shape* (apples-to-apples
    after gain-match), not absolute level. `smooth_octave` applies a SPAN-style
    fractional-octave smoothing window (in the power domain, before dB/peak-norm)
    so the curve reads as a tonal envelope rather than raw per-bin noise.
    """
    edges = np.geomspace(f_lo, f_hi, bins + 1)
    centers = np.sqrt(edges[:-1] * edges[1:])
    if frames.shape[0] == 0:
        return {
            "freqs": [round(float(f), 1) for f in centers],
            "db": [-120.0] * bins, "bins": bins,
        }
    mean_pow = (frames ** 2).mean(axis=0)  # mean power per FFT bin
    band_pow = np.empty(bins)
    for i in range(bins):
        sel = (freqs >= edges[i]) & (freqs < edges[i + 1])
        if np.any(sel):
            band_pow[i] = mean_pow[sel].mean()
        else:  # log band narrower than FFT resolution (low end): nearest bin
            band_pow[i] = mean_pow[int(np.argmin(np.abs(freqs - centers[i])))]
    band_pow = _octave_smooth(band_pow, bins, f_lo, f_hi, smooth_octave)
    db = np.full(bins, -120.0)
    pos = band_pow > 0
    db[pos] = 10.0 * np.log10(band_pow[pos])
    db = db - db.max()
    return {
        "freqs": [round(float(f), 1) for f in centers],
        "db": [round(float(x), 2) for x in db], "bins": bins,
    }


def centroid_series(
    freqs: np.ndarray, frames: np.ndarray, sample_rate: int,
    fft: int = _FFT, hop: int = _HOP, hop_s: float = 0.1,
) -> np.ndarray:
    """Spectral centroid (Hz) per STFT frame, averaged onto a `hop_s` grid."""
    if frames.shape[0] == 0:
        return np.zeros(0)
    denom = frames.sum(axis=1)
    cen = np.where(denom > 0, (frames * freqs).sum(axis=1) / denom, 0.0)
    frame_t = (np.arange(frames.shape[0]) * hop + fft / 2) / sample_rate
    n_out = int(frame_t[-1] / hop_s) + 1
    idx = np.floor(frame_t / hop_s).astype(int)
    out = np.zeros(n_out)
    for b in range(n_out):
        sel = idx == b
        out[b] = cen[sel].mean() if np.any(sel) else (out[b - 1] if b else 0.0)
    return out


def spectral_tilt(ltas_dict: dict) -> float:
    """Least-squares slope of the LTAS curve in dB per octave (negative = darker)."""
    f = np.asarray(ltas_dict["freqs"], dtype=np.float64)
    db = np.asarray(ltas_dict["db"], dtype=np.float64)
    x = np.log2(f)
    a = np.vstack([x, np.ones_like(x)]).T
    slope = np.linalg.lstsq(a, db, rcond=None)[0][0]
    return float(round(slope, 2))


def compute_substrate2(pcm: np.ndarray, sample_rate: int, hop_s: float = 0.1) -> dict:
    """Substrate-2 (frequency family): LTAS curve, centroid series, tilt."""
    freqs, frames = stft_mag(pcm, sample_rate)
    lt = ltas(freqs, frames)
    cen = centroid_series(freqs, frames, sample_rate, hop_s=hop_s)
    cen_pos = cen[cen > 0]
    cen_avg = float(round(np.median(cen_pos) if cen_pos.size else 0.0, 0))
    return {
        "ltas": lt,
        "features": {"centroid": [round(float(x), 1) for x in cen]},
        "static": {"centroidAvg": cen_avg, "tilt": spectral_tilt(lt)},
    }
