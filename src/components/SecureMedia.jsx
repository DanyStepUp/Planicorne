import { useState, useEffect } from 'react';
import { getMediaUrl, revokeMediaUrl } from '../utils/MediaCacheService';

/**
 * Component to securely render images and videos from Google Drive
 * or fallback URLs. It utilizes the MediaCacheService to fetch and cache
 * media locally (Cache Storage in browser or Filesystem on native mobile)
 * and displays them securely using local Object URLs.
 */
export default function SecureMedia({ src, driveId, type, className, alt, style, isVideoPlayer = false, onLoad }) {
  const [mimeType, setMimeType] = useState(type || '');
  const [mediaUrl, setMediaUrl] = useState(() => {
    if (!driveId) return src || '';
    
    // Return a direct public preview URL initially to prevent blank images and empty src warnings
    if (isVideoPlayer && mimeType?.startsWith('video/')) {
      return `https://drive.google.com/file/d/${driveId}/preview`;
    }
    return src || `https://drive.google.com/thumbnail?sz=w1000&id=${driveId}`;
  });

  useEffect(() => {
    if (!driveId) {
      const t = setTimeout(() => setMediaUrl(src || ''), 0);
      return () => clearTimeout(t);
    }

    const token = localStorage.getItem('gdrive_access_token');
    let isMounted = true;

    const loadMedia = async () => {
      try {
        // Resolve cached or fetched local object URL
        const resolvedUrl = await getMediaUrl(driveId, token, {
          mimeType: mimeType,
          isVideo: isVideoPlayer,
          useThumbnail: true // Use high-res thumbnail for faster loading/saving quota
        });

        if (isMounted) {
          setMediaUrl(resolvedUrl);
          
          // Try to guess/extract the mimeType if it was empty, from the blob URL or service
          if (!mimeType) {
            // Check if drive file is video by calling standard preview logic if needed
            if (resolvedUrl.includes('preview')) {
              setMimeType('video/mp4');
            }
          }
        }
      } catch (err) {
        console.debug("Info loading secure cached media fallback:", err.message);
        if (isMounted) {
          // Fallback to direct public CDN link if caching/fetching fails
          setMediaUrl(src || `https://drive.google.com/thumbnail?sz=w1000&id=${driveId}`);
        }
      }
    };

    loadMedia();

    return () => {
      isMounted = false;
      // Revoke the object URL to prevent memory leaks when component unmounts
      revokeMediaUrl(driveId);
    };
  }, [driveId, src, isVideoPlayer, mimeType]);

  if (isVideoPlayer && mimeType?.startsWith('video/')) {
    return (
      <iframe 
        src={mediaUrl} 
        className={className || "preview-video-iframe"} 
        allow="autoplay" 
        frameBorder="0" 
        style={style || { width: '100%', height: '240px', borderRadius: '8px', border: 'none' }}
      ></iframe>
    );
  }

  return (
    <img 
      src={mediaUrl} 
      alt={alt} 
      className={className} 
      style={style} 
      onLoad={(e) => {
        if (onLoad) {
          onLoad({
            width: e.target.naturalWidth,
            height: e.target.naturalHeight
          });
        }
      }}
      onError={(e) => {
        // Fallbacks if Google rejects the thumbnail link or blob fails
        if (src && e.target.src !== src) {
          e.target.src = src;
        } else if (driveId && e.target.src !== `https://drive.google.com/thumbnail?sz=w1000&id=${driveId}`) {
          e.target.src = `https://drive.google.com/thumbnail?sz=w1000&id=${driveId}`;
        }
      }}
    />
  );
}
