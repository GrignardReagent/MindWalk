# MindWalk

[中文](README.md) | English

Talk while you walk. Your recordings are transcribed and organized into a mind map. By default the models are called through the University of Edinburgh's ELM, and any OpenAI-compatible API also works.

## Getting started

Once only:

```bash
npm install
cp .env.example .env   # then put your ELM API key in OPENAI_API_KEY in .env
```

Phone browsers only allow the microphone over HTTPS, so you also need a tunnel, such as cloudflared. Install it yourself, or read `scripts/setup.sh` and run it with `bash scripts/setup.sh`. It downloads cloudflared into `bin/` and checks its SHA-256.

Each time you use it, open two terminals:

```bash
# Terminal 1: start the server
set -a; . ./.env; set +a
npm start
```

```bash
# Terminal 2: start the tunnel, which prints https://...trycloudflare.com
bin/cloudflared tunnel --url http://localhost:8787
```

On your phone, open the `https://...trycloudflare.com` address from terminal 2. Both terminals and this computer must stay on while you use it. The tunnel address changes every time you restart it.

The server has no access code, so anyone with the tunnel address can spend your ELM quota. Don't share it, and stop the tunnel with `Ctrl+C` when you're done.

## Recording with the screen locked

Audio is saved on the phone as it's recorded and uploaded when you stop, so losing signal mid-walk loses nothing.

| Phone | How to record |
|---|---|
| Android (Chrome) | Tap "Start recording", then lock the screen. Try a few minutes first: when you stop, the page tells you if anything was missed |
| iPhone | iOS keeps the screen on while a web page records. To lock it, record in Voice Memos, save to Files, then tap "Upload audio" |

## Language

The button in the top right switches between Chinese and English, and the phone remembers your choice. On first open it follows the phone's language. Your ideas stay in the language you spoke and are never translated.

## Configuration

| `.env` variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | none | Required |
| `OPENAI_BASE_URL` | OpenAI's own API | Set to `https://elm.edina.ac.uk/api/v1` for ELM |
| `OPENAI_MODEL` | `gpt-5.6-sol` | Model that organizes ideas |
| `OPENAI_TRANSCRIBE_MODEL` | `whisper-1` | Transcription model. Only `whisper-1` can detect missed audio |

## Known limits

- Each audio file must be under 25 MB. In-app recording stops by itself after about 2.5 hours; a Voice Memo can reach 25 MB in about 25 minutes.
- The map lives only in the phone's browser and is lost if you switch phones or clear site data. Copy a backup from the "Outline" tab.
- The map appears after you stop recording; there is no live transcript while recording.
- `app/index.html` is also the source of the claude.ai version, which can't record.

## Tests

```bash
npm test
```
