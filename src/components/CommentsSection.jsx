import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Send, Calendar } from 'lucide-react';
import { getCommentsForPost, insertComment } from '../utils/supabaseService';
import './CommentsSection.css';

export default function CommentsSection({ postId, clients = [], stepupUsers = [], currentUser }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  
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

  const [notifiedCommentIds, setNotifiedCommentIds] = useState(new Set());
  const [isFirstLoad, setIsFirstLoad] = useState(true);

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
      if (isFirstLoad) {
        // Initialize notified IDs with existing comments to prevent notification spam on first load
        const ids = new Set(comments.map(c => c.id));
        setNotifiedCommentIds(ids);
        setIsFirstLoad(false);
      } else {
        const currentFirstName = currentUser.name?.split(' ')[0]?.toLowerCase();
        if (currentFirstName) {
          comments.forEach(c => {
            if (!notifiedCommentIds.has(c.id)) {
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
              
              setNotifiedCommentIds(prev => {
                const next = new Set(prev);
                next.add(c.id);
                return next;
              });
            }
          });
        }
      }
    }
  }, [comments, currentUser, isFirstLoad, notifiedCommentIds]);

  useEffect(() => {
    setIsFirstLoad(true);
    setNotifiedCommentIds(new Set());
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
            return (
              <div key={c.id} className={`comment-bubble-wrapper ${isStepup ? 'stepup-comment' : 'client-comment'}`}>
                <div className="comment-meta">
                  <span className="comment-author">{c.authorName}</span>
                  <span className={`comment-author-badge ${isStepup ? 'badge-stepup' : 'badge-client'}`}>
                    {isStepup ? 'Step Up' : 'Client'}
                  </span>
                  {c.authorDetail && (
                    <span className="comment-author-detail">• {c.authorDetail}</span>
                  )}
                </div>
                <div className="comment-content-text">{c.content}</div>
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

        <div className="comment-input-row">
          <textarea
            className="comment-textarea"
            placeholder="Écrivez un commentaire..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
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
