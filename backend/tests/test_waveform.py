import numpy as np

from app.analysis.waveform import build_peaks


def test_peaks_shape_and_range():
    sr = 48000
    t = np.linspace(0, 2.0, sr * 2, endpoint=False)
    s = 0.8 * np.sin(2 * np.pi * 100 * t)
    pcm = np.stack([s, s], axis=0)
    peaks = build_peaks(pcm, {"z256": 256, "z512": 512, "z1024": 1024, "z2048": 2048, "z4096": 4096})
    assert len(peaks["z4096"]) == 4096 * 2
    assert len(peaks["z256"]) == 256 * 2
    arr = np.array(peaks["z4096"])
    mins, maxs = arr[0::2], arr[1::2]
    assert (mins <= maxs).all()
    assert maxs.max() <= 1.0 and mins.min() >= -1.0
    assert maxs.max() > 0.5  # captured the amplitude


def test_silence_is_flat():
    pcm = np.zeros((2, 48000), dtype=np.float32)
    peaks = build_peaks(pcm, {"z256": 256})
    assert all(abs(v) < 1e-6 for v in peaks["z256"])
