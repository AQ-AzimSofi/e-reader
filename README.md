# よみサポ

よみサポ is a full-stack web app for Japanese language learners. It started as a tool for reading Visual Novels (capturing in-game text via Textractor and AI-rephrasing it for comprehension) and has grown into a complete reading app for books, with furigana, AI assistance, text-to-speech, and vocabulary tracking.

Live at **https://yomi-sapo.click** (password login, with a guest preview of a few books).

---
<details>
<summary>Demo (Early prototype)</summary>

This video demonstrates よみサポ in operation, showcasing its text processing and AI rephrasing capabilities.

https://github.com/user-attachments/assets/16d81533-e417-4123-b764-a0066d0b6c84
</details>

---

## Features

### Reading
*   **Library** — browse processed books in a grid with reading progress, sorting, and covers.
*   **Reader** — paginated reading with per-word **furigana** (toggle), AI **rephrased** simplifications (expandable inline), adjustable font size / line height, and dark mode.
*   **Bookmarks** — resume where you left off, per book.

### AI assistance (Google Gemini)
*   **Sentence explanations** — tap a sentence for a Japanese explanation, with multiple modes (concise, story, nuance, speaker, structure) and caching.
*   **Tap-to-translate** — quick English translation of any line (Google Translate).
*   **Prioritize (beta)** — rates every sentence on the current page 1–5 for importance (via `gemini-3.5-flash`) and color-codes the page so you can skim to what matters.

### Audio
*   **Text-to-speech & audiobook mode** — read pages aloud with adjustable speed and voice, continuous playback, keyboard controls on desktop, and a replay-current-sentence button on mobile (Google Cloud TTS).

### Study
*   **Vocabulary tracker** — save words together with their sentence context.
*   **Ruby lookup** — per-book kanji→reading registry.

### Visual novels
*   **Real-time capture** — pulls in-game text via Textractor + a clipboard inserter and AI-rephrases it on the fly.

### Access
*   **Password login** for the full library, plus a **guest preview**: a few books are readable without signing in, capped to the first few pages (copyright-safe). In guest mode, AI explanation / TTS / translation run on the visitor's **own** API keys, stored only in their browser.

---

## EPUB Processing

よみサポ can process EPUB files to extract text with furigana annotations and images for reading in the app.

### Prerequisites

Install Python dependencies:

```bash
pip install -r scripts/requirements.txt
# Or install with --break-system-packages on managed systems:
pip install -r scripts/requirements.txt --break-system-packages
```

### Processing an EPUB

Basic usage:

```bash
python3 scripts/epub-to-text-furigana.py path/to/your-book.epub
```

Options:
- `--filter n3`: Only add furigana to N3+ (advanced) kanji
- `--hiragana-style long-vowel`: Use long vowel marks (ー) instead of full hiragana
- `--output ./custom/path`: Specify custom output directory

Examples:

```bash
# Process with all kanji getting furigana (default)
python3 scripts/epub-to-text-furigana.py book.epub

# Only add furigana to advanced kanji
python3 scripts/epub-to-text-furigana.py book.epub --filter n3

# Custom output location
python3 scripts/epub-to-text-furigana.py book.epub --output ./my-books/
```

### What the script does:

1. **Extracts and organizes files** into a book-specific directory:
   - Text file with furigana: `book-name/book-name.txt`
   - Metadata JSON: `book-name/book-name.json`
   - Images: `book-name/images/illustration-*.jpg/png`

2. **Image processing**:
   - Automatically detects and extracts cover image as `illustration-000.jpg`
   - Renames all images sequentially: `illustration-001.jpg`, `illustration-002.jpg`, etc.
   - Creates image mapping in JSON metadata for the app to use

3. **Text processing**:
   - Preserves existing furigana from the EPUB
   - Adds furigana to remaining kanji using MeCab
   - Builds dictionary of character names/terms for consistent readings
   - Processes all chapters and combines them

### Output location:

Files are created in: `public/bookv2-furigana/[book-name]/`

### Using processed books in the app:

Once processed, the book will automatically appear in the file selector dropdown in the app.

---

## Book Covers

Library cards show each book's cover. Covers are copyrighted, so they are never committed: they live in the private `BookCovers` S3 bucket under `covers/<directory>/<fileName>.jpg` and are served by `/api/covers`, which CloudFront caches. A book without a cover keeps the plain title card.

```bash
# 1. Collect a cover for every book in the local DB into temp/covers/, plus a review sheet
python scripts/covers/fetch-covers.py --sheet temp/covers-sheet.png

# 2. Check every cover on the sheet. For a wrong or missing match, add the edition's ISBN
#    to scripts/covers/overrides.json and run step 1 again (existing covers are kept).

# 3. Upload
BUCKET=$(aws s3api list-buckets --query "Buckets[?starts_with(Name, 'yomi-sapo-production-bookcoversbucket')].Name" --output text)
aws s3 sync temp/covers "s3://$BUCKET/covers/" --exclude manifest.json --content-type image/jpeg
```

Sources, in order: the cover declared in the book's own EPUB (`temp/books/*.epub`), then an ISBN found through the National Diet Library search with the image from Amazon or hanmoto. Self-published books without a Japanese ISBN need a manual cover.

---

## Content Management (Database-Only Architecture)

よみサポ uses a **database-first architecture** for managing book content. Text files are **not committed to the repository** to avoid copyright issues. Instead, content is stored in PostgreSQL and managed via admin API endpoints.

