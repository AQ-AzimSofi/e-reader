# Codebase Structure

This document describes the project structure for the よみサポ application.

## Directory Overview

```
yomi-sapo/
├── app/                    # Next.js App Router
│   ├── api/                # API routes
│   ├── components/         # Shared React components
│   ├── hooks/              # Custom React hooks
│   └── [pages]/            # Page directories
├── lib/                    # Core business logic
│   ├── ai/                 # AI/Gemini integration
│   ├── db/                 # Database layer
│   ├── services/           # Business services
│   ├── utils/              # Utility functions
│   ├── auth/               # Authentication
│   └── middleware/         # Request middleware
├── scripts/                # Utility scripts (Python/JS/TS)
├── public/                 # Static assets & text files
├── docs/                   # Documentation
└── prisma/                 # Database schema (legacy)
```

---

## App Directory (`/app`)

### API Routes (`/app/api`)

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/books` | GET, POST | List/create books |
| `/api/books/[id]` | GET, PUT, DELETE | Single book operations |
| `/api/books/[id]/images` | GET, POST | Book images |
| `/api/vocabulary` | GET, POST | Vocabulary entries |
| `/api/vocabulary/[id]` | GET, PUT, DELETE | Single vocabulary entry |
| `/api/read-public-txt` | GET | Read text file content |
| `/api/write-public-txt` | POST | Write text file |
| `/api/write-public-txt-ai` | POST | Write AI-processed text |
| `/api/read-bookmark` | GET | Get bookmark position |
| `/api/write-bookmark` | POST | Update bookmark |
| `/api/list-text-files` | GET | List available text files |
| `/api/text-entries` | GET, DELETE, PUT | Database text entries |
| `/api/text-entries/sync` | POST | Sync DB with filesystem |
| `/api/text-entries/reset` | POST | Reset text entries |
| `/api/gemini-api` | POST | Direct Gemini API |
| `/api/explain-sentence` | POST | Sentence explanations |
| `/api/tts` | POST | Text-to-speech |
| `/api/ruby-registry` | GET, POST | Furigana registry |
| `/api/init-db` | GET | Initialize database tables |
| `/api/health` | GET | Health check |
| `/api/auth` | POST | Authentication |

### Components (`/app/components`)

```
components/
├── icons/              # Icon components
│   ├── BookmarkFilled.tsx
│   ├── BookmarkUnfilled.tsx
│   ├── ChevronDown.tsx
│   ├── ChevronUp.tsx
│   └── SpeakerIcon.tsx
└── ui/                 # UI components
    ├── TopNavigation.tsx       # Main navigation (file selector, toggles)
    ├── CollapsibleItem.tsx     # Collapsible text with rephrasing
    ├── Sidebar.tsx             # Reading progress sidebar
    ├── ExplanationSidebar.tsx  # AI explanations panel
    ├── ParagraphItem.tsx       # Individual paragraph
    ├── Pagination.tsx          # Page navigation
    ├── FileSelector.tsx        # File dropdown
    ├── ReadingControls.tsx     # Font/line height controls
    ├── TTSButton.tsx           # Text-to-speech button
    ├── TTSPlayerBar.tsx        # TTS player UI
    ├── VocabularySidebar.tsx   # Vocabulary panel
    ├── VocabularySaveDialog.tsx
    ├── RubyLookupSidebar.tsx   # Furigana lookup
    └── BookImage.tsx           # Book cover display
```

### Hooks (`/app/hooks`)

| Hook | Purpose |
|------|---------|
| `useBookmark` | Manage bookmark state |
| `useTextContent` | Load/manage text file content |
| `useTextFileList` | Fetch available text files |
| `useReadingProgress` | Track reading progress |
| `useExplanationCache` | Cache AI explanations in localStorage |
| `useBookMetadata` | Load book metadata from JSON |
| `useTTS` | Text-to-speech control |
| `useRubyRegistry` | Manage furigana registry |

**Barrel Export:** Import from `@/app/hooks`

```typescript
import { useBookmark, useTextContent } from '@/app/hooks';
```

### Pages

| Page | Path | Description |
|------|------|-------------|
| Home | `/` | Main reading interface |
| Read | `/read` | Enhanced reader |
| Library | `/library` | Book library |
| Visual Novel | `/visual-novel` | Real-time VN text capture |
| OCR | `/ocr` | Image text extraction |
| Text Input | `/text-input` | Manual text entry |
| Text Input AI | `/text-input-ai` | AI-processed text entry |
| Vocabulary | `/vocabulary` | Vocabulary tracker |
| Ruby Registry | `/ruby-registry` | Furigana management |
| Login | `/login` | Authentication |

---

## Lib Directory (`/lib`)

### AI Module (`/lib/ai`)

Handles all Gemini AI integration.

```
ai/
├── index.ts            # Barrel export
├── client.ts           # AI client singleton (server-only)
├── generate.ts         # Content generation function
└── prompts/
    ├── index.ts        # Prompts barrel export
    ├── rephrase.ts     # Text rephrasing prompts
    ├── ocr.ts          # OCR extraction prompt
    └── explanation.ts  # Sentence explanation prompts (5 modes)
```

**Usage:**
```typescript
// Server-only (API routes)
import { getAIClient, generateGeminiContent } from '@/lib/ai';

