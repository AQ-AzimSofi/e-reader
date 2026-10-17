# Scripts Directory

This directory contains Python utility scripts for processing Japanese text and EPUB files.

## Contents

- **epub-to-text-furigana.py** - Converts EPUB files to plain text with furigana
- **furigana_helper.py** - Helper functions for MeCab-based furigana generation
- **requirements.txt** - Python dependencies
- **README-epub-converter.md** - Detailed documentation for the EPUB converter

## Quick Start

### 1. Create Virtual Environment (Recommended)

```bash
# From the scripts directory
cd scripts

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate
```

### 2. Install Dependencies

```bash
# Make sure you're in the activated virtual environment
pip install -r requirements.txt
```

This will install:
- `ebooklib` - EPUB file parsing
- `beautifulsoup4` - HTML/XML parsing
- `lxml` - XML processing
- `mecab-python3` - Japanese morphological analysis
- `unidic-lite` - Japanese dictionary for MeCab

### 3. Verify Installation

```bash
python3 -c "import MeCab; print('MeCab installed successfully!')"
```

### 4. Run Scripts

```bash
# Convert an EPUB file (from scripts directory)
python epub-to-text-furigana.py path/to/book.epub

# Or from project root
python scripts/epub-to-text-furigana.py path/to/book.epub
```

## EPUB Converter

For detailed documentation on the EPUB to Text converter, see [README-epub-converter.md](./README-epub-converter.md).

## Audiobook Narration (`audio/`)

Lets the reader's play button use a real narration instead of Google TTS. Needs the
recording plus a transcript of it — not the ebook text, it must match what is spoken.

```bash
# 1. Align transcript to audio -> .srt (for eyeballing) + .timings.json
python scripts/audio/align-transcript.py "book.m4b" "book.txt"

# 2. Map those cues onto reader units -> a build artifact (cue positions only)
npx tsx scripts/audio/build-narration.ts \
  --timings "book.timings.json" \
  --text "public/bookv2-furigana/<book>/<book>.txt" \
  --out "temp/<book>.narration.json"

# 3. Re-encode for the browser, then upload to the private narration bucket
ffmpeg -i "book.m4b" -map 0:a:0 -c:a aac -b:a 40k -ac 1 -ar 22050 \
  -movflags +faststart -map_metadata -1 "temp/<book>.m4a"
aws s3 cp "temp/<book>.m4a" "s3://$BUCKET/<book>.m4a" --region ap-northeast-1

# 4. Pair the cues with the S3 key in the database
npx tsx scripts/db/sync-narration.ts \
  --manifest "temp/<book>.narration.json" \
  --audio-key "<book>.m4a" \
  --directory "bookv2-furigana" \
  --file-name "<book>"
```

The aligner uses no ASR. Container chapter marks are exact anchors, ffmpeg
`silencedetect` supplies candidate boundaries, and MeCab mora counts predict
relative duration within a chapter; a DP then picks the boundaries chapter by
chapter. It prints a mora/s spread — a tight p05..p95 means a good alignment.
It refuses to write anything when a chapter falls back to proportional timings
or a chapter title matches too weakly, since both produce plausible-looking cues
that land mid-speech.

Notes:

- Nothing here goes in `public/`. Book assets under `public/bookv2-furigana/` are
  gitignored and CI deploys from a plain checkout, so a file placed there never
  reaches production; the repo is also public, so a recording's location must not
  be committed. Cues live in the `narration` table and the audio lives in a private
  S3 bucket, which `GET /api/narration` pairs into a short-lived presigned URL
- That route requires a session, so the guest preview never receives a recording
- `--text` must be the same revision that was synced to `text_entries`. The reader
  builds its units from Postgres, and cues are positional — if the two have drifted
  by a paragraph, every later line plays the wrong audio. `unitCount` lets the
  reader reject text that has grown, but shorter text is accepted as a prefix
  (that is how the guest preview arrives), so a same-length edit or a deleted
  paragraph both slip through. Rebuild whenever you re-process a book
- Requires `ffmpeg` and `ffprobe` on PATH, and the container must have chapter marks
- Manifest cue indices are `PlayableUnit.globalIndex`; `null` falls back to TTS
- Rephrased text has no recording, so `sub` playback stays on TTS

## Kindle Page Turner (`kindle/`)

Turns Kindle Cloud Reader pages on a timer in a Chromium you are already signed in
to. It attaches over CDP instead of launching a browser, so the session, cookies and
open book stay yours.

```bash
# 1. On the browser machine, start Chromium with remote debugging (once per launch)
chromium --remote-debugging-port=9222 --user-data-dir="$HOME/.kindle-chromium"

# 2. If the script runs on another machine, tunnel the port instead of exposing it
ssh -N -L 9222:127.0.0.1:9222 user@linux-host

# 3. Open a book at read.amazon.co.jp, then
npx tsx scripts/kindle/page-turner.ts --interval 30
```

Flags: `--interval <secs>` (default 30), `--cdp <url>` (default
`http://127.0.0.1:9222`), `--direction rtl|ltr` (default: probed). Ctrl+C stops.

Notes:

- Never bind the debugging port to a public interface. Anyone who reaches it
  controls the signed-in browser, Amazon account included
- Chrome 136+ ignores `--remote-debugging-port` on the default profile, hence
  `--user-data-dir`. Sign in once in that profile and it persists
- Vertical Japanese books advance with ArrowLeft, horizontal ones with ArrowRight.
  The script presses ArrowLeft once at startup, checks whether the location went
  up, and steps back, so you see one quick flicker
- Page turns are detected from the footer location (`位置12/2218`) and the
  `#kr-renderer` page images. If Amazon changes the reader, update
  `READER_SELECTORS` in the script
- It stops when a key press no longer changes the page: the end of the book, or
  the reader stopped responding

## Virtual Environment Notes

**Important:** The `venv/` directory should NOT be committed to git. It's already in `.gitignore`.

Each developer should create their own virtual environment locally:

```bash
cd scripts
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
```

## Deactivating Virtual Environment

When you're done using the scripts:

```bash
deactivate
```

## Troubleshooting

### "Command not found: python3"

Try `python` instead of `python3`:

```bash
python -m venv venv
```

### Permission errors on macOS/Linux

Make the script executable:

```bash
chmod +x epub-to-text-furigana.py
```

### MeCab installation fails

Install system dependencies first:

**macOS:**
```bash
brew install mecab
```

**Ubuntu/Debian:**
```bash
sudo apt-get install mecab libmecab-dev mecab-ipadic-utf8
```

Then retry:
```bash
pip install mecab-python3 unidic-lite
```

## Integration with Main App

These scripts are standalone utilities and do NOT run as part of the main Next.js application. They are used offline to prepare text files that are then read by the web app.

The main Next.js app (`npm run dev`) is configured to ignore this directory to avoid file watcher issues with the large `venv/` folder.
