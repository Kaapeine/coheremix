import numpy as np
from app.analysis import spatial


def _stereo(sr, secs, freq, ampL, ampR, phaseR=0.0):
    t = np.arange(int(sr * secs)) / sr
    left = (ampL * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    right = (ampR * np.sin(2 * np.pi * freq * t + phaseR)).astype(np.float32)
    return np.stack([left, right])


def test_correlation_mono_is_one():
    sr = 48000
    pcm = _stereo(sr, 2.0, 500.0, 0.5, 0.5)  # identical L/R
    corr = spatial.correlation_series(pcm, sr)
    assert np.median(corr[3:]) > 0.98


def test_correlation_antiphase_is_negative():
    sr = 48000
    pcm = _stereo(sr, 2.0, 500.0, 0.5, 0.5, phaseR=np.pi)  # inverted R
    corr = spatial.correlation_series(pcm, sr)
    assert np.median(corr[3:]) < -0.9


def test_ms_ratio_mono_near_zero():
    sr = 48000
    pcm = _stereo(sr, 2.0, 500.0, 0.5, 0.5)  # no side content
    ms = spatial.ms_ratio_series(pcm, sr)
    assert np.median(ms) < 0.05


def test_balance_right_heavier_is_positive():
    sr = 48000
    pcm = _stereo(sr, 2.0, 500.0, 0.25, 0.5)  # right louder
    bal = spatial.balance_series(pcm, sr)
    assert np.median(bal) > 3.0  # ~ +6 dB


def test_compute_substrate3_payload_shape():
    sr = 48000
    pcm = _stereo(sr, 2.0, 500.0, 0.5, 0.4)
    out = spatial.compute_substrate3(pcm, sr, hop_s=0.1)
    for key in ("correlation", "msRatio", "balance"):
        assert key in out["features"] and len(out["features"][key]) >= 1
    for key in ("avgCorrelation", "msRatioAvg", "widthPerBand"):
        assert key in out["static"]
    assert len(out["static"]["widthPerBand"]) == len(spatial.DEFAULT_BANDS)
