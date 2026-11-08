# EPUB to Text with Furigana Converter

A Python script that converts Japanese EPUB files to plain text while intelligently handling furigana (ruby annotations).

## Features

- **Preserves Existing Furigana**: Keeps all ruby tags already in the EPUB (especially important for character names and special terms)
- **Adds Missing Furigana**: Uses MeCab to add furigana to kanji that don't have it
- **Configurable Filtering**: Choose between:
  - **All kanji** (default) - Add furigana to every kanji without it
  - **N3+ only** - Only add furigana to advanced/rare kanji (beginner kanji like 人、日、食 are left as-is)
- **Command-line Interface**: Easy to use with file path arguments
- **Automatic Output**: Saves to `public/bookv2-furigana/` for immediate use in the reading app

## Installation

### 1. Install Python Dependencies

From the project root:

```bash
pip install -r scripts/requirements.txt
```

Or install individually:

```bash
pip install ebooklib beautifulsoup4 lxml mecab-python3 unidic-lite
```

### 2. Verify Installation

Test that MeCab is working:

```bash
python3 -c "import MeCab; print('MeCab installed successfully!')"
```

## Quick Start (With Virtual Environment)

If you have the virtual environment already set up at `scripts/venv/`:

```bash
# Activate venv and run the script
source scripts/venv/bin/activate && python3 scripts/epub-to-text-furigana.py path/to/book.epub

# With N3+ filtering
source scripts/venv/bin/activate && python3 scripts/epub-to-text-furigana.py path/to/book.epub --filter n3

# Example with actual file
source scripts/venv/bin/activate && python3 scripts/epub-to-text-furigana.py "temp/俺にトラウマを与えた女子達がチラチラ見てくるけど、残念ですが手遅れです 1.epub"
```

**Note for Ubuntu/Debian systems**: Use `python3` instead of `python`. The `python` command may not be available by default.

To create a `python` alias permanently:
```bash
sudo apt install python-is-python3
```

## Usage

### Basic Usage (Add Furigana to All Kanji)

```bash
python3 scripts/epub-to-text-furigana.py path/to/book.epub
```

This will:
- Extract all chapters from the EPUB
- Preserve existing furigana
- Add furigana to all remaining kanji
- Save to `public/bookv2-furigana/{book-title}.txt`

### Advanced Usage (N3+ Filtering)

```bash
python3 scripts/epub-to-text-furigana.py path/to/book.epub --filter n3
```

This only adds furigana to N3+ (advanced) kanji. Common beginner kanji (N4 and below) like these won't get furigana:
- Numbers: 一、二、三、四、五
- Time: 日、月、年、今、時
- People: 人、男、女、子、学、生
- Common verbs: 行、来、食、見、読
- And ~200 more common kanji

### Custom Output Directory

```bash
python3 scripts/epub-to-text-furigana.py book.epub --output ./my-books/
```

## Examples

### Example 1: Light Novel with Partial Furigana

```bash
$ python3 scripts/epub-to-text-furigana.py "俺にトラウマを与えた女子達.epub"

Processing EPUB: 俺にトラウマを与えた女子達.epub
Filtering mode: All kanji
Title: 俺にトラウマを与えた女子達がチラチラ見てくるけど、残念ですが手遅れです
Author: 著者名

Initializing MeCab (this may take a moment)...

Extracting chapters...
  Processing chapter 1... [OK]
  Processing chapter 2... [OK]
  Processing chapter 3... [OK]
  ...

Successfully processed 25 chapters

============================================================
[OK] Conversion complete!
============================================================
Output file: public/bookv2-furigana/俺にトラウマを与えた女子達がチラチラ見てくるけど、残念ですが手遅れです.txt
File size: 973.4 KB
Chapters: 25
Filter mode: All kanji
============================================================
```

### Example 2: With N3+ Filter

```bash
python3 scripts/epub-to-text-furigana.py book.epub --filter n3
```

**Input EPUB HTML:**
```html
彼女は<ruby>難読<rt>なんどく</rt></ruby>な文章を読んでいた。
```

**Output (N3+ filter):**
```html
<ruby>彼女<rt>かのじょ</rt></ruby>は<ruby>難読<rt>なんどく</rt></ruby>な<ruby>文章<rt>ぶんしょう</rt></ruby>を読んでいた。
```

Notice:
- Original `<ruby>難読<rt>なんどく</rt></ruby>` is preserved
- Advanced kanji like 彼女、文章 get new furigana
- Common kanji like 読 (N4 level) doesn't get furigana

## How It Works

### 1. EPUB Extraction
- Reads EPUB file (which is a ZIP containing XHTML chapters)
- Extracts chapters in reading order (spine)
- Preserves book metadata (title, author)

