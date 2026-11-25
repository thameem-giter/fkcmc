'use strict';

document.documentElement.classList.add('js');

const API_BASE = 'https://api2.fotoowl.ai/open';
const PAGE_SIZE = 100;

const form = document.getElementById('scan-form');
const input = document.getElementById('gallery-url');
const scanButton = document.getElementById('scan-button');
const statusEl = document.getElementById('status');
const intro = document.getElementById('intro');
const results = document.getElementById('results');
const galleryName = document.getElementById('gallery-name');
const galleryMeta = document.getElementById('gallery-meta');
const heroImage = document.getElementById('hero-image');
const heroTitle = document.getElementById('hero-title');
const heroDimensions = document.getElementById('hero-dimensions');
const heroUrl = document.getElementById('hero-url');
const grid = document.getElementById('grid');
const countBadge = document.getElementById('count-badge');
const zipButton = document.getElementById('zip-button');
const detailDownload = document.getElementById('detail-download');
const detailCopy = document.getElementById('detail-copy');
const heroDownload = document.getElementById('hero-download');
const heroView = document.getElementById('hero-view');
const backButton = document.getElementById('back-button');
const shareButton = document.getElementById('share-button');
const moreButton = document.getElementById('more-button');
const loader = document.getElementById('loader');

let currentScan = null;
let selectedImage = null;
let statusTimer = null;

function setStatus(message, isError = false) {
  clearTimeout(statusTimer);
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
  statusEl.classList.add('show');
  statusTimer = setTimeout(() => statusEl.classList.remove('show'), isError ? 6000 : 3500);
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const revealObserver =
  'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries, observer) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('in-view');
              observer.unobserve(entry.target);
            }
          }
        },
        { rootMargin: '0px 0px 40px 0px' },
      )
    : null;

