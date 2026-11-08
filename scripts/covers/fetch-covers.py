#!/usr/bin/env python3
"""
Collect a cover image for every book in the local library.

Usage:
  python scripts/covers/fetch-covers.py [--out temp/covers] [--epub-dir temp/books]
                                        [--overrides scripts/covers/overrides.json]
                                        [--sheet temp/covers-sheet.png] [--force]

Each cover is written to <out>/<directory>/<fileName>.jpg, the same layout as the
`covers/` prefix of the BookCovers bucket that /api/covers reads. Upload with:
  aws s3 sync temp/covers s3://<BookCovers bucket>/covers/ --exclude manifest.json \
    --content-type image/jpeg

Covers are copyrighted, so they live in the bucket and temp/ (gitignored), never in git.
"""

import argparse
import difflib
import io
import json
import posixpath
import re
import subprocess
import sys
import time
import unicodedata
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

DB_CONTAINER = "yomi-sapo-db"
NDL_SEARCH_URL = "https://ndlsearch.ndl.go.jp/api/opensearch"
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
}
FETCH_ATTEMPTS = 3
FETCH_TIMEOUT_SECS = 60
MAX_COVER_HEIGHT_PX = 600
MIN_COVER_HEIGHT_PX = 100
MIN_TITLE_SIMILARITY = 0.75
MIN_PREFIX_MATCH_CHARS = 5
NDL_DELAY_SECS = 1.0
SHEET_FONT_PATH = "C:/Windows/Fonts/YuGothM.ttc"

TEXT_SUFFIXES = re.compile(r"-(rephrase-furigana|rephrase|furigana)$")
PUBLISHER_LABEL = re.compile(r"\s*[(（][^()（）]*(文庫|新書|BOOKS|出版)[^()（）]*[)）]\s*$")
EDITION_TAG = re.compile(r"【[^】]*】")
MATCH_NOISE = re.compile(r"[\s\-‐―－~～・:：、。,.!?「」『』()（）\[\]【】〈〉《》\"'“”]")
TRAILING_VOLUME = re.compile(r"(\d+)$")
AUTHOR_HEADER = re.compile(r"Author:\s*([^\n<\[]+)")


def normalize_for_match(text):
    folded = unicodedata.normalize("NFKC", text).lower()
    return MATCH_NOISE.sub("", folded)


def book_title(directory, file_name):
    nested_leaf = directory.split("/")[-1] if "/" in directory else None
    return TEXT_SUFFIXES.sub("", nested_leaf or file_name)


def search_title(title):
    folded = unicodedata.normalize("NFKC", title)
    return PUBLISHER_LABEL.sub("", EDITION_TAG.sub("", folded)).strip()


def list_library_books():
    query = (
        "SELECT directory, file_name, left(content, 400) FROM text_entries "
        "ORDER BY directory, file_name"
    )
    rows = subprocess.run(
        ["docker", "exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", "yomi_sapo",
         "-At", "-F", "\x1f", "-R", "\x1e", "-c", query],
        capture_output=True, check=True, encoding="utf-8",
    ).stdout
    books = []
    for row in filter(None, rows.split("\x1e")):
        directory, file_name, head = row.strip("\n").split("\x1f")
        author_match = AUTHOR_HEADER.search(head)
        books.append({
            "key": f"{directory}/{file_name}",
            "directory": directory,
            "file_name": file_name,
            "title": book_title(directory, file_name),
            "author": author_match.group(1).strip() if author_match else None,
        })
    return books


def is_same_book(first, second):
    shorter, longer = sorted((first, second), key=len)
    if not longer.startswith(shorter):
        return False
    # A digit right after the shared prefix means another volume: "幼女戦記1" vs "幼女戦記10".
    return not longer[len(shorter):][:1].isdigit()


def find_epub(epub_dir, title):
    wanted = normalize_for_match(title)
    return next(
        (path for path in sorted(epub_dir.glob("*.epub")) if is_same_book(normalize_for_match(path.stem), wanted)),
        None,
    )


def find_cover_item(opf, items):
    by_property = next(
        (item for item in items if "cover-image" in (item.get("properties") or "").split()), None
    )
    if by_property is not None:
        return by_property
    cover_meta = next(
        (meta for meta in opf.iter() if meta.tag.endswith("meta") and meta.get("name") == "cover"), None
    )
    cover_id = cover_meta.get("content") if cover_meta is not None else None
    by_meta = next((item for item in items if cover_id and item.get("id") == cover_id), None)
    if by_meta is not None:
        return by_meta
    return next(
        (item for item in items
         if "cover" in (item.get("id") or "").lower()
         and (item.get("media-type") or "").startswith("image/")),
        None,
    )


