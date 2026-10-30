"""Generate an original, quiet synth bed and soft UI cues for a launch film (42 seconds by default)."""
import argparse
import array
import math
import wave
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
parser.add_argument('--seconds', type=int, default=42)
parser.add_argument('--cues', help='Comma-separated cue times in seconds; tones rotate through a fixed set.')
args = parser.parse_args()
rate = 44100
seconds = args.seconds
cues = [(0.7, 440), (5.2, 587.33), (8.15, 880), (13.2, 587.33),
        (16.2, 880), (19.2, 659.25), (26.2, 440), (28.6, 587.33),
        (31.2, 659.25), (33.8, 880), (37.2, 587.33)]
if args.cues:
    tones = (440, 587.33, 659.25, 880)
    cues = [(float(at), tones[i % len(tones)]) for i, at in enumerate(args.cues.split(','))]
samples = array.array('h')
for n in range(rate * seconds):
    t = n / rate
    fade = min(1, t / 2, (seconds - t) / 2)
    swell = 0.7 + 0.3 * math.sin(math.pi * t / 7) ** 2
    bed = sum(math.sin(2 * math.pi * frequency * t + .15 * math.sin(t * .3))
              for frequency in (146.832, 220, 293.665, 369.994)) * .006 * swell
    cue = 0
    for start, frequency in cues:
        age = t - start
        if 0 <= age < .45:
            envelope = min(1, age / .012) * math.exp(-age * 12)
            cue += .04 * envelope * math.sin(2 * math.pi * frequency * age)
    value = max(-1, min(1, (bed + cue) * fade))
    integer = int(value * 32767)
    samples.extend((integer, integer))
args.output.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(args.output), 'wb') as output:
    output.setnchannels(2)
    output.setsampwidth(2)
    output.setframerate(rate)
    output.writeframes(samples.tobytes())
print(args.output)
