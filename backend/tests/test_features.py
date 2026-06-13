import numpy as np
from app.analysis import loudness


def _sine(sr, secs, freq, amp):
    t = np.arange(int(sr * secs)) / sr
    s = (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    return np.stack([s, s])  # (2, n)


def test_shortterm_matches_integrated_for_steady_tone():
    sr = 48000
    pcm = _sine(sr, 5.0, 1000.0, 0.5)
    blocks = loudness.power_blocks(pcm, sr)
    st = loudness.windowed_lufs(blocks, win_blocks=30)  # short-term
    mo = loudness.windowed_lufs(blocks, win_blocks=4)   # momentary
    integ = loudness.integrated_lufs(pcm, sr)
    # For a steady tone, both windows settle within ~0.5 LU of integrated.
    assert abs(np.median(st[30:]) - integ) < 0.6
    assert abs(np.median(mo[4:]) - integ) < 0.6


def test_windowed_lufs_length_matches_blocks():
    sr = 48000
    pcm = _sine(sr, 2.0, 1000.0, 0.3)
    blocks = loudness.power_blocks(pcm, sr)
    st = loudness.windowed_lufs(blocks, win_blocks=30)
    assert st.shape[0] == blocks.shape[0]
