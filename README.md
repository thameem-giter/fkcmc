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

Paste a gallery link and click **Find originals**.

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

- Thumbnail grid from the gallery's preview URLs
- Individual original downloads
- Copy-original-URL button
- Download all as ZIP, generated entirely in the browser
- No uploads, no account, no captcha, no watermark-removal service

## Notes

- The ZIP uses stored/uncompressed entries, so JPEG bytes are not re-encoded.
- The sample link in `index.html` is prefilled; replace it if you want a different default.
- If FotoOwl ever disables CORS for GitHub Pages, this static version will need a proxy. It currently does not.
- Use only for galleries you own or are authorized to download.
