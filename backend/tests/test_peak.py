import numpy as np
from app.analysis import peak


def test_true_peak_exceeds_sample_peak_for_intersample():
    sr = 48000
    n = sr
    t = np.arange(n) / sr
    # near-Nyquist tone phased to fall between samples -> inter-sample overshoot
    s = (0.9 * np.sin(2 * np.pi * (sr / 2 - 100) * t + np.pi / 4)).astype(np.float32)
    pcm = np.stack([s, s])
    sample_peak_db = 20 * np.log10(np.max(np.abs(pcm)))
    tp_db = peak.true_peak_max(pcm, sr)
    assert tp_db >= sample_peak_db - 0.01
    assert tp_db > sample_peak_db  # oversampling reveals the overshoot


def test_crest_of_sine_is_about_3db():
    sr = 48000
    t = np.arange(2 * sr) / sr
    s = (0.5 * np.sin(2 * np.pi * 1000 * t)).astype(np.float32)
    pcm = np.stack([s, s])
    crest = peak.crest_series(pcm, sr, hop_s=0.1, win_s=1.0)
    # sine crest = 20*log10(sqrt(2)) ~ 3.01 dB
    assert abs(np.median(crest[10:]) - 3.01) < 0.4


def test_true_peak_series_length():
    sr = 48000
    pcm = (np.random.rand(2, 2 * sr).astype(np.float32) - 0.5)
    tp = peak.true_peak_series(pcm, sr, hop_s=0.1)
    assert tp.shape[0] == 20
