import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Trash2, Paperclip } from 'lucide-react';
import SecureMedia from './SecureMedia';
import './PostEditor.css';

const MAX_LENGTHS = {
  facebook: 63206,
  instagram: 2200,
  linkedin: 3000,
  google: 1500
};

export default function PostEditor({ 
  title = '',
  onChangeTitle,
  companyId = '',
  onChangeCompanyId,
  status = 'draft',
  onChangeStatus,
  companies = [],
  content, 
  onChange, 
  platform, 
  attachments = [], 
  onUpdateAttachments,
  readOnly = false,
  scheduledAt,
  onUpdateScheduledAt
}) {
  const maxLength = MAX_LENGTHS[platform] || 2000;
  const currentLength = content.length;
  const percentage = (currentLength / maxLength) * 100;
  
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, attachmentId: null });
  const [linkUrl, setLinkUrl] = useState('');
  const [previewMedia, setPreviewMedia] = useState(null);

  const enrichmentAttempts = useRef(new Set());

  // Enrich attachments that are missing metadata (real name, size, dimensions) on load or update
  useEffect(() => {
    const token = localStorage.getItem('gdrive_access_token');
    if (!token || readOnly) return;

    // Find Drive attachments that need enrichment
    const pendingEnrichment = attachments.filter(att => 
      att.isDrive && 
      att.driveId && 
      !enrichmentAttempts.current.has(att.id) &&
      (att.name?.startsWith('Google Drive (') || att.size === 0 || !att.dimensions)
    );

    if (pendingEnrichment.length === 0) return;

    pendingEnrichment.forEach(async (att) => {
      enrichmentAttempts.current.add(att.id);
      try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${att.driveId}?fields=name,size,imageMediaMetadata,mimeType`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const metadata = await res.json();
        
        onUpdateAttachments(prev => prev.map(item => {
          if (item.id === att.id) {
            let dims = '';
            if (metadata.imageMediaMetadata && metadata.imageMediaMetadata.width && metadata.imageMediaMetadata.height) {
              dims = `${metadata.imageMediaMetadata.width}x${metadata.imageMediaMetadata.height}`;
            }
            return {
              ...item,
              name: metadata.name || item.name,
              size: metadata.size ? parseInt(metadata.size, 10) : item.size,
              dimensions: dims,
              type: metadata.mimeType || item.type
            };
          }
          return item;
        }));
      } catch (err) {
        console.debug("Failed to enrich attachment metadata for " + att.id, err);
      }
    });
  }, [attachments, onUpdateAttachments, readOnly]);

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    if (readOnly) return;
    if (!linkUrl.trim()) return;

    const url = linkUrl.trim();
    let driveId = null;

    // Matching file/d/FILE_ID
    const matchD = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (matchD) driveId = matchD[1];
    else {
      // Matching id=FILE_ID
      const matchId = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (matchId) driveId = matchId[1];
    }

    if (!driveId) {
      // Direct file URLs checking
      const isDirectImage = url.match(/\.(jpeg|jpg|gif|png|webp|svg)/i) || url.startsWith('data:image/');
      const isDirectVideo = url.match(/\.(mp4|webm|mov|ogg)/i) || url.startsWith('data:video/');

      if (isDirectImage) {
        const hasCover = attachments.some(att => att.isCover);
        const shouldBeCover = !hasCover;
        const newAttachment = {
          id: 'att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          name: url.split('/').pop().split('?')[0] || 'Image externe',
          type: 'image/jpeg',
          size: 0,
          data: url,
          isCover: shouldBeCover
        };
        onUpdateAttachments(prev => [...prev, newAttachment]);
        setLinkUrl('');
      } else if (isDirectVideo) {
        const hasCover = attachments.some(att => att.isCover);
        const shouldBeCover = !hasCover;
        const newAttachment = {
          id: 'att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          name: url.split('/').pop().split('?')[0] || 'Vidéo externe',
          type: 'video/mp4',
          size: 0,
          data: url,
          isCover: shouldBeCover
        };
        onUpdateAttachments(prev => [...prev, newAttachment]);
        setLinkUrl('');
      } else {
        alert("Lien non reconnu. Veuillez insérer un lien de partage Google Drive valide ou un lien direct d'image/vidéo.");
      }
      return;
    }

    // Google Drive Link
    const isVideo = url.toLowerCase().includes('video') || 
                    url.toLowerCase().includes('mp4') || 
                    url.toLowerCase().includes('mov') || 
                    url.toLowerCase().includes('avi') || 
                    url.toLowerCase().includes('mkv') || 
                    url.toLowerCase().includes('webm');

    const hasCover = attachments.some(att => att.isCover);
    const shouldBeCover = !hasCover;

    // Use thumbnail link for preview, or direct render link
    const dataUrl = `https://drive.google.com/thumbnail?sz=w1000&id=${driveId}`;

    const newAttachment = {
      id: 'att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      name: `Google Drive (${driveId.substring(0, 6)}...)`,
      type: isVideo ? 'video/mp4' : 'image/jpeg',
      size: 0,
      data: dataUrl,
      driveId: driveId,
      isDrive: true,
      isCover: shouldBeCover
    };

    onUpdateAttachments(prev => [...prev, newAttachment]);
    setLinkUrl('');

    // Fetch details asynchronously to enrich it immediately
    const token = localStorage.getItem('gdrive_access_token');
    if (token) {
      fetch(`https://www.googleapis.com/drive/v3/files/${driveId}?fields=name,size,imageMediaMetadata,mimeType`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch GDrive metadata');
        return res.json();
      })
      .then(metadata => {
        onUpdateAttachments(prev => prev.map(att => {
          if (att.driveId === driveId) {
            let dims = '';
            if (metadata.imageMediaMetadata && metadata.imageMediaMetadata.width && metadata.imageMediaMetadata.height) {
              dims = `${metadata.imageMediaMetadata.width}x${metadata.imageMediaMetadata.height}`;
            }
            return {
              ...att,
              name: metadata.name || att.name,
              size: metadata.size ? parseInt(metadata.size, 10) : att.size,
              dimensions: dims,
              type: metadata.mimeType || att.type
            };
          }
          return att;
        }));
      })
      .catch(err => {
        console.debug("Failed to fetch Google Drive file metadata:", err);
      });
    }
  };

  const handleAttachmentClick = (att) => {
    setPreviewMedia(att);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setPreviewMedia(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  let counterColor = 'var(--text-muted)';
  if (percentage > 90) counterColor = 'var(--danger-color)';
  else if (percentage > 70) counterColor = '#f59e0b'; // amber

  // Supprimé : handleFiles (le téléversement local de fichiers est désactivé)

  const handleDeleteAttachment = (id) => {
    if (readOnly) return;
    onUpdateAttachments(prev => prev.filter(att => att.id !== id));
  };

  const handleSetCover = (id, shouldBeCover) => {
    if (readOnly) return;
    onUpdateAttachments(prev => prev.map(att => {
      if (att.id === id) {
        return { ...att, isCover: shouldBeCover };
      }
      // S'il s'agit d'une activation de couverture, désactiver les autres
      if (shouldBeCover && (att.type?.startsWith('image/') || att.type?.startsWith('video/'))) {
        return { ...att, isCover: false };
      }
      return att;
    }));
    setContextMenu({ visible: false, x: 0, y: 0, attachmentId: null });
  };

  const handleContextMenu = (e, attachment) => {
    if (readOnly) return;
    if (!attachment.type?.startsWith('image/') && !attachment.type?.startsWith('video/')) return;
    
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      attachmentId: attachment.id
    });
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Octets';
    const k = 1024;
    const sizes = ['Octets', 'Ko', 'Mo'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFormat = (att) => {
    if (att.type) {
      const parts = att.type.split('/');
      if (parts.length > 1) {
        let f = parts[1].toUpperCase();
        if (f === 'JPEG') return 'JPG';
        return f;
      }
    }
    if (att.name) {
      const ext = att.name.split('.').pop();
      if (ext && ext.length < 5 && ext !== att.name) {
        return ext.toUpperCase();
      }
    }
    return '';
  };

  // Fermer le menu lors d'un clic extérieur
  useEffect(() => {
    const closeMenu = () => {
      setContextMenu(prev => prev.visible ? { ...prev, visible: false } : prev);
    };
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  return (
    <div className="post-editor-container">
      {/* SECTION MÉTADONNÉES : TITRE, ENTREPRISE ET STATUT */}
      <div className="editor-attachments-section glass-panel animate-fade-in" style={{ animationDelay: '0.05s', padding: '1.2rem' }}>
        <div className="metadata-fields-grid">
          
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Titre de la publication</label>
            <input 
              type="text"
              placeholder="Saisir un titre..."
              value={title}
              onChange={(e) => onChangeTitle(e.target.value)}
              disabled={readOnly}
              style={{
                padding: '0.6rem 0.8rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--surface-border)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Entreprise cliente</label>
            <select
              value={companyId}
              onChange={(e) => onChangeCompanyId(e.target.value)}
              disabled={readOnly}
              style={{
                padding: '0.6rem 0.8rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--surface-border)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
                fontFamily: 'inherit'
              }}
            >
              <option value="">-- Choisir une entreprise --</option>
              {companies.map(comp => (
                <option key={comp.id} value={comp.id}>{comp.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Statut (Kanban)</label>
            <select
              value={status}
              onChange={(e) => onChangeStatus(e.target.value)}
              disabled={readOnly}
              style={{
                padding: '0.6rem 0.8rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--surface-border)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
                fontFamily: 'inherit'
              }}
            >
              <option value="draft">💡 Brouillon / Idée</option>
              <option value="validate">👀 À valider</option>
              <option value="ready">🚀 Prêt à publier</option>
              <option value="published">✅ Publié</option>
            </select>
          </div>

        </div>
      </div>

      {/* BLOC DE PLANIFICATION DE DATE DE PUBLICATION */}
      <div className="editor-attachments-section glass-panel animate-fade-in" style={{ animationDelay: '0.1s', padding: '1.2rem' }}>
        <div className="attachments-section-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: '0.5rem' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
            <span style={{ fontSize: '1.2rem' }}>📅</span>
            <span>Planification de la publication</span>
          </h3>
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', marginTop: '0.5rem' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <input 
              type="datetime-local" 
              value={scheduledAt ? new Date(new Date(scheduledAt).getTime() - new Date(scheduledAt).getTimezoneOffset() * 60000).toISOString().substring(0, 16) : ''}
              onChange={(e) => {
                const val = e.target.value;
                onUpdateScheduledAt(val ? new Date(val).toISOString() : '');
              }}
              disabled={readOnly}
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--surface-border)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                cursor: readOnly ? 'default' : 'pointer'
              }}
            />
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {scheduledAt 
              ? `Ce post est planifié pour être publié le ${new Date(scheduledAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.` 
              : "Post non planifié. Choisissez une date et heure pour programmer ce post dans le calendrier."
            }
          </span>
        </div>
      </div>

      <div className="post-editor glass-panel animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <div className="editor-header">
          <h2>{readOnly ? "Aperçu du contenu" : "Rédigez votre contenu"}</h2>
          <span className="char-counter" style={{ color: counterColor }}>
            {currentLength} / {maxLength}
          </span>
        </div>
        
        <textarea
          className="editor-textarea"
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder={readOnly ? "Contenu vide." : "Écrivez votre post incroyable ici..."}
          maxLength={maxLength}
          readOnly={readOnly}
          style={readOnly ? { cursor: 'default', background: 'rgba(255,255,255,0.01)' } : {}}
        />
        
        <div className="editor-footer">
          <p className="hint">
            {readOnly 
              ? "Revue du texte de la publication. Vous pouvez commenter ci-dessous pour proposer des ajustements."
              : "Astuce: Sautez des lignes pour aérer votre texte. Les emojis sont les bienvenus ! ✨"
            }
          </p>
        </div>
      </div>

      {/* SECTION PIÈCES JOINTES */}
      <div className="editor-attachments-section glass-panel animate-fade-in" style={{ animationDelay: '0.25s' }}>
        <div className="attachments-section-header">
          <h3>
            <Paperclip size={16} />
            Pièces jointes <span className="attachments-count-badge">{attachments.length}</span>
          </h3>
        </div>

        {!readOnly && (
          <>
            <form className="attachments-link-input-row" onSubmit={handleUrlSubmit}>
              <input 
                type="text" 
                placeholder="Coller un lien Google Drive ou un lien direct d'image/vidéo..." 
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="drive-link-input"
              />
              <button 
                type="submit" 
                className="btn-add-drive-link"
              >
                Ajouter lien
              </button>
            </form>
          </>
        )}

        {/* Liste des pièces jointes */}
        {attachments.length > 0 ? (
          <div className="attachments-grid">
            {attachments.map(att => {
              const isImage = att.type?.startsWith('image/');
              const isVideo = att.type?.startsWith('video/');
              const hasThumbnail = isImage || isVideo;
              
              return (
                <div 
                  key={att.id} 
                  className={`attachment-card glass-panel ${att.isCover ? 'is-cover' : ''}`}
                  onContextMenu={(e) => !readOnly && handleContextMenu(e, att)}
                  onClick={() => handleAttachmentClick(att)}
                  style={{ cursor: 'pointer' }}
                  title={readOnly ? "Fichier joint (clic pour ouvrir)" : (hasThumbnail ? "Clic pour ouvrir • Clic droit pour couverture ou supprimer" : "Clic pour ouvrir")}
                >
                  {hasThumbnail ? (
                    <div className="attachment-thumbnail-wrapper">
                      <SecureMedia 
                        src={att.data} 
                        driveId={att.driveId} 
                        type={att.type} 
                        alt={att.name} 
                        className="attachment-thumbnail" 
                        onLoad={(meta) => {
                          if (meta.width && meta.height && !att.dimensions) {
                            onUpdateAttachments(prev => prev.map(item => {
                              if (item.id === att.id) {
                                return {
                                  ...item,
                                  dimensions: `${meta.width}x${meta.height}`
                                };
                              }
                              return item;
                            }));
                          }
                        }}
                      />
                      {att.isCover && <span className="cover-badge">🌅 Couverture</span>}
                      {isVideo && <span className="video-badge">📹 Vidéo</span>}
                    </div>
                  ) : (
                    <div className="attachment-file-icon-wrapper">
                      <FileText size={32} className="file-icon" />
                      <span className="file-type-badge">{att.name.split('.').pop().toUpperCase()}</span>
                    </div>
                  )}

                  <div className="attachment-info">
                    <span className="attachment-name" title={att.name}>{att.name}</span>
                    <div className="attachment-details" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.15rem' }}>
                      <span className="attachment-size" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        {att.size > 0 ? formatSize(att.size) : 'Taille inconnue'}
                      </span>
                      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                        {getFormat(att) && (
                          <span className="attachment-format" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>
                            {getFormat(att)}
                          </span>
                        )}
                        {att.dimensions && (
                          <span className="attachment-dimensions" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>
                            {att.dimensions}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!readOnly && (
                    <button 
                      type="button" 
                      className="btn-delete-attachment"
                      onClick={() => handleDeleteAttachment(att.id)}
                      title="Supprimer la pièce jointe"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          readOnly && (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Aucun fichier joint à ce post.
            </div>
          )
        )}
      </div>

      {/* MENU CONTEXTUEL FLOTTANT (CLIC DROIT) */}
      {!readOnly && contextMenu.visible && createPortal(
        <div 
          className="custom-context-menu glass-panel" 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {attachments.find(a => a.id === contextMenu.attachmentId)?.isCover ? (
            <button type="button" onClick={() => handleSetCover(contextMenu.attachmentId, false)}>
              ❌ Retirer de la couverture
            </button>
          ) : (
            <button type="button" onClick={() => handleSetCover(contextMenu.attachmentId, true)}>
              🖼️ Choisir comme couverture
            </button>
          )}
          <div className="context-menu-divider"></div>
          <button type="button" className="btn-delete" onClick={() => { handleDeleteAttachment(contextMenu.attachmentId); setContextMenu({ visible: false, x: 0, y: 0, attachmentId: null }); }}>
            🗑️ Supprimer la pièce jointe
          </button>
        </div>,
        document.body
      )}

      {/* MODALE LIGHTBOX POUR LA PRÉVISUALISATION DIRECTE DES MÉDIAS */}
      {previewMedia && (
        <div className="media-preview-lightbox" onClick={() => setPreviewMedia(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button 
              type="button" 
              className="lightbox-close-btn" 
              onClick={() => setPreviewMedia(null)}
              title="Fermer la prévisualisation"
            >
              &times;
            </button>
            <div className="lightbox-media-wrapper">
              {previewMedia.type?.startsWith('video/') ? (
                previewMedia.driveId ? (
                  <iframe 
                    src={`https://drive.google.com/file/d/${previewMedia.driveId}/preview`}
                    className="lightbox-video-iframe"
                    allow="autoplay"
                    frameBorder="0"
                  ></iframe>
                ) : (
                  <video 
                    src={previewMedia.data} 
                    controls 
                    autoPlay 
                    className="lightbox-video-element"
                  />
                )
              ) : (
                <SecureMedia 
                  src={previewMedia.data} 
                  driveId={previewMedia.driveId} 
                  type={previewMedia.type} 
                  alt={previewMedia.name} 
                  className="lightbox-image-element"
                />
              )}
            </div>
            <div className="lightbox-caption">
              <span className="lightbox-media-name">{previewMedia.name}</span>
              {previewMedia.driveId && (
                <a 
                  href={`https://drive.google.com/file/d/${previewMedia.driveId}/view?usp=drivesdk`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="lightbox-drive-btn"
                >
                  Ouvrir dans Drive ↗
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