def read_epub_cover(epub_path):
    with zipfile.ZipFile(epub_path) as archive:
        container = ET.fromstring(archive.read("META-INF/container.xml"))
        opf_path = next(el for el in container.iter() if el.tag.endswith("rootfile")).get("full-path")
        opf = ET.fromstring(archive.read(opf_path))
        items = [el for el in opf.iter() if el.tag.endswith("item") and el.get("href")]
        cover_item = find_cover_item(opf, items)
        if cover_item is None:
            return None
        href = urllib.parse.unquote(cover_item.get("href"))
        return archive.read(posixpath.normpath(posixpath.join(posixpath.dirname(opf_path), href)))


def fetch(url, params=None):
    for attempt in range(FETCH_ATTEMPTS - 1):
        try:
            return requests.get(url, params=params, headers=BROWSER_HEADERS, timeout=FETCH_TIMEOUT_SECS)
        except requests.RequestException:
            time.sleep(2 * (attempt + 1))
    return requests.get(url, params=params, headers=BROWSER_HEADERS, timeout=FETCH_TIMEOUT_SECS)


def isbn10_from_13(isbn13):
    core = isbn13[3:12]
    weighted = sum((10 - position) * int(digit) for position, digit in enumerate(core))
    check = (11 - weighted % 11) % 11
    return core + ("X" if check == 10 else str(check))


def japanese_isbn13(raw):
    digits = raw.replace("-", "").strip()
    if len(digits) == 13 and digits.startswith("9784"):
        return digits
    if len(digits) != 10 or not digits.startswith("4"):
        return None
    core = "978" + digits[:9]
    total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(core))
    return core + str((10 - total % 10) % 10)


def parse_ndl_item(item):
    title = re.search(r"<title>([^<]*)</title>", item).group(1)
    volume = re.search(r"<dcndl:volume>([^<]*)</dcndl:volume>", item)
    raw_isbns = re.findall(r'<dc:identifier xsi:type="dcndl:ISBN(?:13)?">([^<]*)</dc:identifier>', item)
    isbn = next((i for i in map(japanese_isbn13, raw_isbns) if i), None)
    label = f"{title.split(' : ')[0]} {volume.group(1) if volume else ''}".strip()
    return {"title": title, "label": label, "isbn": isbn} if isbn else None


def ndl_candidates(title, author):
    params = {"title": title, "cnt": 20, "mediatype": "books"}
    if author:
        params["creator"] = author
    time.sleep(NDL_DELAY_SECS)
    response = fetch(NDL_SEARCH_URL, params)
    response.raise_for_status()
    items = re.findall(r"<item>.*?</item>", response.text, re.S)
    return [candidate for candidate in map(parse_ndl_item, items) if candidate]


def has_volume(text, volume):
    # Numeric, so NDL's zero-padded "01" counts as volume 1 but "11" does not.
    return any(int(number) == int(volume) for number in re.findall(r"\d+", normalize_for_match(text)))


def title_score(query, candidate):
    wanted = normalize_for_match(query)
    label = normalize_for_match(candidate["label"])
    # NDL often stores the main title alone, so a label that starts the query also matches.
    starts_query = len(label) >= MIN_PREFIX_MATCH_CHARS and wanted.startswith(label)
    if wanted == label or wanted in normalize_for_match(candidate["title"]) or starts_query:
        return 1.0
    return difflib.SequenceMatcher(None, wanted, label).ratio()


def pick_candidate(query, candidates):
    volume = TRAILING_VOLUME.search(normalize_for_match(query))
    same_volume = [c for c in candidates if volume is None or has_volume(c["label"], volume.group(1))]
    wanted = normalize_for_match(query)
    ranked = sorted(
        same_volume,
        key=lambda c: (normalize_for_match(c["label"]) == wanted, title_score(query, c)),
        reverse=True,
    )
    if not ranked or title_score(query, ranked[0]) < MIN_TITLE_SIMILARITY:
        return None
    return ranked[0]


def resolve_isbn(book):
    query = search_title(book["title"])
    candidates = ndl_candidates(query, book["author"]) or ndl_candidates(query, None)
    return pick_candidate(query, candidates)


def image_if_usable(response):
    if not response.ok or not response.headers.get("content-type", "").startswith("image"):
        return None
    if Image.open(io.BytesIO(response.content)).height < MIN_COVER_HEIGHT_PX:
        return None
    return response.content


def cover_for_isbn(isbn13):
    amazon = fetch(f"https://m.media-amazon.com/images/P/{isbn10_from_13(isbn13)}.01.L.jpg")
    return image_if_usable(amazon) or image_if_usable(fetch(f"https://www.hanmoto.com/bd/img/{isbn13}.jpg"))


