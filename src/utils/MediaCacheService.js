/**
 * MediaCacheService.js
 * Centralized service to manage loading and caching of Google Drive media files.
 * 
 * Features:
 * - Environment detection (Browser/PWA Cache Storage API vs Capacitor Filesystem).
 * - Expiration validation (default 7 days).
 * - Secure data loading (fetches content as blobs using auth token, never stores tokens).
 * - Bandwidth optimization (configurable full media vs high-res thumbnail fetch).
 * - Memory leak prevention (helper to track and revoke local Object URLs).
 */

const CACHE_NAME = 'gdrive-media-cache';
const DEFAULT_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Keep track of active object URLs to revoke them when no longer needed
const activeObjectUrls = new Map();

/**
 * Detects if the app is running in a native mobile environment (Capacitor/Cordova)
 */
function isNativeEnvironment() {
  return typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNative;
}

/**
 * Gets the Capacitor Filesystem plugin dynamically to avoid compilation import errors in web builds
 */
function getCapacitorFilesystem() {
  if (typeof window !== 'undefined' && window.Capacitor?.Plugins?.Filesystem) {
    return window.Capacitor.Plugins.Filesystem;
  }
  return null;
}

/**
 * Converts a Blob to a Base64 string (needed for Capacitor filesystem writes)
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Converts a Base64 string to a Blob
 */
function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Generates the cache key URL
 */
function getCacheKey(driveId) {
  return `https://gdrive-cache.local/file/${driveId}`;
}

/**
 * Resolves a media file from Google Drive: checks cache, validates freshness,
 * fetches if missing or expired, caches the blob, and returns a local URI.
 * 
 * @param {string} driveId - Google Drive File ID
 * @param {string} token - Google Drive Access Token
 * @param {object} options - Options
 * @param {boolean} options.useThumbnail - If true, retrieves a high-res thumbnail instead of the full file (default: true for images)
 * @param {number} options.expirationMs - Expiration duration in milliseconds (default: 7 days)
 * @param {string} options.mimeType - Fallback MIME type if known
 * @returns {Promise<string>} Local media URL (blob: URL or Capacitor native file URL)
 */
export async function getMediaUrl(driveId, token, options = {}) {
  if (!driveId) return '';

  const useThumbnail = options.useThumbnail !== false;
  const expirationMs = options.expirationMs || DEFAULT_EXPIRATION_MS;
  const mimeType = options.mimeType || '';

  // 1. If it's a video, do not cache as a blob (could be too large). Return Google Drive iframe preview link.
  if (mimeType.startsWith('video/') || options.isVideo) {
    return `https://drive.google.com/file/d/${driveId}/preview`;
  }

  // 2. Check local cache first
  try {
    const cachedItem = await getFromCache(driveId);
    if (cachedItem) {
      const { blob, expires, isFallback } = cachedItem;
      const isExpired = Date.now() > expires;

      if (!isExpired) {
        if (isFallback) {
          return `https://lh3.googleusercontent.com/d/${driveId}`;
        }
        // Return valid cached content
        const objectUrl = URL.createObjectURL(blob);
        trackObjectUrl(driveId, objectUrl);
        return objectUrl;
      } else {
        console.log(`Cache entry for drive file ${driveId} has expired. Re-fetching...`);
        // Remove expired entry
        await removeFromCache(driveId);
      }
    }
  } catch (err) {
    console.warn("Failed to check media cache, falling back to direct network fetch:", err);
  }

  // 3. Fallback or missing cache: Fetch from network and save to cache
  if (!token) {
    // No authorization token, return public link fallback (un-cached)
    return `https://lh3.googleusercontent.com/d/${driveId}`;
  }

  try {
    const { blob, fetchedMime } = await fetchFromGoogleDrive(driveId, token, useThumbnail);
    
    // Save to cache asynchronously
    saveToCache(driveId, blob, expirationMs, fetchedMime).catch(err => 
      console.info("[MediaCache] Failed to write to media cache:", err.message)
    );

    const objectUrl = URL.createObjectURL(blob);
    trackObjectUrl(driveId, objectUrl);
    return objectUrl;
  } catch (err) {
    // Save a fallback marker in the cache so we don't try to fetch again for 7 days
    saveFallbackMarkerToCache(driveId, expirationMs).catch(() => {});

    // Silently catch and return public URL fallback
    console.info(`[MediaCache] Using public thumbnail fallback for ${driveId} (${err.message})`);
    return `https://lh3.googleusercontent.com/d/${driveId}`;
  }
}

