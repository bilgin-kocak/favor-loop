# The Favor Loop video

An 81-second explainer for the buildathon: Remotion scenes, an ElevenLabs voiceover (voice "Aditya", model `eleven_v4`) and ElevenLabs sound effects, over a soundtrack synthesized in Python from the same timeline, so every cut lands on the beat.

| Path | What |
|---|---|
| `src/timeline.json` | The one clock: scene windows, voiceover starts and their measured phrases, the beats |
| `src/scenes1.tsx` | The impossible trade, the loop, the title, kidney exchange |
| `src/scenes2.tsx` | The agent session, everyone's yes, the proof, the simulated village, Kismet, the close |
| `src/FavorLoop.tsx` | The composition: captions, voice, sound effects, the ducked soundtrack |
| `public/audio/use/` | The chosen voiceover takes (`vo01`–`vo12`) and sound effects |
| `public/audio/voice/` | The takes with every phrase levelled to the same loudness (`tools/level_voice.py`) |
| `public/board-sim.mp4` | A screen capture of `/board?view=sim` (`tools/record-board.cjs`) |
| `tools/music.py` | Writes `public/audio/music.wav` (D minor, 104 BPM, the drop on the title) |

What is on screen is labelled for what it is: the agent segment is re-typeset from a real Claude Code session with the Favor Loop skill and test accounts, through the local stand-in for the village tool; the board is the simulated village (150 synthetic members), badged SIMULATED throughout; Priya, Arjun and Maya are illustrations, shown with the Telegram bot's real wording.

## Build

```bash
npm install
```

```bash
npm run music
```

```bash
npm run render
```

`npm run render` writes `out/favor-loop-raw.mp4`, then `tools/master.sh` brings it to about -14 LUFS as `out/favor-loop.mp4`. `npm run voice` rebuilds the levelled voiceover after a take changes. `npm run studio` opens the Remotion editor. `node tools/stills.mjs <bundle> <outdir> 12.5 47.6` renders stills at given seconds from a `remotion bundle` output.