def scaled_to_max_height(image):
    if image.height <= MAX_COVER_HEIGHT_PX:
        return image
    width = round(image.width * MAX_COVER_HEIGHT_PX / image.height)
    return image.resize((width, MAX_COVER_HEIGHT_PX), Image.LANCZOS)


def to_jpeg(image_bytes):
    image = scaled_to_max_height(Image.open(io.BytesIO(image_bytes)).convert("RGB"))
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=85, optimize=True)
    return buffer.getvalue()


def collect_cover(book, epub_dir, override):
    if override.get("skip"):
        return None, {"source": "skipped"}
    if override.get("file"):
        return Path(override["file"]).read_bytes(), {"source": "file-override", "file": override["file"]}
    if override.get("isbn"):
        return cover_for_isbn(override["isbn"]), {"source": "isbn-override", "isbn": override["isbn"]}
    epub_path = find_epub(epub_dir, book["title"])
    epub_cover = read_epub_cover(epub_path) if epub_path else None
    if epub_cover:
        return epub_cover, {"source": "epub", "epub": epub_path.name}
    match = resolve_isbn(book)
    if match is None:
        return None, {"source": "not-found"}
    return cover_for_isbn(match["isbn"]), {"source": "ndl", "isbn": match["isbn"], "matched": match["label"]}


def collect_or_record_failure(book, epub_dir, override):
    try:
        return collect_cover(book, epub_dir, override)
    except requests.RequestException as error:
        return None, {"source": "fetch-failed", "error": str(error)[:200]}


def draw_review_sheet(entries, out_dir, sheet_path):
    tile_w, image_h, caption_h, columns = 200, 286, 64, 6
    rows = (len(entries) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * tile_w, rows * (image_h + caption_h)), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(SHEET_FONT_PATH, 13)
    for index, (key, info) in enumerate(entries):
        left = (index % columns) * tile_w
        top = (index // columns) * (image_h + caption_h)
        cover_path = out_dir / f"{key}.jpg"
        if cover_path.exists():
            thumb = Image.open(cover_path).convert("RGB")
            thumb.thumbnail((tile_w - 10, image_h - 6))
            sheet.paste(thumb, (left + (tile_w - thumb.width) // 2, top + 3))
        caption = key.split("/")[-1]
        draw.text((left + 5, top + image_h + 2), f"{index + 1}. {caption[:12]}", fill="black", font=font)
        draw.text((left + 5, top + image_h + 22), caption[12:26], fill="black", font=font)
        draw.text((left + 5, top + image_h + 42), info.get("source", "?"), fill="gray", font=font)
    sheet.save(sheet_path)


def save_manifest(manifest_path, manifest):
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")


def parse_args():
    parser = argparse.ArgumentParser(description="Collect cover images for every library book")
    parser.add_argument("--out", default="temp/covers")
    parser.add_argument("--epub-dir", default="temp/books")
    parser.add_argument("--overrides", default="scripts/covers/overrides.json")
    parser.add_argument("--sheet", help="write a PNG contact sheet for visual review")
    parser.add_argument("--force", action="store_true", help="refetch covers that already exist")
    return parser.parse_args()


def main():
    args = parse_args()
    out_dir = Path(args.out)
    overrides_path = Path(args.overrides)
    overrides = json.loads(overrides_path.read_text(encoding="utf-8")) if overrides_path.exists() else {}
    manifest_path = out_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}

    for book in list_library_books():
        key = book["key"]
        cover_path = out_dir / f"{key}.jpg"
        # Only a cover the manifest knows about is reviewed, so only that one may be skipped.
        is_reviewed = cover_path.exists() and key in manifest
        if is_reviewed and not args.force and key not in overrides:
            continue
        cover_bytes, info = collect_or_record_failure(book, Path(args.epub_dir), overrides.get(key, {}))
        print(f"{info['source']:<13} {key}", flush=True)
        if cover_bytes is not None:
            cover_path.parent.mkdir(parents=True, exist_ok=True)
            cover_path.write_bytes(to_jpeg(cover_bytes))
        manifest[key] = info
        save_manifest(manifest_path, manifest)

    missing = [key for key in manifest if not (out_dir / f"{key}.jpg").exists()]
    print(f"\n{len(manifest) - len(missing)} covers, {len(missing)} missing")
    for key in missing:
        print(f"  missing: {key} ({manifest[key]['source']})")
    if args.sheet:
        draw_review_sheet(sorted(manifest.items()), out_dir, args.sheet)
        print(f"review sheet: {args.sheet}")


if __name__ == "__main__":
    sys.exit(main())