/**
 * Fetches the media blob from Google Drive API
 */
async function fetchFromGoogleDrive(driveId, token, useThumbnail) {
  let targetUrl = `https://www.googleapis.com/drive/v3/files/${driveId}?alt=media`;
  let fetchedMime = 'image/jpeg';

  if (useThumbnail) {
    // 1. Fetch metadata first to get high-resolution thumbnail URL
    const metaResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${driveId}?fields=thumbnailLink,mimeType`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (metaResponse.ok) {
      const metadata = await metaResponse.json();
      fetchedMime = metadata.mimeType || fetchedMime;

      if (metadata.thumbnailLink) {
        // Modify thumbnail size parameter (default =s220) to get high-resolution (=s1000)
        targetUrl = metadata.thumbnailLink.replace(/=s\d+/, '=s1000');
      }
    } else {
      throw new Error(`Drive API metadata fetch failed with status ${metaResponse.status}`);
    }
  }

  // 2. Fetch the actual content (either the thumbnail link or the alt=media stream)
  const fetchHeaders = {};
  // Only add Auth token for the direct Google API endpoint (not the lh3 public thumbnail links)
  if (targetUrl.includes('googleapis.com')) {
    fetchHeaders['Authorization'] = `Bearer ${token}`;
  }

  const mediaResponse = await fetch(targetUrl, { headers: fetchHeaders });
  if (!mediaResponse.ok) {
    throw new Error(`Drive API media fetch failed with status ${mediaResponse.status}`);
  }

  const blob = await mediaResponse.blob();
  return { blob, fetchedMime };
}

/**
 * Stores a media blob in the cache (Cache Storage or Capacitor Filesystem)
 */
async function saveToCache(driveId, blob, expirationMs, mimeType) {
  const expires = Date.now() + expirationMs;
  const fs = getCapacitorFilesystem();

  if (isNativeEnvironment() && fs) {
    // --- Capacitor Mobile caching ---
    try {
      const base64Data = await blobToBase64(blob);
      await fs.writeFile({
        path: `gdrive_cache/${driveId}`,
        data: base64Data,
        directory: 'DATA',
        recursive: true
      });
      // Store metadata (expiration & mimeType) in localStorage
      localStorage.setItem(`gdrive_meta_${driveId}`, JSON.stringify({ expires, mimeType }));
      return;
    } catch (e) {
      console.warn("Capacitor Filesystem write failed, falling back to Web Cache Storage:", e);
    }
  }

  // --- Browser/PWA Cache Storage caching ---
  if (typeof caches !== 'undefined') {
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = getCacheKey(driveId);
    
    // Create custom Response object containing the blob and metadata headers
    const customResponse = new Response(blob, {
      headers: {
        'Content-Type': mimeType || blob.type || 'image/jpeg',
        'X-Cache-Expiration': String(expires)
      }
    });

    await cache.put(cacheKey, customResponse);
  }
}

/**
 * Saves a fallback marker in the cache to avoid repeated API requests for inaccessible files
 */
async function saveFallbackMarkerToCache(driveId, expirationMs) {
  const expires = Date.now() + expirationMs;
  const fs = getCapacitorFilesystem();

  if (isNativeEnvironment() && fs) {
    localStorage.setItem(`gdrive_meta_${driveId}`, JSON.stringify({ expires, fallback: true }));
    return;
  }

  if (typeof caches !== 'undefined') {
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = getCacheKey(driveId);
    
    const fallbackResponse = new Response(new Blob(['fallback'], { type: 'text/plain' }), {
      headers: {
        'X-Cache-Fallback': 'true',
        'X-Cache-Expiration': String(expires)
      }
    });

    await cache.put(cacheKey, fallbackResponse);
  }
}

/**
 * Retrieves a media blob and its expiration metadata from cache
 */
async function getFromCache(driveId) {
  const fs = getCapacitorFilesystem();

  if (isNativeEnvironment() && fs) {
    // --- Capacitor Mobile cache read ---
    try {
      const metaStr = localStorage.getItem(`gdrive_meta_${driveId}`);
      if (metaStr) {
        const { expires, mimeType, fallback } = JSON.parse(metaStr);
        if (fallback) {
          return { isFallback: true, expires };
        }
        const file = await fs.readFile({
          path: `gdrive_cache/${driveId}`,
          directory: 'DATA'
        });
        const blob = base64ToBlob(file.data, mimeType);
        return { blob, expires };
      }
    } catch (e) {
      // File not found or read error, fallback to Cache Storage check
    }
  }

  // --- Browser/PWA Cache Storage read ---
  if (typeof caches !== 'undefined') {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(getCacheKey(driveId));

    if (cachedResponse) {
      const isFallback = cachedResponse.headers.get('X-Cache-Fallback') === 'true';
      const expiresHeader = cachedResponse.headers.get('X-Cache-Expiration');
      const expires = expiresHeader ? parseInt(expiresHeader) : 0;
      
      if (isFallback) {
        return { isFallback: true, expires };
      }
      
      const blob = await cachedResponse.blob();
      return { blob, expires };
    }
  }

  return null;
}

/**
 * Removes an item from the cache
 */
async function removeFromCache(driveId) {
  const fs = getCapacitorFilesystem();

  if (isNativeEnvironment() && fs) {
    try {
      await fs.deleteFile({
        path: `gdrive_cache/${driveId}`,
        directory: 'DATA'
      });
      localStorage.removeItem(`gdrive_meta_${driveId}`);
    } catch (e) {}
  }

  if (typeof caches !== 'undefined') {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(getCacheKey(driveId));
  }
}

/**
 * Tracks generated Object URLs to avoid memory leaks
 */
function trackObjectUrl(driveId, objectUrl) {
  // If there's an existing object URL for this drive ID, revoke it first
  if (activeObjectUrls.has(driveId)) {
    try {
      URL.revokeObjectURL(activeObjectUrls.get(driveId));
    } catch (e) {}
  }
  activeObjectUrls.set(driveId, objectUrl);
}

/**
 * Revokes a specific Object URL to free browser memory
 * Should be called when a component displaying the image unmounts.
 */
export function revokeMediaUrl(driveId) {
  if (driveId && activeObjectUrls.has(driveId)) {
    const url = activeObjectUrls.get(driveId);
    try {
      URL.revokeObjectURL(url);
    } catch (e) {}
    activeObjectUrls.delete(driveId);
  }
}

/**
 * Clears all cached items
 */
export async function clearAllMediaCache() {
  // Revoke all active Object URLs
  for (const url of activeObjectUrls.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {}
  }
  activeObjectUrls.clear();

  // Clear Capacitor Filesystem Cache
  const fs = getCapacitorFilesystem();
  if (isNativeEnvironment() && fs) {
    try {
      // Find all metadata keys and delete them
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key.startsWith('gdrive_meta_')) {
          const driveId = key.replace('gdrive_meta_', '');
          await fs.deleteFile({
            path: `gdrive_cache/${driveId}`,
            directory: 'DATA'
          }).catch(() => {});
          localStorage.removeItem(key);
        }
      }
    } catch (e) {}
  }

  // Clear Browser Cache Storage
  if (typeof caches !== 'undefined') {
    await caches.delete(CACHE_NAME);
  }
}

/**
 * Scans cache and removes all expired items
 */
export async function clearExpiredMediaCache() {
  const now = Date.now();

  // 1. Clean Capacitor Filesystem Expired entries
  const fs = getCapacitorFilesystem();
  if (isNativeEnvironment() && fs) {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key.startsWith('gdrive_meta_')) {
          const { expires } = JSON.parse(localStorage.getItem(key));
          if (now > expires) {
            const driveId = key.replace('gdrive_meta_', '');
            await fs.deleteFile({
              path: `gdrive_cache/${driveId}`,
              directory: 'DATA'
            }).catch(() => {});
            localStorage.removeItem(key);
          }
        }
      }
    } catch (e) {}
  }

  // 2. Clean Cache Storage Expired entries
  if (typeof caches !== 'undefined') {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const expiresHeader = response.headers.get('X-Cache-Expiration');
        if (expiresHeader && now > parseInt(expiresHeader)) {
          await cache.delete(request);
        }
      }
    }
  }
}
