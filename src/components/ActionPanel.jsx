import React, { useState } from 'react';
import { Copy, CheckCircle2, Columns, Save, XCircle } from 'lucide-react';
import './ActionPanel.css';

export default function ActionPanel({ 
  content, 
  onSaveToTrello, 
  isEditingExistingCard, 
  readOnly = false,
  isClient = false,
  onClientValidate,
  onClientRefuse
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="action-panel glass-panel animate-fade-in" style={{ animationDelay: '0.4s' }}>
      
      {/* BOUTONS ACTIONS CLIENT (uniquement pour les cartes existantes à valider) */}
      {isClient && isEditingExistingCard && (
        <>
          <button 
            type="button"
            className="btn btn-client-validate" 
            onClick={onClientValidate}
          >
            <CheckCircle2 size={20} />
            Valider le post
          </button>
          
          <button 
            type="button"
            className="btn btn-client-refuse" 
            onClick={onClientRefuse}
          >
            <XCircle size={20} />
            Refuser / Demander modification
          </button>
        </>
      )}

      <button 
        className={`btn btn-copy ${copied ? 'copied' : ''}`}
        onClick={handleCopy}
        disabled={!content}
        style={(readOnly && !isClient) ? { flex: 1 } : {}}
      >
        {copied ? (
          <>
            <CheckCircle2 size={20} />
            Copié !
          </>
        ) : (
          <>
            <Copy size={20} />
            Copier le texte du post
          </>
        )}
      </button>

      {/* BOUTON ENREGISTRER DANS TRELLO - Masqué pour les clients */}
      {!readOnly && (
        <button 
          className="btn btn-trello-save" 
          onClick={onSaveToTrello}
          disabled={!content}
        >
          {isEditingExistingCard ? (
            <>
              <Save size={20} />
              Mettre à jour dans Trello
            </>
          ) : (
            <>
              <Columns size={20} />
              Enregistrer dans Trello
            </>
          )}
        </button>
      )}
    </div>
  );
}