// Client-safe (prompts only)
import { ai_instructions, ai_instructions_quick } from '@/lib/ai';
```

### Database Layer (`/lib/db`)

Raw SQL database operations using the `postgres` library.

```
db/
├── index.ts                # Barrel export
├── connection.ts           # PostgreSQL connection pool
├── schema.ts               # TypeScript interfaces & CREATE TABLE SQL
├── queries.ts              # Bookmark & text entry queries
├── bookQueries.sql.ts      # Book/image queries (replaced Prisma)
└── vocabularyQueries.sql.ts # Vocabulary queries (replaced Prisma)
```

**Key Interfaces:**
- `Book`, `BookImage`, `ProcessingHistory`
- `UserBookmark`, `VocabularyEntry`
- `Bookmark`, `TextEntry`

**Usage:**
```typescript
import { getBookmark, upsertBookmark } from '@/lib/db';
import { getBooks, createBook } from '@/lib/db';
import { getVocabularyEntries } from '@/lib/db';
```

### Services (`/lib/services`)

```
services/
├── index.ts            # Barrel export
└── fileService.ts      # File system operations
```

**fileService functions:**
- `readTextFile(fileName, directory?)`
- `writeTextFile(fileName, content, directory?)`
- `readBookmark(fileName, directory?)`
- `updateBookmark(fileName, content, directory?)`
- `listTextFiles()` - Returns `{directories, filesByDirectory, files}`
- `syncBookmarks()` - Cleanup + initialize bookmarks

### Utilities (`/lib/utils`)

```
utils/
├── index.ts                # Barrel export
├── furiganaParser.ts       # Parse kanji[furigana] and <ruby> tags
├── dictionaryParser.ts     # Parse word[reading・meaning] format
├── progressCalculator.ts   # Calculate reading progress
├── ttsTextCleaner.ts       # Clean text for TTS
├── markdownParser/         # AI response parser
│   ├── index.ts
│   ├── validator.ts
│   ├── normalizer.ts
│   └── splitter.ts
└── validation/             # Input validation
    ├── index.ts
    └── pathValidator.ts    # Path traversal prevention
```

**Usage:**
```typescript
import { parseFurigana, parseMarkdown, validateFileName } from '@/lib/utils';
```

### Other Lib Modules

```
lib/
├── constants.ts        # App configuration (AI_MODELS, API_ROUTES, etc.)
├── types.ts            # TypeScript type definitions
├── auth/
│   ├── password.ts     # Password hashing
│   └── session.ts      # Session management
├── middleware/
│   └── auth.ts         # Auth middleware
└── storage/
    └── blobStorage.ts  # Blob storage operations
```

---

## Scripts Directory (`/scripts`)

Utility scripts for data processing:

| Script | Language | Purpose |
|--------|----------|---------|
| `add-furigana.js` | JavaScript | Add furigana to text |
| `add-furigana-improved.js` | JavaScript | Improved furigana processing |
| `add-furigana-final.js` | JavaScript | Final furigana version |
| `clean-and-add-furigana.js` | JavaScript | Clean text + add furigana |
| `epub-to-text.py` | Python | Convert EPUB to text |
| `epub-to-text-furigana.py` | Python | EPUB to text with furigana |
| `extract-ruby-from-epub.py` | Python | Extract ruby annotations |
| `add-furigana-to-text.py` | Python | Python furigana processor |
| `batch-rephrase.ts` | TypeScript | Batch AI rephrasing |
| `migrate-ruby-registry.py` | Python | Ruby registry migration |

---

## Public Directory (`/public`)

Static assets and text files:

```
public/
├── bookv1-rephrase/    # AI-rephrased books
├── bookv2-furigana/    # Books with furigana
├── bookv3-rephrase/    # Additional rephrased books
└── [other assets]
```

---

## Database Schema

Tables are created via `/api/init-db`:

| Table | Purpose |
|-------|---------|
| `bookmarks` | File-based bookmark positions |
| `text_entries` | Stored text content |
| `books` | Book metadata from EPUB |
| `book_images` | Images extracted from EPUB |
| `processing_history` | EPUB processing records |
| `user_bookmarks` | User bookmarks linked to books |
| `vocabulary_entries` | User vocabulary diary |

---

## Import Conventions

Use barrel exports for cleaner imports:

```typescript
// Database
import { getBookmark, getBooks, getVocabularyEntries } from '@/lib/db';

// Services
import { readTextFile, listTextFiles } from '@/lib/services';

// Utilities
import { parseFurigana, parseMarkdown, validateFileName } from '@/lib/utils';

// AI
import { getAIClient, ai_instructions } from '@/lib/ai';

// Hooks
import { useBookmark, useTextContent } from '@/app/hooks';
```

---

## Environment Variables

Required in `.env.local`:

```bash
# AI Service
GEMINI_API_KEY=your_api_key

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
POSTGRES_URL=postgresql://user:pass@localhost:5432/dbname

# Auth (optional)
AUTH_PASSWORD_HASH=bcrypt_hash
```

---

## Development Commands

```bash
npm run dev           # Start dev server (port 3333)
npm run build         # Production build
npm run db:start      # Start PostgreSQL container
npm run db:init       # Initialize database schema
npm run db:migrate    # Migrate text files to database
```