function attachRipples() {
  document.addEventListener('pointerdown', (event) => {
    if (prefersReducedMotion() || !(event.target instanceof Element)) return;
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const rect = button.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    button.append(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  });
}

attachRipples();

async function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseGalleryUrl(inputText) {
  if (typeof inputText !== 'string' || !inputText.trim()) {
    throw new Error('Paste a gallery link');
  }

  const url = new URL(inputText.trim());
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Link must be an HTTP(S) URL');
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const galleryIndex = segments.indexOf('gallery');
  if (galleryIndex === -1 || !segments[galleryIndex + 1]) {
    throw new Error('Link does not contain /gallery/{event_id}');
  }

  const eventId = segments[galleryIndex + 1];
  if (!/^\d+$/.test(eventId)) {
    throw new Error('Gallery event ID must be numeric');
  }

  const shareKey =
    url.searchParams.get('share_key') ||
    url.searchParams.get('key') ||
    url.searchParams.get('access_key');
  if (!shareKey) {
    throw new Error('Link is missing share_key/key');
  }

  return {
    eventId,
    shareKey,
    requestId: url.searchParams.get('request_id') || '',
    requestKey: url.searchParams.get('request_key') || '',
  };
}

function imageListUrl({ eventId, shareKey, requestId, requestKey, collectionId, page }) {
  const params = new URLSearchParams({
    event_id: eventId,
    key: shareKey,
    page: String(page),
    page_size: String(PAGE_SIZE),
    order_by: '2',
    order_asc: 'true',
  });
  if (requestId) params.set('request_id', requestId);
  if (requestKey) params.set('request_key', requestKey);

  if (collectionId === 'direct') {
    params.set('direct', 'true');
    params.set('team_view', 'false');
  } else {
    params.set('collection_id', String(collectionId));
    params.set('get_video', 'true');
  }

  return `${API_BASE}/event/image-list?${params.toString()}`;
}

async function getJson(url) {
  const response = await fetchWithTimeout(url, {
    mode: 'cors',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`FotoOwl API returned ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error('FotoOwl API returned non-JSON data');
  }
}

function normalizeImage(row, source) {
  if (!row || !row.original_url) return null;
  return {
    id: row.id,
    name: row.name || `image-${row.id}`,
    width: row.width ?? null,
    height: row.height ?? null,
    previewUrl: row.img_url || row.high_url || row.low_path || '',
    originalUrl: row.original_url,
    source: source === 'direct' ? 'direct' : `collection:${source}`,
  };
}

async function scanGallery(params) {
  const { eventId, shareKey, requestId, requestKey } = params;
  const keyParam = `event_id=${encodeURIComponent(eventId)}&key=${encodeURIComponent(shareKey)}`;

  setStatus('Checking share key…');
  const validation = await getJson(`${API_BASE}/event/validate-key?${keyParam}`);
  if (validation.ok === false || validation.data?.is_valid === false) {
    throw new Error('Share key is invalid or expired');
  }

  setStatus('Loading gallery details…');
  const gallery = await getJson(`${API_BASE}/gallery?${keyParam}`);
  const collectionsResponse = await getJson(`${API_BASE}/event/collection-list?${keyParam}&team_view=false`);

  const collections = Array.isArray(collectionsResponse.data)
    ? collectionsResponse.data
    : collectionsResponse.data?.collection_list || [];

  const targets = ['direct', ...collections.map((c) => c.id).filter((id) => id !== undefined && id !== null)];
  const byId = new Map();

  setStatus('Reading image lists…');
  for (const collectionId of targets) {
    for (let page = 0; page < 100; page++) {
      const payload = await getJson(
        imageListUrl({ eventId, shareKey, requestId, requestKey, collectionId, page }),
      );
      const rows = payload.data?.image_list || [];
      for (const row of rows) {
        const image = normalizeImage(row, collectionId);
        if (image) byId.set(image.id, image);
      }
      if (rows.length < PAGE_SIZE) break;
    }
    await nextFrame();
  }

  return {
    params,
    gallery: {
      name: gallery.data?.name || 'Untitled gallery',
      date: gallery.data?.date || null,
      imageCount: gallery.data?.image_count ?? null,
    },
    collections: collections.map((c) => ({ id: c.id, name: c.name, type: c.type })),
    images: [...byId.values()],
  };
}

function extensionFromUrl(rawUrl) {
  try {
    const pathname = new URL(rawUrl).pathname;
    const match = pathname.match(/\.[a-z0-9]+$/i);
    return match ? match[0] : '.jpg';
  } catch {
    return '.jpg';
  }
}

function safeFileName(name, id, rawUrl) {
  let base = String(name || `image-${id}`)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  if (!base) base = `image-${id}`;
  if (!/\.[a-z0-9]+$/i.test(base)) base += extensionFromUrl(rawUrl);
  return `${id || 'image'}-${base}`;
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function fetchOriginal(image) {
  const response = await fetchWithTimeout(image.originalUrl, { mode: 'cors' }, 180000);
  if (!response.ok) {
    throw new Error(`Download failed for ${image.name}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function downloadOne(image) {
  if (!image) return;
  try {
    setStatus(`Downloading ${image.name}…`);
    const bytes = await fetchOriginal(image);
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    triggerBlobDownload(blob, safeFileName(image.name, image.id, image.originalUrl));
    setStatus(`Saved ${image.name}.`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

async function copyOriginalUrl(image) {
  if (!image) return;
  try {
    await navigator.clipboard.writeText(image.originalUrl);
    setStatus('Original URL copied to clipboard.');
  } catch {
    setStatus('Could not copy. Use the Download button instead.', true);
  }
}

function selectImage(image) {
  if (!image) return;
  selectedImage = image;

  heroImage.dataset.fallback = '';
  heroImage.onerror = () => {
    if (image.previewUrl && heroImage.dataset.fallback !== '1') {
      heroImage.dataset.fallback = '1';
      heroImage.src = image.previewUrl;
    }
  };
  heroImage.src = image.originalUrl;
  heroImage.alt = image.name;
  heroImage.classList.remove('image-in');
  void heroImage.offsetWidth;
  heroImage.classList.add('image-in');

  heroTitle.textContent = image.name;
  const dimensions = image.width && image.height ? `${image.width}×${image.height} · ` : '';
  heroDimensions.textContent = `${dimensions}source: ${image.source}`;
  heroUrl.textContent = image.originalUrl;

  for (const card of grid.querySelectorAll('.pin-card')) {
    card.classList.toggle('selected', Number(card.dataset.id) === Number(image.id));
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function createZip(entries) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const { time, date } = dosDateTime(new Date());

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    locals.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length + data.length;
  }

  const centralSize = centrals.reduce((total, entry) => total + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...locals, ...centrals, end], { type: 'application/zip' });
}

function render(scan) {
  currentScan = scan;
  intro.hidden = true;
  results.hidden = false;

  galleryName.textContent = scan.gallery?.name || 'Gallery';
  const datePart = scan.gallery?.date ? `${scan.gallery.date} · ` : '';
  galleryMeta.textContent = `${datePart}${scan.images.length} original images found`;
  countBadge.textContent = `${scan.images.length} image${scan.images.length === 1 ? '' : 's'}`;

  loader.hidden = true;
  grid.replaceChildren();
  scan.images.forEach((image, index) => {
    const card = document.createElement('article');
    card.className = 'pin-card';
    card.dataset.id = String(image.id);

    const media = document.createElement('div');
    media.className = 'card-media';
    const thumb = document.createElement('img');
    thumb.src = image.previewUrl || image.originalUrl;
    thumb.alt = image.name;
    thumb.loading = 'lazy';
    thumb.addEventListener('error', () => {
      thumb.style.opacity = '0';
    });

    const overlay = document.createElement('div');
    overlay.className = 'card-overlay';
    const cardDownload = document.createElement('button');
    cardDownload.type = 'button';
    cardDownload.className = 'card-download';
    cardDownload.textContent = '↓ Download';
    cardDownload.addEventListener('click', (event) => {
      event.stopPropagation();
      downloadOne(image);
    });
    overlay.append(cardDownload);
    media.append(thumb, overlay);

    const body = document.createElement('div');
    body.className = 'pin-body';
    const title = document.createElement('h3');
    title.textContent = image.name;
    const meta = document.createElement('p');
    const dimensions = image.width && image.height ? `${image.width}×${image.height} · ` : '';
    meta.textContent = `${dimensions}${image.source}`;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'card-copy';
    copy.textContent = 'Copy URL';
    copy.addEventListener('click', (event) => {
      event.stopPropagation();
      copyOriginalUrl(image);
    });

    body.append(title, meta, copy);
    card.append(media, body);
    card.addEventListener('click', () => selectImage(image));
    grid.append(card);

    card.style.setProperty('--i', String(index));
    if (revealObserver && !prefersReducedMotion()) revealObserver.observe(card);
    else card.classList.add('in-view');
  });

  selectImage(scan.images[0]);

  if (window.matchMedia('(max-width: 760px)').matches && !prefersReducedMotion()) {
    setTimeout(() => results.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  results.hidden = true;
  intro.hidden = true;
  loader.hidden = false;
  document.body.classList.add('is-scanning');
  scanButton.classList.add('is-loading');
  currentScan = null;
  selectedImage = null;
  scanButton.disabled = true;

  try {
    const params = parseGalleryUrl(input.value);
    const scan = await scanGallery(params);
    render(scan);
    setStatus(`Done. Found ${scan.images.length} original image${scan.images.length === 1 ? '' : 's'}.`);
  } catch (error) {
    intro.hidden = false;
    setStatus(error.message || String(error), true);
  } finally {
    loader.hidden = true;
    document.body.classList.remove('is-scanning');
    scanButton.classList.remove('is-loading');
    scanButton.disabled = false;
  }
});

backButton.addEventListener('click', () => {
  results.hidden = true;
  intro.hidden = false;
  currentScan = null;
  selectedImage = null;
});

shareButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(input.value);
    setStatus('Gallery link copied.');
  } catch {
    setStatus('Could not copy the gallery link.', true);
  }
});

moreButton.addEventListener('click', () => {
  const card = document.querySelector('.info-card');
  if (card) card.hidden = !card.hidden;
});

heroView.addEventListener('click', () => {
  if (!selectedImage) return;
  window.open(selectedImage.originalUrl, '_blank', 'noopener');
});

heroDownload.addEventListener('click', () => downloadOne(selectedImage));
detailDownload.addEventListener('click', () => downloadOne(selectedImage));
detailCopy.addEventListener('click', () => copyOriginalUrl(selectedImage));

zipButton.addEventListener('click', async () => {
  if (!currentScan?.images?.length) return;

  zipButton.disabled = true;
  const images = currentScan.images;
  const entries = [];

  try {
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      setStatus(`Downloading ${i + 1}/${images.length}: ${image.name}…`);
      await nextFrame();
      const data = await fetchOriginal(image);
      entries.push({
        name: safeFileName(image.name, image.id, image.originalUrl),
        data,
      });
    }

    setStatus('Building ZIP…');
    await nextFrame();
    const blob = createZip(entries);
    triggerBlobDownload(blob, 'fotoowl-originals.zip');
    setStatus(`ZIP ready with ${entries.length} original${entries.length === 1 ? '' : 's'}.`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    zipButton.disabled = false;
  }
});
