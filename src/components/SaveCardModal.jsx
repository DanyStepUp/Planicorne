import { useState } from 'react';
import { X, Save, Columns } from 'lucide-react';
import './SaveCardModal.css';

export default function SaveCardModal({ 
  isOpen, 
  onClose, 
  onSave, 
  initialTitle = '', 
  initialColumn = 'draft',
  initialScheduledAt = '',
  initialCompanyId = '',
  companies = [],
  isUpdate = false
}) {
  const [title, setTitle] = useState(initialTitle);
  const [column, setColumn] = useState(initialColumn);
  const [companyId, setCompanyId] = useState(initialCompanyId || (companies.length > 0 ? companies[0].id : ''));
  const [scheduledAt, setScheduledAt] = useState(() => {
    if (initialScheduledAt) {
      try {
        const date = new Date(initialScheduledAt);
        const offset = date.getTimezoneOffset();
        const adjustedDate = new Date(date.getTime() - (offset*60*1000));
        return adjustedDate.toISOString().substring(0, 16);
      } catch {
        return '';
      }
    } else {
      const now = new Date();
      const offset = now.getTimezoneOffset();
      const adjustedDate = new Date(now.getTime() - (offset*60*1000));
      return adjustedDate.toISOString().substring(0, 16);
    }
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !companyId) return;
    onSave({ 
      title: title.trim(), 
      column, 
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      company_id: companyId
    });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container glass-panel animate-fade-in">
        <div className="modal-header">
          <div className="modal-title">
            <Columns size={20} className="modal-title-icon" />
            <h3>{isUpdate ? "Mettre à jour dans Trello" : "Enregistrer dans le Tableau Trello"}</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </div>
 
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="card-title">Titre du Post</label>
              <input 
                id="card-title"
                type="text" 
                placeholder="Ex: Lancement de l'offre d'été" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                maxLength={80}
                required
                autoFocus
              />
              <span className="char-count">{title.length} / 80</span>
            </div>
 
            <div className="form-group">
              <label htmlFor="card-scheduled">Date & Heure de Publication</label>
              <input 
                id="card-scheduled"
                type="datetime-local" 
                value={scheduledAt} 
                onChange={(e) => setScheduledAt(e.target.value)}
                required
              />
            </div>
 
            <div className="form-group">
              <label htmlFor="card-company">Entreprise / Client</label>
              <select 
                id="card-company"
                value={companyId} 
                onChange={(e) => setCompanyId(e.target.value)}
                required
              >
                <option value="">-- Sélectionner une entreprise --</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="card-column">Statut / Colonne Trello</label>
              <select 
                id="card-column"
                value={column} 
                onChange={(e) => setColumn(e.target.value)}
              >
                <option value="draft">💡 Idées / Brouillons</option>
                <option value="validate">👀 À valider</option>
                <option value="ready">🚀 Prêt à publier</option>
                <option value="published">✅ Publié</option>
              </select>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary-modal" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary-modal" disabled={!title.trim()}>
              <Save size={18} />
              {isUpdate ? "Enregistrer les modifications" : "Ajouter au Tableau"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
