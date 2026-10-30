# Cortex launch film

A 42-second, 1920 × 1080 product animation, built from the website's colors and locally bundled artwork. All screen content is fictional; the film labels its product illustrations. No private screen capture or live model calls are used.

Run `npm run dev` and open `/launch.html`. Play/pause, Restart, and the timeline control allow review and scene selection. **Export video** records the canvas at 30 fps and downloads an MP4 when the browser supports it, otherwise WebM. Keep the tab foreground during export. The page remains editable and is included in the Vercel build, but isn't linked from the public landing page.

`/launch.html?capture&time=10` is a clean, controls-free still at ten seconds. Add `autoplay` to start playback automatically. The final card holds at the end; the film does not loop.

| Time | Scene |
| --- | --- |
| 0–5 s | Cortex in a simulated Mac notch |
| 5–13 s | Recall a LinkedIn conversation, with a source |
| 13–19 s | Explicitly save a permanent memory |
| 19–26 s | Available screen text → local memory → connected AI clients |
| 26–37 s | Codex saves a handoff, Claude resumes, OpenCode reviews |
| 37–42 s | Open-source and GitHub end card |

The voiced cut includes scene-synced synthetic English narration and a quiet original background bed. Play, pause, and seek also control the audio; the Voice button mutes playback. Browser exports include the narration. The transcript and timing live in `launch-voiceover.json`. An original optional synth bed and soft UI cues can be generated with:

```sh
python3 scripts/generate-launch-audio.py /tmp/cortex-launch-sound.wav
```

For a downloaded MP4, add the sound and make a broadly compatible H.264 export:

```sh
ffmpeg -i cortex-launch.mp4 -i /tmp/cortex-launch-sound.wav -map 0:v:0 -map 1:a:0 -c:v libx264 -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -t 42 -movflags +faststart cortex-launch-with-sound.mp4
```

The audio is procedurally generated from scratch; it contains no licensed stock music. Edit `src/launch.js` for composition and text, and `src/launch-timeline.js` for scene timing. `npm test` validates scene continuity as well as the site's existing checks. A real desktop recording can replace the simulated opening in a later cut.


## Regenerate narration

The optional Python helper uses `edge-tts` and the Andrew Multilingual neural voice. Install it in a virtual environment, then run:

```sh
python scripts/add-launch-voiceover.py --video /path/to/cortex-launch.mp4 --bed /path/to/cortex-launch-sound.wav --output /path/to/exports --clips /path/to/voice-clips
```

Pass `--reuse-clips` to remix existing generated MP3 clips without contacting the speech service. The helper fits each segment to its scene, normalizes narration, lowers the music, and exports `cortex-launch-voiceover.mp4`. Copy the generated `cortex-launch-audio.m4a` to `public/media/launch-audio.m4a` to update the editable player. The voice is synthetic; the audio is bundled, so site visitors do not make speech-service requests.


## Notch film

A second, 50-second cut told from the notch: it opens, you ask a question, Cortex looks back at the screen text it kept on your Mac, answers with a source, flags two to-dos, and then shows the shared task list for agents. Open `/notch-film.html` with `npm run dev`. Composition lives in `src/notch-film.js`, timing in `src/notch-film-timeline.js`, and narration in `notch-film-voiceover.json`.

Regenerate the bed and voiceover for it:

```sh
python3 scripts/generate-launch-audio.py /tmp/notch-bed.wav --seconds 50 --cues 1.6,5.3,7.2,17.3,25.3,28.8,30.8,33.2,35.5,40.8,43.2
python scripts/add-launch-voiceover.py --script notch-film-voiceover.json --name cortex-notch-film --video /path/to/notch-silent.mp4 --bed /tmp/notch-bed.wav --output /path/to/exports --clips /path/to/voice-clips
```

Copy `cortex-notch-film-audio.m4a` to `public/media/notch-film-audio.m4a` to update the in-page player.
