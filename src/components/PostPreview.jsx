import React from 'react';
import './PostPreview.css';
import { User } from 'lucide-react';
import SecureMedia from './SecureMedia';

export default function PostPreview({ content, platform, attachments = [] }) {
  const getPlatformClass = () => {
    return `preview-${platform}`;
  };

  const formattedContent = content.split('\n').map((line, i) => (
    <React.Fragment key={i}>
      {line}
      <br />
    </React.Fragment>
  ));

  const coverImage = attachments?.find(att => att.isCover);

  const renderMedia = (media) => {
    if (!media) return null;
    const isVideo = media.type?.startsWith('video/');
    
    if (isVideo && !media.driveId) {
      return (
        <video 
          src={media.data} 
          controls 
          className="preview-video" 
          style={{ width: '100%', borderRadius: '8px', maxHeight: '240px', objectFit: 'contain' }} 
        />
      );
    }
    
    return (
      <SecureMedia 
        src={media.data} 
        driveId={media.driveId} 
        type={media.type} 
        alt="Couverture" 
        className="preview-cover-image"
        isVideoPlayer={true}
      />
    );
  };

  return (
    <div className={`post-preview glass-panel animate-fade-in ${getPlatformClass()}`} style={{ animationDelay: '0.3s' }}>
      <div className="preview-header">
        <h2>Prévisualisation</h2>
        <span className="platform-badge">{platform}</span>
      </div>
      
      <div className="preview-card">
        <div className="preview-user">
          <div className="preview-avatar">
            <User size={24} />
          </div>
          <div className="preview-user-info">
            <span className="preview-name">Step Up</span>
            <span className="preview-time">À l'instant</span>
          </div>
        </div>
        
        {/* Pour Instagram : Image/Vidéo en premier (image-first platform) */}
        {platform === 'instagram' && coverImage && (
          <div className="preview-cover-image-container instagram-hero">
            {renderMedia(coverImage)}
          </div>
        )}
        
        <div className="preview-content">
          {content ? formattedContent : <span className="preview-placeholder">Votre post apparaîtra ici...</span>}
        </div>
        
        {/* Pour LinkedIn, Facebook et Google My Business : Image/Vidéo en dessous du texte */}
        {platform !== 'instagram' && coverImage && (
          <div className="preview-cover-image-container">
            {renderMedia(coverImage)}
          </div>
        )}
        
        <div className="preview-actions">
          {/* Mocked actions depending on platform */}
          <div className="mock-action">J'aime</div>
          <div className="mock-action">Commenter</div>
          <div className="mock-action">Partager</div>
        </div>
      </div>
    </div>
  );
}
