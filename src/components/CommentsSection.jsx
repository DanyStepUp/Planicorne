import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, Calendar } from 'lucide-react';
import { getCommentsForPost, insertComment } from '../utils/supabaseService';
import './CommentsSection.css';

export default function CommentsSection({ postId, clients = [], stepupUsers = [], currentUser }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  
  // Selected author profile
  const [selectedAuthor, setSelectedAuthor] = useState('');

  // Assigner automatiquement l'auteur basé sur l'utilisateur connecté
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role?.trim().toLowerCase() === 'client' && currentUser.client_id) {
        setSelectedAuthor(`client:${currentUser.client_id}`);
      } else if (currentUser.stepup_user_id) {
        setSelectedAuthor(`stepup_user:${currentUser.stepup_user_id}`);
      }
    }
  }, [currentUser]);

  // Load comments
  const loadComments = async () => {
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
  };

  useEffect(() => {
    loadComments();
  }, [postId]);

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
