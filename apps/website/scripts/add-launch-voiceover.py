"""Generate scene-synced neural narration and mix it into a Cortex launch export.
Optional dependency for generation: pip install edge-tts. Requires ffmpeg/ffprobe.
"""
import argparse
import asyncio
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--video', type=Path, required=True)
parser.add_argument('--bed', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--clips', type=Path, required=True)
parser.add_argument('--reuse-clips', action='store_true')
parser.add_argument('--voice', default='en-US-AndrewMultilingualNeural')
parser.add_argument('--script', type=Path, default=Path(__file__).resolve().parents[1] / 'launch-voiceover.json')
parser.add_argument('--name', default='cortex-launch', help='Prefix for the exported files.')
args = parser.parse_args()
scenes = json.loads(args.script.read_text())
args.output.mkdir(parents=True, exist_ok=True)
args.clips.mkdir(parents=True, exist_ok=True)

def run(*argv):
    subprocess.run([str(arg) for arg in argv], check=True)

async def generate():
    import edge_tts
    for scene in scenes:
        await edge_tts.Communicate(scene['text'], args.voice).save(str(args.clips / (scene['scene'] + '.mp3')))

if not args.reuse_clips:
    asyncio.run(generate())

wav_files = []
for scene in scenes:
    source = args.clips / (scene['scene'] + '.mp3')
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(source)], text=True))
    slot = scene['end'] - scene['start']
    # Preserve natural pacing where possible; leave room at each scene boundary.
    rate = max(1, duration / (slot - .6))
    if rate > 1.3:
        raise RuntimeError(f"Narration for {scene['scene']} is too long; shorten the text.")
    target = args.clips / (scene['scene'] + '-synced.wav')
    filters = f'atempo={rate:.5f},loudnorm=I=-18:TP=-2:LRA=11,aresample=48000,asetpts=N/SR/TB,afade=t=in:d=0.015,adelay=250,apad=whole_len={int(slot * 48000)},atrim=end_sample={int(slot * 48000)},asetpts=N/SR/TB'
    run('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-af', filters, '-ar', '48000', '-ac', '1', target)
    wav_files.append(target)

manifest = args.clips / 'voice-concat.txt'
manifest.write_text(''.join(f"file '{path.resolve().as_posix()}'\n" for path in wav_files))
voice = args.output / f'{args.name}-narration.m4a'
run('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', manifest, '-c:a', 'aac', '-b:a', '192k', voice)
audio = args.output / f'{args.name}-audio.m4a'
run('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', voice, '-i', args.bed, '-filter_complex', '[1:a]volume=0.28[bed];[0:a][bed]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95:level=0[mix]', '-map', '[mix]', '-c:a', 'aac', '-b:a', '192k', audio)
video = args.output / f'{args.name}-voiceover.mp4'
run('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', args.video, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'copy', '-t', str(scenes[-1]['end']), '-movflags', '+faststart', video)
print(video)
