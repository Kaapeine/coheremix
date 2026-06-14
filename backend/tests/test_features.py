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


def test_gated_integrated_matches_pyloudnorm():
    sr = 48000
    pcm = _sine(sr, 6.0, 1000.0, 0.5)
    blocks = loudness.power_blocks(pcm, sr)
    ours = loudness.gated_integrated(blocks)
    theirs = loudness.integrated_lufs(pcm, sr)  # pyloudnorm reference
    assert abs(ours - theirs) < 0.5


def test_region_gate_ignores_silence():
    sr = 48000
    loud = _sine(sr, 3.0, 1000.0, 0.5)
    silence = np.zeros((2, 3 * sr), dtype=np.float32)
    pcm = np.concatenate([loud, silence], axis=1)  # 6 s: loud then silent
    blocks = loudness.power_blocks(pcm, sr)
    # whole-file gated integrated should track the loud half, not be dragged
    # toward -inf by the silence (absolute gate drops silent blocks).
    whole = loudness.gated_integrated(blocks)
    region_loud = loudness.gated_integrated(blocks[:30])   # first 3 s
    assert abs(whole - region_loud) < 0.8


def test_lra_positive_for_dynamic_signal():
    sr = 48000
    quiet = _sine(sr, 4.0, 1000.0, 0.1)
    loud = _sine(sr, 4.0, 1000.0, 0.6)
    pcm = np.concatenate([quiet, loud], axis=1)
    blocks = loudness.power_blocks(pcm, sr)
    st = loudness.windowed_lufs(blocks, win_blocks=30)
    lra = loudness.loudness_range(st)
    assert lra > 3.0  # clear quiet->loud spread
