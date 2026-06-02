import { useState, useEffect } from 'react';

/**
 * Component to securely render images and videos from Google Drive
 * or fallback URLs. It uses the access token if present to retrieve
 * the file's temporary public thumbnail from Google Drive API.
 */
export default function SecureMedia({ src, driveId, type, className, alt, style, isVideoPlayer = false }) {
  const [mimeType, setMimeType] = useState(type || '');
  const [mediaUrl, setMediaUrl] = useState(() => {
    if (!driveId) return src || '';
    const token = localStorage.getItem('gdrive_access_token');
    if (!token) {
      if (isVideoPlayer && mimeType?.startsWith('video/')) {
        return `https://drive.google.com/file/d/${driveId}/preview`;
      }
      return src || `https://lh3.googleusercontent.com/d/${driveId}`;
    }
    return '';
  });

  useEffect(() => {
    if (!driveId) {
      const t = setTimeout(() => setMediaUrl(src || ''), 0);
      return () => clearTimeout(t);
    }

    const token = localStorage.getItem('gdrive_access_token');
    
    // Fallback if no token is available
    if (!token) {
      const t = setTimeout(() => {
        if (isVideoPlayer && mimeType?.startsWith('video/')) {
          setMediaUrl(`https://drive.google.com/file/d/${driveId}/preview`);
        } else {
          setMediaUrl(src || `https://lh3.googleusercontent.com/d/${driveId}`);
        }
      }, 0);
      return () => clearTimeout(t);
    }

    let isMounted = true;

    const fetchMetadata = async () => {
      try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${driveId}?fields=thumbnailLink,mimeType`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch Drive metadata');
        }

        const data = await response.json();
        
        if (isMounted) {
          if (data.mimeType) {
            setMimeType(data.mimeType);
          }

          if (isVideoPlayer && data.mimeType?.startsWith('video/')) {
            setMediaUrl(`https://drive.google.com/file/d/${driveId}/preview`);
          } else if (data.thumbnailLink) {
            // Replace the size parameter in the thumbnail link to get a high-quality preview (s1000)
            const highRes = data.thumbnailLink.replace(/=s\d+/, '=s1000');
            setMediaUrl(highRes);
          } else {
            setMediaUrl(`https://lh3.googleusercontent.com/d/${driveId}`);
          }
        }
      } catch (e) {
        console.error("Error loading secure media:", e);
        if (isMounted) {
          // Fallback to standard Google Photos CDN / Direct URL
          setMediaUrl(src || `https://lh3.googleusercontent.com/d/${driveId}`);
        }
      }
    };

    fetchMetadata();

    return () => {
      isMounted = false;
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
      onError={(e) => {
        // Fallbacks if Google rejects the thumbnail link
        if (src && e.target.src !== src) {
          e.target.src = src;
        } else if (driveId && e.target.src !== `https://drive.google.com/thumbnail?sz=w800&id=${driveId}`) {
          e.target.src = `https://drive.google.com/thumbnail?sz=w800&id=${driveId}`;
        }
      }}
    />
  );
}
