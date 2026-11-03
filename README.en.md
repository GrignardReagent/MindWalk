# MindWalk

[中文](README.md) | English

Talk while you walk. Your words appear live in a box on screen and are then organized into a mind map. By default the models are called through the University of Edinburgh's ELM, and any OpenAI-compatible API also works.

## Android app

The app does what the web page does, but opens faster and records offline (clips are transcribed once you're back online). While it records with the screen locked, the notification bar shows it's recording, so Android doesn't cut off the microphone.

The app connects to the server you deploy, so do "Deploy to the web" below first. Then:

1. On your phone, download [the latest MindWalk.apk](https://github.com/GrignardReagent/MindWalk/releases/latest/download/MindWalk.apk). If the repository is private, sign in to GitHub on the phone first.
2. Tap the downloaded file to install it. The first time, Android asks you to allow installing unknown apps from your browser.
3. Open MindWalk and enter your server address (like `mindwalk.onrender.com`) and access key. You can change them later under "Connection" on the Outline tab.
4. Allow the microphone and notifications the first time you record.

Xiaomi, Huawei, OPPO, vivo and similar phones save battery aggressively. Try a few minutes with the screen locked first. If audio was missed, set MindWalk's battery setting to "Unrestricted" or allow it to run in the background.

Updates: every merge to `main` makes GitHub Actions build a new APK and publish it under Releases. Once the signing key below is set, install the new one over the old one and your data stays.

To build it yourself: `npm run build:app`, then open `android/` in Android Studio or run `cd android && ./gradlew assembleRelease`.

**Signing key (worth setting once)**: without one, every build has a different signature, so you must uninstall the old app before installing a new one, which deletes the map on the phone (copy a backup from the Outline tab first). To set one, run the commands below on your computer, then add two secrets under the repository's **Settings → Secrets and variables → Actions**: `ANDROID_KEYSTORE_BASE64` (the long string the second command prints) and `ANDROID_KEYSTORE_PASSWORD` (the password you chose). Keep the keystore file safe and out of the repository.

```bash
keytool -genkeypair -keystore mindwalk.keystore -alias mindwalk -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=MindWalk"
```

```bash
base64 -w0 mindwalk.keystore
```

## Deploy to the web

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

- **Model**: OpenAI's newest, `gpt-transcribe`, by default. If your provider (ELM, say) doesn't offer it, `gpt-4o-transcribe` and then `whisper-1` take over by themselves, and the server log says so once.
- **Language**: "Speech: Chinese / English / Chinese + English" at the bottom. Pick "Chinese + English" if you mix English words into Chinese. Chinese comes out in simplified characters with punctuation.
- **Context and keywords**: each clip is sent with the previous sentence, plus the words already on the map and `TRANSCRIBE_VOCAB` as keywords, so names are spelled consistently.
- **No phantom text**: silence is often transcribed as "Thank you for watching" or subtitle credits. These are filtered out.
- **Nothing lost**: each clip is saved on the phone and deleted only once it's transcribed. Offline clips are sent when you're back online.

You can also:

- List names and terms you say often in `TRANSCRIBE_VOCAB`, comma separated.
- Keep the phone in a shallow pocket, mic facing in when it's windy.

## Tidy map

Once the map has 2 or more ideas, a "Tidy map" button appears. It merges duplicates, moves misplaced ideas to the right branch and shortens long ones to keywords. Nothing is lost, and merged ideas keep their original words. Tap "Undo" if you don't like the result.

## Recording with the screen locked

| Phone | How to record |
|---|---|
| Android app | Tap "Start recording", then lock the screen. The notification bar shows it's recording |
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
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-transcribe` | Transcription model; falls back to `gpt-4o-transcribe`, then `whisper-1`, if unavailable |
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