### 2. HTML Parsing
- Uses BeautifulSoup to parse each chapter's HTML
- Identifies existing `<ruby>` tags
- Removes non-content tags (scripts, styles, etc.)

### 3. Selective Furigana Addition
- Traverses DOM tree to find text nodes
- **Skips** text already inside `<ruby>` tags (preserves existing furigana)
- **Processes** plain text through MeCab morphological analyzer
- Applies N3+ filter if enabled (checks against N4 kanji list)
- Adds new `<ruby>` tags in format: `<ruby>漢字<rt>かんじ</rt></ruby>`

### 4. Output Generation
- Combines all chapters with metadata header
- Cleans up excessive whitespace
- Saves to `.txt` file with UTF-8 encoding

## Output Format

The script generates plain text files with HTML ruby tags:

```html
Title: Book Title
Author: Author Name

<ruby>目次<rt>もくじ</rt></ruby>

<ruby>第<rt>だい</rt></ruby>一<ruby>章<rt>しょう</rt></ruby>

彼は<ruby>学校<rt>がっこう</rt></ruby>へ<ruby>行<rt>い</rt></ruby>った。
```

These ruby tags are automatically parsed and displayed by your reading app's `furiganaParser.ts`.

## Troubleshooting

### Error: "Failed to initialize MeCab"

**Solution:** Install MeCab and the dictionary:
```bash
pip install mecab-python3 unidic-lite
```

### Error: "Missing required dependencies"

**Solution:** Install all dependencies:
```bash
pip install -r scripts/requirements.txt
```

### Warning: "File doesn't have .epub extension"

The script detected a non-.epub file. You can:
- Press `y` to continue anyway (if it's actually an EPUB with wrong extension)
- Press `n` to cancel and check the file

### Error: "No chapters could be extracted"

This can happen if:
- The EPUB is corrupted
- The EPUB uses non-standard formatting
- The EPUB is DRM-protected (not supported)

**Solution:** Try opening the EPUB in a reader like Calibre to verify it's valid.

### Output text looks garbled

**Solution:** Ensure your text editor/viewer supports UTF-8 encoding.

## Technical Details

### N4 Kanji List

The script uses a curated list of ~200 N4 and lower kanji based on JLPT guidelines. These are considered "beginner" kanji that intermediate learners should recognize without furigana.

The list is defined in `furigana_helper.py` and matches the one used in your existing `clean-and-add-furigana.js` script for consistency.

### MeCab vs Kuroshiro

This script uses **MeCab** instead of the Kuroshiro library used in your Node.js scripts because:
- More accurate for Japanese morphological analysis
- Industry standard (used by professional tools)
- Better handling of names and compound words
- Native Python support

### Ruby Tag Format

Output uses standard HTML5 ruby tags:
```html
<ruby>base<rt>annotation</rt></ruby>
```

This is compatible with:
- Your frontend `furiganaParser.ts`
- Web browsers (Chrome, Firefox, Safari all support ruby tags)
- Most Japanese reading apps and e-readers

## Integration with Your App

After conversion, the text file is automatically placed in `public/bookv2-furigana/` and will:

1. **Appear in file list**: Automatically detected by your app's file selector
2. **Display furigana**: Rendered by `furiganaParser.ts`
3. **Support bookmarks**: Bookmark system works normally
4. **Work with all features**: Collapsible items, dictionary parsing, etc.

## File Locations

```
yomi-sapo/
├── scripts/
│   ├── epub-to-text-furigana.py    # Main script (run this)
│   ├── furigana_helper.py           # Helper functions
│   ├── requirements.txt             # Python dependencies
│   └── README-epub-converter.md     # This file
│
└── public/
    └── bookv2-furigana/
        └── {book-title}.txt         # Output files (auto-created)
```

## Development

### Testing

To test with a sample EPUB:

```bash
# Download a free Japanese EPUB from Aozora Bunko or similar
# Then run:
python3 scripts/epub-to-text-furigana.py test-book.epub

# Check the output:
cat "public/bookv2-furigana/test-book.txt" | head -n 50
```

### Modifying the N4 Kanji List

Edit `scripts/furigana_helper.py` and modify the `N4_AND_LOWER_KANJI` set:

```python
N4_AND_LOWER_KANJI = set([
    '一', '二', '三',  # Add or remove kanji here
    # ...
])
```

## License

Part of the よみサポ project.

## Credits

- **MeCab**: Morphological analyzer
- **ebooklib**: EPUB parsing
- **BeautifulSoup**: HTML parsing
- **unidic-lite**: Japanese dictionary for MeCab
