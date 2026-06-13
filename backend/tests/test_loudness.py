import numpy as np
import pyloudnorm as pyln

from app.analysis.loudness import gain_match, integrated_lufs


def _tone(sr=48000, dur=3.0, amp=0.5, freq=1000.0):
    t = np.linspace(0, dur, int(sr * dur), endpoint=False)
    s = amp * np.sin(2 * np.pi * freq * t)
    return np.stack([s, s], axis=0)  # (2, n)


def test_integrated_matches_pyloudnorm_reference():
    sr = 48000
    pcm = _tone(sr=sr)
    ours = integrated_lufs(pcm, sr)
    ref = pyln.Meter(sr).integrated_loudness(pcm.T.astype(np.float64))
    assert abs(ours - ref) < 1e-6


def test_louder_signal_reads_higher():
    sr = 48000
    quiet = integrated_lufs(_tone(amp=0.1), sr)
    loud = integrated_lufs(_tone(amp=0.5), sr)
    assert loud > quiet
    # +14 dB amplitude (×5) ≈ +14 LU
    assert abs((loud - quiet) - 13.98) < 0.5


def test_gain_match_offset_to_target():
    # a -9.2 LUFS master needs -4.8 LU to hit -14
    assert gain_match(-9.2, -14.0) == -4.8
    assert gain_match(-20.0, -14.0) == 6.0


def test_power_blocks_shape_and_silence():
    from app.analysis import loudness

    sr = 48000
    # 2 s of stereo silence -> 20 blocks of 100 ms
    pcm = np.zeros((2, 2 * sr), dtype=np.float32)
    blocks = loudness.power_blocks(pcm, sr, block_s=0.1)
    assert blocks.shape == (20, 2)
    assert np.all(blocks == 0.0)


def test_kweight_boosts_highs():
    from app.analysis import loudness

    sr = 48000
    n = sr  # 1 s
    t = np.arange(n) / sr
    low = np.sin(2 * np.pi * 100 * t).astype(np.float32)
    high = np.sin(2 * np.pi * 6000 * t).astype(np.float32)
    kl = loudness.kweight(low[None, :], sr)[0]
    kh = loudness.kweight(high[None, :], sr)[0]
    # K-weighting's high-shelf makes 6 kHz hotter than 100 Hz for equal input.
    assert (kh**2).mean() > (kl**2).mean()
