"""
The music: seamless loops cut from recorded tracks by Kevin MacLeod, into src/assets/music/ (an .mp3
per track and tracks.json with each loop's points), from the downloaded originals (not in the
repository: CREDITS.md says where each one came from).

  python3 -I tools/packs/music.py <dir with the downloaded .mp3s> [out dir]

A loop is a stretch of the original, x[a : a+L], from a downbeat a to where the music plays the
music at a again: whole bars, or (in the two pieces that repeat across a bar line or with no fixed
grid) the repeat's exact length. Both were found by self-similarity of the tracks' spectra and then
waveform cross-correlation, to the sample. Its last stretch crossfades into the audio leading up to
a (where in its last bars the two passages match best; "alike" in the report, 1 the same, sets the
crossfade's curve), so the loop's end runs on into its own start. A quarter second of margin on each
side is the loop's own continuation: the whole file is periodic, so the loop points stay seamless
whatever priming silence a decoder leaves at the front. The report's "seam" checks that on the
encoded file (the decoded audio around the two loop points, alike up to the codec's noise).

Each loop is normalized to -18 LUFS (EBU R128, measured by ffmpeg) and encoded as MP3 (stereo,
44.1 kHz; MP3 because the artifact's public sharing only takes MP3 or WAV audio): 80 kbps cut at
15.5 kHz, or 64 kbps cut at 12 kHz for the mellow pieces with next to nothing above 8 kHz. The victory sting is the end of an orchestral fanfare (from its
third note, through the pause, to its giant last chord, faded as it rings), at -16 LUFS.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
MARGIN = 0.25
TARGET_LUFS = -18.0
STING_LUFS = -16.0
BITRATE = '80k'

INC = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/'
FREEPD = 'https://archive.org/download/freepd/'

# id: source file, credit, and the loop: start a (s, a downbeat), its length (bars at bpm and
# beats/bar, or exact samples at 44.1 kHz where the repeat isn't a whole number of bars), crossfade
# (s), bitrate if not BITRATE.
TRACKS = {
    'tavern': dict(src='Midnight Tale.mp3', title='Midnight Tale', url=INC + 'Midnight%20Tale.mp3', license='CC BY 4.0',
                   a=7.025, samples=4603315, bpm=73, xfade=1.5, kbps='64k'),
    'village': dict(src='Village Consort.mp3', title='Village Consort', url=INC + 'Village%20Consort.mp3', license='CC BY 4.0',
                    a=77.049, bars=32, bpm=95, bpb=4, xfade=1.5, kbps='64k'),
    'inn': dict(src='Dancing at the Inn.mp3', title='Dancing at the Inn', url=FREEPD + 'misc/Dancing%20at%20the%20Inn.mp3', license='Public domain (FreePD)',
                a=31.533, samples=2232852, xfade=1.0),
    'celtic': dict(src='Celtic Impulse.mp3', title='Celtic Impulse', url=INC + 'Celtic%20Impulse.mp3', license='CC BY 4.0',
                   a=40.827, bars=48, bpm=144, bpb=4, xfade=1.0),
    'angevin': dict(src='Angevin B.mp3', title='Angevin B', url=INC + 'Angevin%20B.mp3', license='CC BY 4.0',
                    a=64.004, bars=24, bpm=120, bpb=4, xfade=1.5),
    'snow': dict(src='The Snow Queen.mp3', title='The Snow Queen', url=INC + 'The%20Snow%20Queen.mp3', license='CC BY 4.0',
                 a=37.504, bars=20, bpm=96, bpb=4, xfade=1.5, kbps='64k'),
    'desert': dict(src='Desert City.mp3', title='Desert City', url=INC + 'Desert%20City.mp3', license='CC BY 4.0',
                   a=11.155, bars=16, bpm=86, bpb=4, xfade=1.0),
    'emperor': dict(src='Mountain Emperor.mp3', title='Mountain Emperor', url=INC + 'Mountain%20Emperor.mp3', license='CC BY 4.0',
                    a=24.0, bars=24, bpm=120, bpb=4, xfade=1.0),
    'axes': dict(src='Death and Axes.mp3', title='Death and Axes', url=INC + 'Death%20and%20Axes.mp3', license='CC BY 4.0',
                 a=64.710, bars=48, bpm=140, bpb=4, xfade=1.5),
}
STINGS = {
    'victory': dict(src='Discovery Hit.mp3', title='Discovery Hit', url=INC + 'Discovery%20Hit.mp3', license='CC BY 4.0',
                    start=4.19, length=6.4, fade=2.0),
}


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def write_wav(path, y):
    y16 = np.clip(np.round(y * 32767), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(y16.tobytes())


def loudness(path):
    """Integrated loudness (LUFS) and true peak (dBFS) by ffmpeg's ebur128."""
    e = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    i = re.findall(r'I:\s+(-?[\d.]+) LUFS', e)
    p = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', e)
    return float(i[-1]), float(p[-1])


