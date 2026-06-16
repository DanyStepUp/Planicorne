import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Send, Calendar, Edit2, Trash2, Check, X } from 'lucide-react';
import { getCommentsForPost, insertComment, updateComment, deleteComment } from '../utils/supabaseService';
import './CommentsSection.css';

export default function CommentsSection({ postId, clients = [], stepupUsers = [], currentUser }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  // States for comment editing
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // États pour le menu d'autocomplétion / tag @
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  const textareaRef = useRef(null);

  // Selected author profile
  const [selectedAuthor] = useState(() => {
    if (currentUser) {
      if (currentUser.role?.trim().toLowerCase() === 'client' && currentUser.client_id) {
        return `client:${currentUser.client_id}`;
      } else if (currentUser.stepup_user_id) {
        return `stepup_user:${currentUser.stepup_user_id}`;
      }
    }
    return '';
  });

  // Load comments
  const loadComments = useCallback(async () => {
    if (!postId) return;
    setFetching(true);
    try {
      const data = await getCommentsForPost(postId);
      setComments(data);
    } catch (e) {
      console.error("Failed to load comments:", e);
    } finally {
      setFetching(false);
    }
  }, [postId]);

  const notifiedCommentIds = useRef(new Set());
  const isFirstLoad = useRef(true);

  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  // Monitor new comments for @+prénom mentions
  useEffect(() => {
    if (comments.length > 0 && currentUser) {
      if (isFirstLoad.current) {
        // Initialize notified IDs with existing comments to prevent notification spam on first load
        comments.forEach(c => notifiedCommentIds.current.add(c.id));
        isFirstLoad.current = false;
      } else {
        const currentFirstName = currentUser.name?.split(' ')[0]?.toLowerCase();
        if (currentFirstName) {
          comments.forEach(c => {
            if (!notifiedCommentIds.current.has(c.id)) {
              const mentionText = `@+${currentFirstName}`;
              const isOwnComment = c.authorName === currentUser.name;

              if (c.content.toLowerCase().includes(mentionText) && !isOwnComment) {
                if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                  try {
                    new Notification(`Mention dans Planicorne`, {
                      body: `${c.authorName} : ${c.content}`,
                      icon: '/Logo Step Up.png'
                    });
                  } catch (e) {
                    console.warn("Failed to trigger browser notification:", e);
                  }
                }
              }

              notifiedCommentIds.current.add(c.id);
            }
          });
        }
      }
    }
  }, [comments, currentUser]);

  useEffect(() => {
    isFirstLoad.current = true;
    notifiedCommentIds.current = new Set();
    const t = setTimeout(() => {
      loadComments();
    }, 0);
    return () => clearTimeout(t);
  }, [loadComments, postId]);

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedAuthor) return;

    setLoading(true);
    const [authorType, authorId] = selectedAuthor.split(':');

    try {
      await insertComment(postId, authorId, authorType, newComment.trim());
      setNewComment('');
      await loadComments();
    } catch (err) {
      console.error("Failed to insert comment:", err);
      alert("Erreur lors de l'envoi du commentaire. Assurez-vous d'avoir exécuté la migration SQL.");
    } finally {
      setLoading(false);
    }
  };

  const isCommentOwner = (c) => {
    if (!currentUser) return false;
    const role = currentUser.role?.trim().toLowerCase();
    if (role === 'client') {
      return currentUser.client_id && c.client_author_id === currentUser.client_id;
    } else {
      return currentUser.stepup_user_id && c.stepup_author_id === currentUser.stepup_user_id;
    }
  };

  const handleSaveEdit = async (commentId) => {
    if (!editingContent.trim()) return;
    setSubmittingEdit(true);
    try {
      await updateComment(commentId, editingContent.trim());
      setEditingCommentId(null);
      setEditingContent('');
      await loadComments();
    } catch (err) {
      console.error("Failed to update comment:", err);
      alert("Erreur lors de la modification du commentaire.");
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    const confirmDel = window.confirm("Voulez-vous supprimer ce commentaire ?");
    if (!confirmDel) return;

    try {
      await deleteComment(commentId);
      await loadComments();
    } catch (err) {
      console.error("Failed to delete comment:", err);
      alert("Erreur lors de la suppression du commentaire.");
    }
  };

  // Liste des suggestions disponibles pour le tag @
  const getSuggestions = useCallback(() => {
    if (!currentUser) return [];
    const role = currentUser.role?.trim().toLowerCase();

    let list = role === 'client'
      ? stepupUsers
        .filter(u => u.company_ids && u.company_ids.includes(currentUser.company_id))
        .map(u => ({ id: u.id, name: u.name, type: 'stepup', sub: u.role }))
      : [
        ...stepupUsers.map(u => ({ id: u.id, name: u.name, type: 'stepup', sub: u.role })),
        ...clients.map(c => ({ id: c.id, name: c.name, type: 'client', sub: c.companies?.name || 'Client' }))
      ];

    if (suggestionQuery) {
      list = list.filter(item => item.name.toLowerCase().includes(suggestionQuery));
    }
    return list;
  }, [currentUser, stepupUsers, clients, suggestionQuery]);

  const handleSelectSuggestion = (item) => {
    const textBeforeAt = newComment.substring(0, cursorPos);
    const textAfterCursor = newComment.substring(textareaRef.current?.selectionStart || cursorPos);

    // Formater la mention : @+prenom (pour matcher le détecteur de notification natif)
    const firstName = item.name.split(' ')[0].toLowerCase();
    const tag = `@+${firstName} `;

    const value = textBeforeAt + tag + textAfterCursor;
    setNewComment(value);
    setShowSuggestions(false);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = cursorPos + tag.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleTextareaChange = (e) => {
    const value = e.target.value;
    setNewComment(value);

    const selectionStart = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, selectionStart);
    const lastAtOffset = textBeforeCursor.lastIndexOf('@');

    if (lastAtOffset !== -1) {
      const isStartOrHasSpace = lastAtOffset === 0 ||
        textBeforeCursor.charAt(lastAtOffset - 1) === ' ' ||
        textBeforeCursor.charAt(lastAtOffset - 1) === '\n';
      const textAfterAt = textBeforeCursor.substring(lastAtOffset + 1);

      if (isStartOrHasSpace && !textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        setSuggestionQuery(textAfterAt.toLowerCase());
        setShowSuggestions(true);
        setCursorPos(lastAtOffset);
        setSelectedIndex(0);
        return;
      }
    }
    setShowSuggestions(false);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions) return;

    const currentSuggestions = getSuggestions();
    if (currentSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % currentSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + currentSuggestions.length) % currentSuggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      handleSelectSuggestion(currentSuggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowSuggestions(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const getAuthorDisplay = () => {
    if (!currentUser) return '';
    const detail = currentUser.role?.trim().toLowerCase() === 'client'
      ? (clients.find(c => c.id === currentUser.client_id)?.companies?.name || 'Client')
      : (stepupUsers.find(u => u.id === currentUser.stepup_user_id)?.role || 'Équipe Step Up');
    return `${currentUser.name} (${detail})`;
  };

  return (
    <div className="comments-section-container glass-panel animate-fade-in" style={{ animationDelay: '0.3s' }}>
      <div className="comments-header">
        <h3>
          <MessageSquare size={18} />
          <span>Discussion & Commentaires ({comments.length})</span>
        </h3>
      </div>

      {/* List of comments */}
      <div className="comments-list">
        {fetching ? (
          <div className="comments-loading">Chargement des commentaires...</div>
        ) : comments.length > 0 ? (
          comments.map(c => {
            const isStepup = c.authorType === 'Step Up';
            const isOwner = isCommentOwner(c);
            const isEditing = editingCommentId === c.id;

            return (
              <div key={c.id} className={`comment-bubble-wrapper ${isStepup ? 'stepup-comment' : 'client-comment'}`}>
                <div className="comment-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span className="comment-author">{c.authorName}</span>
                    <span className={`comment-author-badge ${isStepup ? 'badge-stepup' : 'badge-client'}`}>
                      {isStepup ? 'Step Up' : 'Client'}
                    </span>
                    {c.authorDetail && (
                      <span className="comment-author-detail">• {c.authorDetail}</span>
                    )}
                  </div>
                  
                  {isOwner && !isEditing && (
                    <div className="comment-actions">
                      <button 
                        type="button"
                        className="btn-comment-action" 
                        onClick={() => { setEditingCommentId(c.id); setEditingContent(c.content); }}
                        title="Modifier le commentaire"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button 
                        type="button"
                        className="btn-comment-action btn-delete" 
                        onClick={() => handleDeleteComment(c.id)}
                        title="Supprimer le commentaire"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="comment-edit-form">
                    <textarea
                      className="comment-edit-textarea"
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      required
                      rows={2}
                    />
                    <div className="comment-edit-actions">
                      <button
                        type="button"
                        className="btn-edit-action btn-edit-cancel"
                        onClick={() => { setEditingCommentId(null); setEditingContent(''); }}
                        disabled={submittingEdit}
                      >
                        <X size={12} /> Annuler
                      </button>
                      <button
                        type="button"
                        className="btn-edit-action btn-edit-save"
                        onClick={() => handleSaveEdit(c.id)}
                        disabled={submittingEdit || !editingContent.trim()}
                      >
                        <Check size={12} /> Sauvegarder
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="comment-content-text">{c.content}</div>
                )}

                <div className="comment-timestamp">
                  <Calendar size={10} />
                  <span>{formatDate(c.createdAt)}</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="comments-empty-state">
            <p>Aucun commentaire pour le moment. Rédigez le premier commentaire !</p>
          </div>
        )}
      </div>

      {/* Post comment form */}
      <form className="comment-form" onSubmit={handleSubmitComment}>
        <div className="comment-profile-selector" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            Rédiger un commentaire en tant que :
          </span>
          <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginTop: '0.2rem', display: 'block' }}>
            {currentUser?.role?.trim().toLowerCase() === 'client' ? '💼 ' : '👤 '}
            {getAuthorDisplay()}
          </strong>
        </div>

        {showSuggestions && getSuggestions().length > 0 && (
          <div className="mention-suggestions-dropdown glass-panel" style={{
            position: 'absolute',
            bottom: '100%',
            left: '0',
            right: '0',
            maxHeight: '180px',
            overflowY: 'auto',
            background: 'var(--surface-color)',
            border: '1px solid var(--surface-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.25)',
            zIndex: 50,
            marginBottom: '0.5rem',
            display: 'flex',
            flexDirection: 'column',
            padding: '0.25rem'
          }}>
            {getSuggestions().map((item, index) => (
              <div
                key={item.id}
                onClick={() => handleSelectSuggestion(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: index === selectedIndex ? 'var(--primary-color)' : 'transparent',
                  color: index === selectedIndex ? '#ffffff' : 'var(--text-main)',
                  fontSize: '0.85rem'
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span style={{ fontWeight: 600 }}>{item.name}</span>
                <span style={{
                  fontSize: '0.75rem',
                  color: index === selectedIndex ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
                  background: index === selectedIndex ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.03)',
                  padding: '0.05rem 0.35rem',
                  borderRadius: '4px'
                }}>
                  {item.sub}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="comment-input-row">
          <textarea
            ref={textareaRef}
            className="comment-textarea"
            placeholder="Écrivez un commentaire... (utilisez @ pour mentionner)"
            value={newComment}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            required
            rows={2}
          />
          <button
            type="submit"
            className="btn-send-comment"
            disabled={loading || !newComment.trim()}
            title="Envoyer le commentaire"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
