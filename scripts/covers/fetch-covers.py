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
MAX_COVER_HEIGHT_PX = 600
MIN_COVER_HEIGHT_PX = 100
MIN_TITLE_SIMILARITY = 0.75
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


def find_epub(epub_dir, title):
    wanted = normalize_for_match(title)
    for epub_path in sorted(epub_dir.glob("*.epub")):
        stem = normalize_for_match(epub_path.stem)
        if wanted.startswith(stem) or stem.startswith(wanted):
            return epub_path
    return None


def find_cover_item(opf, items):
    by_property = next(
        (item for item in items if "cover-image" in (item.get("properties") or "").split()), None
    )
    if by_property is not None:
        return by_property
    cover_meta = next(
        (meta for meta in opf.iter() if meta.tag.endswith("meta") and meta.get("name") == "cover"), None
    )
    if cover_meta is not None:
        by_meta = next((item for item in items if item.get("id") == cover_meta.get("content")), None)
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
    for attempt in range(3):
        try:
            return requests.get(url, params=params, headers=BROWSER_HEADERS, timeout=60)
        except requests.RequestException:
            time.sleep(2 * (attempt + 1))
    return None


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


def ndl_candidates(title, author):
    params = {"title": title, "cnt": 20, "mediatype": "books"}
    if author:
        params["creator"] = author
    time.sleep(NDL_DELAY_SECS)
    response = fetch(NDL_SEARCH_URL, params)
    if response is None or not response.ok:
        return []
    candidates = []
    for item in re.findall(r"<item>.*?</item>", response.text, re.S):
        candidate_title = re.search(r"<title>([^<]*)</title>", item).group(1)
        raw_isbns = re.findall(r'<dc:identifier xsi:type="dcndl:ISBN(?:13)?">([^<]*)</dc:identifier>', item)
        isbn = next((i for i in map(japanese_isbn13, raw_isbns) if i), None)
        if isbn:
            candidates.append({"title": candidate_title, "isbn": isbn})
    return candidates


def title_score(query, candidate_title):
    wanted = normalize_for_match(query)
    offered = normalize_for_match(candidate_title.split(" : ")[0])
    if wanted == offered or wanted in normalize_for_match(candidate_title):
        return 1.0
    return difflib.SequenceMatcher(None, wanted, offered).ratio()


def pick_candidate(query, candidates):
    volume = TRAILING_VOLUME.search(normalize_for_match(query))
    same_volume = [
        c for c in candidates
        if volume is None or volume.group(1) in normalize_for_match(c["title"])
    ]
    scored = sorted(same_volume, key=lambda c: title_score(query, c["title"]), reverse=True)
    if not scored or title_score(query, scored[0]["title"]) < MIN_TITLE_SIMILARITY:
        return None
    return scored[0]


def resolve_isbn(book):
    query = search_title(book["title"])
    candidates = ndl_candidates(query, book["author"]) or ndl_candidates(query, None)
    return pick_candidate(query, candidates)


def image_if_usable(response):
    if response is None or not response.ok:
        return None
    if not response.headers.get("content-type", "").startswith("image"):
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
    epub_path = Path(override["epub"]) if override.get("epub") else find_epub(epub_dir, book["title"])
    epub_cover = read_epub_cover(epub_path) if epub_path else None
    if epub_cover and not override.get("isbn"):
        return epub_cover, {"source": "epub", "epub": epub_path.name}
    if override.get("isbn"):
        return cover_for_isbn(override["isbn"]), {"source": "isbn-override", "isbn": override["isbn"]}
    match = resolve_isbn(book)
    if match is None:
        return None, {"source": "not-found"}
    return cover_for_isbn(match["isbn"]), {"source": "ndl", "isbn": match["isbn"], "matched": match["title"]}


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
        cover_path = out_dir / f"{book['key']}.jpg"
        if cover_path.exists() and not args.force and book["key"] not in overrides:
            continue
        cover_bytes, info = collect_cover(book, Path(args.epub_dir), overrides.get(book["key"], {}))
        manifest[book["key"]] = info
        print(f"{info['source']:<13} {book['key']}", flush=True)
        if cover_bytes is None:
            continue
        cover_path.parent.mkdir(parents=True, exist_ok=True)
        cover_path.write_bytes(to_jpeg(cover_bytes))

    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    missing = [key for key in manifest if not (out_dir / f"{key}.jpg").exists()]
    print(f"\n{len(manifest) - len(missing)} covers, {len(missing)} missing")
    for key in missing:
        print(f"  missing: {key} ({manifest[key]['source']})")
    if args.sheet:
        draw_review_sheet(sorted(manifest.items()), out_dir, args.sheet)
        print(f"review sheet: {args.sheet}")


if __name__ == "__main__":
    sys.exit(main())