def corr(p, q):
    return float((p * q).sum() / (np.sqrt((p * p).sum() * (q * q).sum()) + 1e-12))


def build_loop(x, a, L, xfade):
    """The loop's samples with its margins, the crossfade's start (s into the loop) and how alike the crossfaded passages are."""
    X = int(round(xfade * SR))
    M = int(round(MARGIN * SR))
    m = x.mean(axis=1)
    # Where in the last 8 s the passage before a+L and the one before a match best (10 ms steps).
    lo = max(0, L - int(8 * SR), L - a)
    best = (-2.0, L - X - M)
    for c in range(lo, L - X - M + 1, int(0.01 * SR)):
        r = corr(m[a + c:a + c + X], m[a + c - L:a + c - L + X])
        if r > best[0]:
            best = (r, c)
    rho, c = best
    if a + c - L < 0 or a + L + M > len(x):
        raise ValueError('the loop does not fit in the track')
    body = x[a:a + L].copy()
    s = (np.arange(X) + 0.5) / X
    u = 0.5 - 0.5 * np.cos(np.pi * s)
    r = max(0.0, rho)
    # Equal gain for passages that are the same, equal power for unrelated ones, in between for the rest.
    norm = np.sqrt(u * u + (1 - u) * (1 - u) + 2 * r * u * (1 - u))
    body[c:c + X] = ((1 - u) / norm)[:, None] * x[a + c:a + c + X] + (u / norm)[:, None] * x[a + c - L:a + c - L + X]
    body[c + X:] = x[a + c + X - L:a]
    return np.concatenate([x[a - M:a], body, x[a:a + M]]), c / SR, rho


def encode(wav, out, gain_db, title, kbps):
    subprocess.run([
        'ffmpeg', '-v', 'error', '-y', '-i', wav, '-af', f'volume={gain_db:.2f}dB', '-c:a', 'libmp3lame', '-b:a', kbps,
        '-cutoff', '15500' if kbps == BITRATE else '12000', '-ar', '44100', '-ac', '2',
        '-map_metadata', '-1', '-metadata', f'title={title}', '-metadata', 'artist=Kevin MacLeod',
        '-fflags', '+bitexact', '-flags:a', '+bitexact', out,
    ], check=True)


def flux(m):
    """Spectral flux of 10 ms frames."""
    n = 441
    v = np.lib.stride_tricks.sliding_window_view(m, n)[::n]
    S = np.log(np.abs(np.fft.rfft(v * np.hanning(n), axis=1)) + 1e-4)
    return np.maximum(0, np.diff(S, axis=0)).sum(axis=1)


def check_wrap(d, ls, le):
    """The decoded loop played round its wrap (loopEnd back to loopStart): the biggest step at the join
    against the loop's own 99.9th percentile step (a click shows as > 1), and the spectral flux there
    against the same downbeat played straight through the file."""
    m = d.mean(axis=1)
    w = int(0.24 * SR)
    joined = np.concatenate([m[le - w:le], m[ls:ls + w]])
    step = np.abs(np.diff(joined))[w - 220:w + 220].max() / np.percentile(np.abs(np.diff(m[ls:le])), 99.9)
    k = len(flux(joined)) // 2
    return float(step), float(flux(joined)[k - 2:k + 2].max()), float(flux(m[ls - w:ls + w])[k - 2:k + 2].max())


