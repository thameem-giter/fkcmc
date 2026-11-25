# Original Image Finder — static edition

A static, GitHub Pages–ready website that takes a FotoOwl gallery link and produces the unwatermarked original images. Everything runs in the browser: no backend, no build step, no dependencies.

## Files

```text
index.html   Page markup
styles.css   Styling
app.js       Gallery parsing, API calls, downloads, and in-browser ZIP builder
.nojekyll    Tells GitHub Pages not to run Jekyll
```

## Host on GitHub Pages

1. Create a new public GitHub repository.
2. Upload these four files to the repository root:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `.nojekyll`
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, set:
   - Source: **Deploy from a branch**
   - Branch: `main` / `root`
5. Save.
6. Open:

```text
https://<your-username>.github.io/<your-repository>/
```

Paste a gallery link and click **Find**.

## Interface

The layout follows a Pinterest pin page:

- Sticky top bar with the gallery-link search field and **Find** button
- Large rounded hero card showing the selected original with **Open original** / **Download** actions
- Side detail panel with gallery info, filename, dimensions, **Download original**, **Copy original URL**, and **Download all as ZIP**
- Masonry grid of gallery cards; click any card to change the hero selection, hover for a quick download, or copy its URL
- Gallery back arrow, share (copy gallery link), and more-info toggle

## Mobile + motion

- Fluid desktop sizing: 4-column grid on standard PCs, 5 columns on large monitors, capped hero height on short screens
- Top bar collapses to two rows on phones, with a full-width search field and 44px+ touch targets
- Detail panel stacks under the hero image; cards go 3 → 2 → 1 columns as the screen narrows
- Safe-area padding for notched phones, 16px input font to prevent iOS zoom, always-visible card actions on touch screens
- Staggered entrance animations, floating intro cards, shimmer loading skeleton, indeterminate progress bar, spinner button
- Cards reveal as they scroll into view, the selected card has a pulsing ring, and the hero image crossfades on selection
- Button press ripples, hover lifts, image zoom, and animated toast messages
- Full support for `prefers-reduced-motion` and visible keyboard focus states

## How it works

- Parses `event_id`, `share_key`, `request_id`, and `request_key` from the link.
- Calls FotoOwl's public endpoints directly from your browser:
  - `/open/event/validate-key`
  - `/open/gallery`
  - `/open/event/collection-list`
  - `/open/event/image-list`
- Reads each record's `original_url`, which points to the `/raw/v2/...` original JPEG.
- Downloads originals via `fetch` and builds the ZIP in JavaScript, so the original bytes are unchanged.

FotoOwl's API and storage both return CORS headers that reflect the requesting origin, so this works from a `*.github.io` origin.

## Features

- Pinterest-style detail view and responsive masonry card grid
- Click-to-select hero preview with original/preview fallback
- Individual original downloads from each card and the detail panel
- Copy-original-URL buttons on cards and in the detail panel
- Copy gallery link via the share button
- Download all as ZIP, generated entirely in the browser
- No uploads, no account, no captcha, no watermark-removal service

## Notes

- The ZIP uses stored/uncompressed entries, so JPEG bytes are not re-encoded.
- The gallery field starts empty. No default or sample link is included; paste your own link to scan.
- If FotoOwl ever disables CORS for GitHub Pages, this static version will need a proxy. It currently does not.
- Use only for galleries you own or are authorized to download.
