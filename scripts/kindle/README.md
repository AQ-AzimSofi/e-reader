# Kindle Page Turner

Turns Kindle Cloud Reader pages on a timer and can save a screenshot of every page.

It attaches to a Chrome you have already opened and signed in to (over the Chrome
DevTools Protocol) instead of launching its own, so your Amazon session, cookies and
open book stay yours. It never logs in or navigates; it only presses arrow keys.

## Quick Start (Windows)

1. Start Chrome with remote debugging. This opens a separate Chrome window with its
   own profile, alongside your normal Chrome. The syntax depends on your terminal;
   all three use the same profile folder, so the sign-in carries over.

   Command Prompt (prompt looks like `C:\...>`):

   ```cmd
   start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\.kindle-chrome"
   ```

   PowerShell (prompt starts with `PS`):

   ```powershell
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:USERPROFILE\.kindle-chrome"
   ```

   Git Bash (prompt shows `MINGW64`):

   ```bash
   "/c/Program Files/Google/Chrome/Application/chrome.exe" --remote-debugging-port=9222 --user-data-dir="$USERPROFILE/.kindle-chrome" > /dev/null 2>&1 &
   ```

2. In that window, sign in to Amazon (first time only, the profile remembers it),
   open the book at https://read.amazon.co.jp and go to the page to start from.

3. From the project root, run:

   ```powershell
   npx tsx scripts/kindle/page-turner.ts --interval 30
   ```

   From inside `scripts/kindle`, use `npx tsx page-turner.ts --interval 30` instead.

4. Ctrl+C stops it. It also stops on its own at the end of the book.

## Saving Screenshots

Pick the line for your terminal; each saves to `Pictures\kindle\my-book` in your
Windows user folder:

```bash
# Git Bash
npx tsx scripts/kindle/page-turner.ts --interval 3 --screenshot-dir "$USERPROFILE/Pictures/kindle/my-book"

# Command Prompt
npx tsx scripts/kindle/page-turner.ts --interval 3 --screenshot-dir "%USERPROFILE%\Pictures\kindle\my-book"

# PowerShell
npx tsx scripts/kindle/page-turner.ts --interval 3 --screenshot-dir "$env:USERPROFILE\Pictures\kindle\my-book"
```

- Saves the starting page, then one PNG after every turn: `0001.png`, `0002.png`, ...
- Waits for the page images to finish loading before capturing, so shots are not blank
- Captures the visible browser area, so the reader's header and footer appear
  whenever they are on screen
- Numbering continues from the files already in the folder, so running again into
  the same folder appends. It never overwrites; a name collision stops the run
- Use one folder per book, outside the repo. A relative path is resolved from the
  directory you run the command in
- Keep the Chrome window visible: not minimized, with the book tab in front. Chrome
  can stall screenshots of a hidden tab, and the run then stops with a timeout

## Options

| Flag | Default | Meaning |
|------|---------|---------|
| `--interval <secs>` | `30` | Seconds between page turns |
| `--screenshot-dir <dir>` | off | Save a PNG of each page to this folder (created if missing) |
| `--direction rtl\|ltr` | probed | `rtl` for vertical Japanese (next page = ArrowLeft), `ltr` for horizontal (next page = ArrowRight) |
| `--cdp <url>` | `http://127.0.0.1:9222` | DevTools endpoint of the Chrome to attach to |

## Chrome on Another Machine

The script and the browser can run on different machines. Start the browser on one,
then tunnel the debugging port to the machine running the script:

```bash
# On the browser machine (Linux example)
chromium --remote-debugging-port=9222 --user-data-dir="$HOME/.kindle-chromium"

# On the script machine: forward the port over SSH instead of exposing it
ssh -N -L 9222:127.0.0.1:9222 user@linux-host

# Then run as usual; --cdp already defaults to the forwarded port
npx tsx scripts/kindle/page-turner.ts --interval 30
```

## How It Works

- Vertical Japanese books advance with ArrowLeft, horizontal ones with ArrowRight.
  Unless `--direction` is given, the script presses ArrowLeft once at startup,
  checks whether the location went up, and steps back, so you see one quick flicker
- Page turns are detected from the footer location (`位置12/2218`) and the
  `#kr-renderer` page images. If Amazon changes the reader, update
  `READER_SELECTORS` in `page-turner.ts`
- It stops when a key press no longer changes the page within 10 seconds: the end of
  the book, or the reader stopped responding

## Security

- Never bind the debugging port to a public interface. Anyone who reaches it
  controls the signed-in browser, Amazon account included
- Chrome 136+ ignores `--remote-debugging-port` on the default profile, which is why
  the commands above use a separate `--user-data-dir`

## Troubleshooting

### `connect ECONNREFUSED 127.0.0.1:9222`

Chrome is not listening on the debugging port. Open http://127.0.0.1:9222/json/version
in any browser; it should return JSON. If it does not, close every window of the
debugging Chrome (a profile already open without the flag ignores it) and run the
start command again.

### `No Kindle book tab found`

The book must be open in the debugging Chrome window, not your normal Chrome. The tab
URL has to be on `read.amazon.*` and contain `asin=`.

### `Reader not detected on ...`

The book page has not finished loading, or Amazon changed the reader layout. Wait
for the page to render and retry; if it persists, update `READER_SELECTORS`.

### Screenshot timeouts

The book tab was hidden or the window minimized. Bring it to the front and rerun with
the same `--screenshot-dir`; numbering picks up where it stopped.
