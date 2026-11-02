# MindWalk

[中文](README.md) | English

Talk while you walk. Your words appear live in a box on screen and are then organized into a mind map. By default the models are called through the University of Edinburgh's ELM, and any OpenAI-compatible API also works.

## Deploy to the web (recommended)

Deploy free on [Render](https://render.com). It provides HTTPS, so your phone just opens a URL and no computer has to stay on.

1. Sign in to Render and connect GitHub.
2. Dashboard → **New → Blueprint** → pick this repository. Render reads `render.yaml`.
3. Fill in `OPENAI_API_KEY` (your ELM key) and click **Apply**.
4. When it's deployed, copy `ACCESS_KEY` from the service's **Environment** page. That's your access key. You can replace it with your own (at least 16 characters).
5. On your phone, open `https://<your-service>.onrender.com` and enter the key. The phone remembers it, so you only enter it once.

Shortcut: send yourself `https://<your-service>.onrender.com/#key=<key>`. Opening it unlocks the page. The part after `#` never reaches the server or its logs.

Without the key, people only see the key screen and can't spend your API quota. The free plan sleeps after 15 idle minutes, and waking it takes about a minute.

## Run locally

```bash
npm install
cp .env.example .env   # fill in OPENAI_API_KEY and ACCESS_KEY
```

```bash
set -a; . ./.env; set +a
npm start
```

Phone browsers only allow the microphone over HTTPS, so locally you also need a tunnel such as cloudflared (`bash scripts/setup.sh` downloads it into `bin/` and checks its SHA-256):

```bash
bin/cloudflared tunnel --url http://localhost:8787
```

## Live text

After you tap "Start recording", pause briefly (about 0.6 s) after each sentence and it appears in the box within 1 to 3 seconds. The recording is cut at pauses into 4 to 25 second clips, and each clip is transcribed as soon as it ends. Clips overlap slightly, so no word is cut in half.

Ideas are organized into the map about every 2 minutes, and the rest when you stop, so the model sees whole thoughts.

## Transcription accuracy

Already in place:

- **Language**: "Speech: Chinese / English / Auto" at the bottom. Picking the language is more accurate than Auto, and Chinese comes out in simplified characters with punctuation.
- **Context**: each clip is sent with the previous sentence and the words already on the map, so names are spelled consistently.
- **No phantom text**: silence is often transcribed as "Thank you for watching" or subtitle credits. These are filtered out.
- **Nothing lost**: each clip is saved on the phone and deleted only once it's transcribed. Offline clips are sent when you're back online.

You can also:

- List names and terms you say often in `TRANSCRIBE_VOCAB`, comma separated.
- Set `OPENAI_TRANSCRIBE_MODEL` to `gpt-4o-transcribe` if your provider offers it. It's noticeably more accurate for Chinese. Only `whisper-1` can detect missed audio.
- Keep the phone in a shallow pocket, mic facing in when it's windy.

## Tidy map

Once the map has 2 or more ideas, a "Tidy map" button appears. It merges duplicates, moves misplaced ideas to the right branch and shortens long ones to keywords. Nothing is lost, and merged ideas keep their original words. Tap "Undo" if you don't like the result.

## Recording with the screen locked

| Phone | How to record |
|---|---|
| Android (Chrome) | Tap "Start recording", then lock the screen. Try a few minutes first: when you stop, the page tells you if anything was missed |
| iPhone | iOS keeps the screen on while a web page records. To lock it, record in Voice Memos, save to Files, then tap "Upload audio" |

## Language

The button in the top right switches the interface between Chinese and English. Your ideas stay in the language you spoke and are never translated.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | none | Required |
| `OPENAI_BASE_URL` | OpenAI's own API | Set to `https://elm.edina.ac.uk/api/v1` for ELM |
| `ACCESS_KEY` | none | Access key, at least 16 characters. Without it the server only listens on this computer |
| `HOST` | `127.0.0.1` | Set to `0.0.0.0` when deployed, which requires `ACCESS_KEY` |
| `OPENAI_MODEL` | `gpt-5.6-sol` | Model that organizes ideas |
| `OPENAI_TRANSCRIBE_MODEL` | `whisper-1` | Transcription model |
| `TRANSCRIBE_VOCAB` | none | Names and terms you say often |

## Known limits

- Text appears a sentence at a time, not word by word.
- An uploaded audio file must be under 25 MB (about 25 minutes of Voice Memo). In-app recording is uploaded in clips, so it has no such limit, up to 2.5 hours.
- The map lives only in the phone's browser and is lost if you switch phones or clear site data. Copy a backup from the "Outline" tab.
- `app/index.html` is also the source of the claude.ai version, which can't record.

## Tests

```bash
npm test
```