def main():
    src_dir = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else 'src/assets/music'
    os.makedirs(out_dir, exist_ok=True)
    tmp = tempfile.mkdtemp()
    manifest = {}
    total = 0
    for tid, t in TRACKS.items():
        x = decode(os.path.join(src_dir, t['src']))
        a = int(round(t['a'] * SR))
        if 'samples' in t:
            L = t['samples']
        else:
            L = int(round(t['bars'] * t['bpb'] * 60 / t['bpm'] * SR))
        y, xf_at, rho = build_loop(x, a, L, t['xfade'])
        wav = os.path.join(tmp, tid + '.wav')
        peak = float(np.abs(y).max())
        write_wav(wav, y / max(1.0, peak))
        lufs, _ = loudness(wav)
        out = os.path.join(out_dir, tid + '.mp3')
        kbps = t.get('kbps', BITRATE)
        encode(wav, out, TARGET_LUFS - lufs, t['title'], kbps)
        # Check the result: its loudness, that the decoded file is periodic across the loop points, and the wrap.
        got, tp = loudness(out)
        d = decode(out)
        M = int(round(MARGIN * SR))
        w = int(0.1 * SR)
        seam = corr(d[M + L - w:M + L + w].mean(axis=1), d[M - w:M + w].mean(axis=1))
        step, fwrap, fstraight = check_wrap(d, M, M + L)
        if step > 1:
            raise SystemExit(f'{tid}: a click at the wrap')
        size = os.path.getsize(out)
        total += size
        manifest[tid] = {
            'loopStart': round(MARGIN, 6), 'loopEnd': round(MARGIN + L / SR, 6), 'duration': round(len(y) / SR, 6),
            'bpm': round(60 * (t['bars'] * t['bpb']) / (L / SR), 4) if 'bars' in t else t.get('bpm'),
        }
        print(f'{tid:8s} {t["title"]:20s} from {t["a"]:7.3f}s, {L / SR:7.3f}s loop, crossfade at {xf_at:6.2f}s (alike {rho:.3f}), '
              f'{lufs:5.1f} -> {got:5.1f} LUFS, peak {tp:5.1f} dBTP, seam {seam:.3f}, wrap step {step:.2f} flux {fwrap:.0f}/{fstraight:.0f}, '
              f'{kbps}, {size / 1024:4.0f} KB')
    for sid, s in STINGS.items():
        x = decode(os.path.join(src_dir, s['src']))
        i0 = int(round(s['start'] * SR))
        n = int(round(s['length'] * SR))
        y = x[i0:i0 + n].copy()
        f = int(round(s['fade'] * SR))
        y[-f:] *= (0.5 + 0.5 * np.cos(np.pi * np.arange(f) / f))[:, None]
        # (It starts 10 ms before a note's attack, which covers the cut.)
        k = int(0.01 * SR)
        y[:k] *= (np.arange(k) / k)[:, None]
        wav = os.path.join(tmp, sid + '.wav')
        peak = float(np.abs(y).max())
        write_wav(wav, y / max(1.0, peak))
        lufs, _ = loudness(wav)
        out = os.path.join(out_dir, sid + '.mp3')
        encode(wav, out, STING_LUFS - lufs, s['title'], BITRATE)
        got, tp = loudness(out)
        size = os.path.getsize(out)
        total += size
        manifest[sid] = {'duration': round(len(y) / SR, 6)}
        print(f'{sid:8s} {s["title"]:20s} {s["length"]:.1f}s sting, {lufs:6.1f} -> {got:6.1f} LUFS, peak {tp:5.1f} dBTP, {size / 1024:6.0f} KB')
    with open(os.path.join(out_dir, 'tracks.json'), 'w') as fh:
        json.dump(manifest, fh, indent=2)
        fh.write('\n')
    print(f'total {total / 1024 / 1024:.2f} MiB ({total / 1e6:.2f} MB)')


main()