### Quick Start

1. **Set up environment variables**:

```bash
# Copy example file
cp .env.example .env.local

# Edit .env.local and set:
ADMIN_API_KEY=your_secure_random_key_here  # Generate with: openssl rand -hex 32
GEMINI_API_KEY=your_gemini_api_key
```

2. **Start the database** (development):

```bash
npm run db:start    # Start PostgreSQL container
npm run db:init     # Initialize tables
```

3. **Add books** (choose one method):

**Option A: Via Swagger UI** (Recommended for single files)
- Navigate to `http://localhost:3333/api-docs`
- Click "Authorize" and enter your `ADMIN_API_KEY`
- Use `POST /api/admin?action=text-entries` to upload book content

**Option B: Via EPUB Script** (Recommended for EPUB files)
```bash
export ADMIN_API_KEY=your_key_here
python3 scripts/epub-to-text-furigana.py book.epub --output-mode api
```

**Option C: Via Direct API Call**
```bash
curl -X POST 'http://localhost:3333/api/admin?action=text-entries' \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_key_here" \
  -d '{"fileName":"my-book","directory":"bookv2-furigana","content":"< 日本語のテキスト"}'
```

### Admin API Endpoints

All admin endpoints require the `x-api-key` header with your `ADMIN_API_KEY`.

The `/api/admin` route uses action-based routing with query parameters:

#### `POST /api/admin?action=text-entries`
Upload or update a single text entry.

**Request:**
```json
{
  "fileName": "my-book",
  "directory": "bookv2-furigana",
  "content": "< 今日は良い天気です。>> Today is nice weather. >> ..."
}
```

#### `POST /api/admin?action=bookmarks`
Set a bookmark position for a file.

**Request:**
```json
{
  "fileName": "my-book",
  "directory": "bookv2-furigana",
  "bookmarkText": "< 今日は良い天気です。"
}
```

#### `POST /api/admin?action=bulk-seed`
Upload multiple text entries at once.

**Request:**
```json
{
  "entries": [
    {
      "fileName": "book-1",
      "directory": "bookv2-furigana",
      "content": "..."
    },
    {
      "fileName": "book-2",
      "directory": "bookv2-furigana",
      "content": "..."
    }
  ]
}
```

### Interactive API Documentation

Access the Swagger UI at `http://localhost:3333/api-docs` for:
- Interactive endpoint testing
- Request/response examples
- API authentication setup

### EPUB Script API Mode

The EPUB processing script supports direct upload to the database:

```bash
# Set your API key
export ADMIN_API_KEY=your_key_here

# Process and upload directly to database (no files created)
python3 scripts/epub-to-text-furigana.py book.epub --output-mode api

# Optional: target another local/LAN dev server (defaults to http://localhost:3333).
# Production rejects API mode: it has no ADMIN_API_KEY.
export API_URL=http://192.168.1.15:3001
python3 scripts/epub-to-text-furigana.py book.epub --output-mode api
```

**API Mode Features:**
- Uploads text content directly to database
- Images still saved to `public/bookv2-furigana/[book-name]/images/`
- Metadata JSON still created for image references
- No text files created (database-only)

### Local Development Workflow

1. **Start services**:
```bash
npm run db:start    # Start PostgreSQL
npm run dev         # Start Next.js (port 3333)
```

2. **Add your books** via any method above

3. **Access app**: Open `http://localhost:3333`
   - Books automatically appear in dropdown
   - All content served from database

### Production Deployment

Production runs at https://yomi-sapo.click on AWS (Lambda + CloudFront via SST, `ap-northeast-1`) with a Neon PostgreSQL database.

1. **Deploy**: push to `main`. GitHub Actions runs `sst deploy --stage production`; the SST CLI does not run on Windows, so deploys only happen in CI.

2. **Secrets** live in AWS SSM Parameter Store (`ap-northeast-1`) as SecureString parameters named `yomi-sapo-production-<KEY>` (e.g. `GEMINI_API_KEY`, `DATABASE_URL`, `SESSION_SECRET`).

3. **Add books** to production: process them locally, then push the new rows with `npm run db:sync` and choose `[2] Push missing to prod` (the startup/shutdown sync in `npm run dev` does the same). Both need `PROD_DATABASE_URL` (the Neon connection string) in `.env.local`. The sync covers database rows only (text, bookmarks, vocabulary); illustrations and metadata JSON under `public/bookv2-furigana/` are gitignored, so they never reach production. The admin API is local-only: production has no `ADMIN_API_KEY`, so `/api/admin` returns 401 there.

### Important Notes

- **Text files are gitignored** - no copyrighted content in repository
- **Images are gitignored** - book covers/illustrations not committed
- **Database is the source of truth** - all text content stored in PostgreSQL
- **Directory structure preserved** - `.gitkeep` files maintain folder structure
- **ADMIN_API_KEY** - needed locally for the admin API and EPUB API mode; intentionally not set in production
- **Database backup** - recommended for production (Neon PG17); before risky changes run `docker run --rm postgres:17-alpine pg_dump '<NEON_URL>' --no-owner --no-acl > backup.sql` (the local PG15 tools refuse a newer server)

### Migrating Existing Files

If you have existing text files in `public/` and want to migrate them to the database:

```bash
# One-time migration
npm run db:migrate

# Or use the API endpoint
curl -X POST http://localhost:3333/api/migrate-text-files
```

After migration, the app will read from database instead of files.

