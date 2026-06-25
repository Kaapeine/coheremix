import base64

import numpy as np
from app.analysis import spectrum


def _sine(sr, secs, freq, amp):
    t = np.arange(int(sr * secs)) / sr
    s = (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    return np.stack([s, s])  # (2, n)


def test_ltas_peaks_near_tone():
    sr = 48000
    pcm = _sine(sr, 4.0, 1000.0, 0.5)
    freqs, frames = spectrum.stft_mag(pcm, sr)
    lt = spectrum.ltas(freqs, frames)
    peak_bin = int(np.argmax(lt["db"]))
    peak_freq = lt["freqs"][peak_bin]
    # log-freq bins are coarse; 1 kHz tone should land within ~1/3 octave.
    assert 800 < peak_freq < 1250
    assert lt["bins"] == len(lt["db"]) == len(lt["freqs"])


def test_centroid_orders_by_brightness():
    sr = 48000
    low = _sine(sr, 3.0, 200.0, 0.5)
    high = _sine(sr, 3.0, 6000.0, 0.5)
    fl, frl = spectrum.stft_mag(low, sr)
    fh, frh = spectrum.stft_mag(high, sr)
    cen_low = np.median(spectrum.centroid_series(fl, frl, sr))
    cen_high = np.median(spectrum.centroid_series(fh, frh, sr))
    assert cen_low < cen_high
    assert cen_low < 1000 and cen_high > 3000


def test_compute_substrate2_payload_shape():
    sr = 48000
    pcm = _sine(sr, 3.0, 1000.0, 0.4)
    out = spectrum.compute_substrate2(pcm, sr, hop_s=0.1)
    assert set(out["ltas"]) == {"freqs", "db", "bins"}
    assert out["features"] == {}
    for key in ("centroidAvg", "tilt"):
        assert key in out["static"]


def test_spectrogram_shape_and_range():
    sr = 48000
    pcm = _sine(sr, 4.0, 1000.0, 0.5)
    freqs, frames = spectrum.stft_mag(pcm, sr)
    spec = spectrum.spectrogram(freqs, frames, bins=32, cols=20)
    assert spec["bins"] == 32 and spec["cols"] == 20
    data = np.frombuffer(base64.b64decode(spec["data"]), dtype=np.uint8)
    assert data.shape == (32 * 20,)
    assert data.max() == 255  # peak-normalised: loudest cell hits the ceiling


def test_spectrogram_empty_track():
    spec = spectrum.spectrogram(np.zeros(0), np.zeros((0, 0)), bins=8, cols=4)
    data = np.frombuffer(base64.b64decode(spec["data"]), dtype=np.uint8)
    assert data.shape == (32,) and data.max() == 0
