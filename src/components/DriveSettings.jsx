import React, { useState, useEffect } from 'react';
import { 
  Cloud, 
  FolderOpen, 
  Database, 
  Settings, 
  Info, 
  CheckCircle2, 
  AlertTriangle, 
  Link, 
  Unlink, 
  RefreshCw 
} from 'lucide-react';
import { 
  saveHandleToDB, 
  clearHandleFromDB, 
  getOrCreateDriveFolder 
} from '../utils/driveSync';
import './DriveSettings.css';

export default function DriveSettings({ 
  syncMode, 
  setSyncMode, 
  localDirectoryName, 
  setLocalDirectoryHandle, 
  setLocalDirectoryName,
  cloudAccessToken,
  setCloudAccessToken,
  cloudFolderId,
  setCloudFolderId,
  onRefreshBoard,
  supabaseConnected,
  supabaseTableExists,
  hasLegacyCardsToMigrate,
  onMigrateCards,
  checkSupabaseDb
}) {
  const [clientId, setClientId] = useState(localStorage.getItem('gdrive_client_id') || '');
  const [apiKey, setApiKey] = useState(localStorage.getItem('gdrive_api_key') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [testingConnection, setTestingConnection] = useState(false);

  // Save settings when ClientId or ApiKey changes
  useEffect(() => {
    if (clientId) localStorage.setItem('gdrive_client_id', clientId);
    else localStorage.removeItem('gdrive_client_id');
  }, [clientId]);

  useEffect(() => {
    if (apiKey) localStorage.setItem('gdrive_api_key', apiKey);
    else localStorage.removeItem('gdrive_api_key');
  }, [apiKey]);

  const showFeedback = (type, message) => {
    if (type === 'success') {
      setSuccess(message);
      setError(null);
      setTimeout(() => setSuccess(null), 4000);
    } else {
      setError(message);
      setSuccess(null);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const exists = await checkSupabaseDb();
      if (exists) {
        showFeedback('success', "Connexion réussie à Supabase ! La table 'posts' est opérationnelle.");
      } else {
        showFeedback('error', "Impossible de trouver la table 'posts' sur Supabase. Assurez-vous d'avoir exécuté la migration SQL.");
      }
    } catch (e) {
      showFeedback('error', "Échec de la connexion à Supabase : " + e.message);
    } finally {
      setTestingConnection(false);
    }
  };

  // --- CONNECT DOSSIER LOCAL ---
  const handleConnectLocalFolder = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!window.showDirectoryPicker) {
        throw new Error("Votre navigateur ne supporte pas l'accès direct aux dossiers locaux. Veuillez utiliser Google Chrome, Edge ou un autre navigateur basé sur Chromium.");
      }
      
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });
      
      await saveHandleToDB(handle);
      setLocalDirectoryHandle(handle);
      setLocalDirectoryName(handle.name);
      setSyncMode('local_dir');
      localStorage.setItem('sync_mode', 'local_dir');
      
      showFeedback('success', `Dossier "${handle.name}" connecté avec succès ! Vos posts y seront enregistrés.`);
      onRefreshBoard();
    } catch (err) {
      if (err.name !== 'AbortError') {
        showFeedback('error', err.message || "Impossible de sélectionner le dossier.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectLocalFolder = async () => {
    try {
      await clearHandleFromDB();
      setLocalDirectoryHandle(null);
      setLocalDirectoryName('');
      setSyncMode('local');
      localStorage.setItem('sync_mode', 'local');
      showFeedback('success', "Dossier local déconnecté. Retour au stockage local du navigateur.");
      onRefreshBoard();
    } catch (err) {
      showFeedback('error', "Erreur lors de la déconnexion du dossier local.");
    }
  };

  // --- GOOGLE DRIVE OAUTH CLOUD ---
  const handleConnectCloudDrive = async () => {
    if (!clientId) {
      showFeedback('error', "Veuillez fournir un ID Client OAuth de votre projet Google Cloud.");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Configuration de l'authentification OAuth 2.0 Implicit Flow
      const redirectUri = window.location.origin + window.location.pathname;
      const scope = 'https://www.googleapis.com/auth/drive.file';
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scope)}&state=gdrive_auth`;
      
      // Sauvegarder les paramètres de reconnexion temporaire
      localStorage.setItem('gdrive_pending_auth', 'true');
      
      // Rediriger vers Google OAuth
      window.location.href = authUrl;
    } catch (err) {
      showFeedback('error', "Échec du lancement de la connexion Google : " + err.message);
      setLoading(false);
    }
  };

  // Traiter le retour d'OAuth (hash URL) au chargement
  useEffect(() => {
    const checkHash = async () => {
      const hash = window.location.hash;
      const isPending = localStorage.getItem('gdrive_pending_auth') === 'true';
      
      if (hash && hash.includes('access_token') && isPending) {
        localStorage.removeItem('gdrive_pending_auth');
        setLoading(true);
        
        // Extraction des paramètres
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');
        
        // Effacer le hash dans la barre d'adresse sans recharger
        window.history.replaceState(null, null, window.location.pathname + window.location.search);
        
        try {
          // Valider et récupérer/créer le dossier AllPosts
          const folderId = await getOrCreateDriveFolder(token);
          
          setCloudAccessToken(token);
          setCloudFolderId(folderId);
          setSyncMode('cloud');
          
          localStorage.setItem('sync_mode', 'cloud');
          localStorage.setItem('gdrive_access_token', token);
          localStorage.setItem('gdrive_folder_id', folderId);
          
          showFeedback('success', "Connecté à Google Drive Cloud ! Le dossier 'AllPosts' a été configuré.");
          onRefreshBoard();
        } catch (err) {
          showFeedback('error', "Erreur d'initialisation Google Drive : " + err.message);
        } finally {
          setLoading(false);
        }
      }
    };
    
    checkHash();
  }, []);

  const handleDisconnectCloud = () => {
    setCloudAccessToken('');
    setCloudFolderId('');
    setSyncMode('local');
    localStorage.removeItem('gdrive_access_token');
    localStorage.removeItem('gdrive_folder_id');
    localStorage.setItem('sync_mode', 'local');
    showFeedback('success', "Google Drive déconnecté. Retour au stockage local.");
    onRefreshBoard();
  };

  return (
    <div className="drive-settings-container animate-fade-in">
      <div className="settings-header glass-panel">
        <div className="settings-title-area">
          <Settings className="settings-main-icon" size={32} />
          <div>
            <h2>Configuration de la Base de données & Synchronisation</h2>
            <p>Gérez le stockage de vos contenus (Supabase PostgreSQL ou Google Drive).</p>
          </div>
        </div>

        {/* INDICATEUR DE STATUT */}
        <div className="sync-status-card">
          <div className="status-indicator-wrapper">
            <span 
              className={`status-dot ${syncMode === 'local' ? 'status-local' : 'status-active'}`}
              style={syncMode === 'supabase' ? { backgroundColor: '#3ecf8e', boxShadow: '0 0 8px #3ecf8e' } : {}}
            ></span>
            <div>
              <span className="status-label">Stockage actif :</span>
              <span className="status-value">
                {syncMode === 'supabase' && "⚡ Supabase PostgreSQL Cloud"}
                {syncMode === 'local' && "📁 Stockage Local du navigateur"}
                {syncMode === 'local_dir' && `💻 Google Drive Local (${localDirectoryName})`}
                {syncMode === 'cloud' && "☁️ Google Drive Cloud"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {success && (
        <div className="notification success-notification">
          <CheckCircle2 size={20} />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="notification error-notification">
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      )}

      <div className="settings-options-grid">
        {/* OPTION SUPABASE */}
        <div className={`option-card glass-panel ${syncMode === 'supabase' ? 'active' : ''}`} style={syncMode === 'supabase' ? { borderColor: '#3ecf8e' } : {}}>
          <div className="option-icon-wrapper" style={{ backgroundColor: '#3ecf8e', color: 'white' }}>
            <Database size={24} />
          </div>
          <h3>Supabase PostgreSQL (Recommandé)</h3>
          <p className="option-desc">
            Base de données PostgreSQL cloud sécurisée. Vos posts et pièces jointes sont stockés en temps réel et accessibles partout.
          </p>
          <div className="option-benefits">
            <div className="benefit-item">
              🔌 Connexion : {supabaseConnected ? (
                <span style={{ color: '#10b981', fontWeight: 600 }}>● Active</span>
              ) : (
                <span style={{ color: '#ef4444', fontWeight: 600 }}>
                  {supabaseTableExists ? "● Déconnectée" : "● Table posts absente"}
                </span>
              )}
            </div>
            <div className="benefit-item">🛡️ Sécurité PostgreSQL RLS configurée</div>
            <div className="benefit-item">🌐 Multi-plateforme avec persistance cloud fiable</div>
          </div>

          <div className="action-area" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: 'auto', width: '100%' }}>
            <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
              <button 
                className={`btn-option ${syncMode === 'supabase' ? 'btn-active' : 'btn-secondary'}`}
                style={{ flex: 1, backgroundColor: syncMode === 'supabase' ? '#3ecf8e' : '', borderColor: syncMode === 'supabase' ? '#3ecf8e' : '', color: syncMode === 'supabase' ? '#000' : '' }}
                onClick={() => {
                  setSyncMode('supabase');
                  localStorage.setItem('sync_mode', 'supabase');
                  showFeedback('success', "Base de données Supabase activée.");
                  onRefreshBoard();
                }}
                disabled={syncMode === 'supabase'}
              >
                {syncMode === 'supabase' ? "Mode actif" : "Activer ce mode"}
              </button>
              
              <button 
                className="btn-option btn-secondary"
                onClick={handleTestConnection}
                disabled={testingConnection}
                style={{ flex: '0 0 auto', width: '90px', padding: '0.5rem' }}
              >
                {testingConnection ? <RefreshCw size={14} className="animate-spin" /> : "Tester"}
              </button>
            </div>

            {hasLegacyCardsToMigrate && (
              <button 
                className="btn-option" 
                style={{ backgroundColor: 'rgba(25, 140, 204, 0.1)', color: 'var(--primary-color)', border: '1px solid var(--primary-color)', width: '100%' }}
                onClick={onMigrateCards}
              >
                📥 Importer les posts locaux ({localStorage.getItem('trello_cards') ? JSON.parse(localStorage.getItem('trello_cards')).length : 0})
              </button>
            )}
          </div>
        </div>

        {/* OPTION 1 : STOCKAGE LOCAL */}
        <div className={`option-card glass-panel ${syncMode === 'local' ? 'active' : ''}`}>
          <div className="option-icon-wrapper local-bg">
            <Database size={24} />
          </div>
          <h3>Stockage Local du navigateur</h3>
          <p className="option-desc">
            Vos posts sont stockés de manière sécurisée dans la mémoire cache locale de votre navigateur (LocalStorage).
          </p>
          <div className="option-benefits">
            <div className="benefit-item">⚡ Ultra-rapide et fonctionne hors-ligne</div>
            <div className="benefit-item">🛡️ Aucune connexion ou compte requis</div>
            <div className="benefit-item">⚠️ Attention : Données perdues si le cache est vidé</div>
          </div>
          <button 
            className={`btn-option ${syncMode === 'local' ? 'btn-active' : 'btn-secondary'}`}
            onClick={() => {
              setSyncMode('local');
              localStorage.setItem('sync_mode', 'local');
              showFeedback('success', "Stockage local activé.");
              onRefreshBoard();
            }}
            disabled={syncMode === 'local'}
          >
            {syncMode === 'local' ? "Mode actif" : "Activer ce mode"}
          </button>
        </div>

        {/* OPTION 2 : DOSSIER DRIVE LOCAL */}
        <div className={`option-card glass-panel ${syncMode === 'local_dir' ? 'active' : ''}`}>
          <div className="option-icon-wrapper drive-bg">
            <FolderOpen size={24} />
          </div>
          <h3>Google Drive Local (Legacy)</h3>
          <p className="option-desc">
            L'application écrit des fichiers `.json` individuels dans un dossier de votre ordinateur qui se synchronise via Google Drive Desktop.
          </p>
          <div className="option-benefits">
            <div className="benefit-item">☁️ Synchronisation transparente via Google Drive Desktop</div>
            <div className="benefit-item">🔑 Sans compte de développeur</div>
            <div className="benefit-item">📁 Fichiers lisibles en clair sur l'ordinateur</div>
          </div>

          <div className="action-area">
            {syncMode === 'local_dir' ? (
              <div className="connected-folder-info">
                <div className="folder-name-display">
                  <CheckCircle2 size={16} className="color-success" />
                  <span>Dossier : <strong>{localDirectoryName}</strong></span>
                </div>
                <div className="btn-group-row">
                  <button className="btn-action-small" onClick={handleConnectLocalFolder} disabled={loading}>
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Changer
                  </button>
                  <button className="btn-action-small btn-danger-small" onClick={handleDisconnectLocalFolder}>
                    <Unlink size={14} /> Déconnecter
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-option btn-primary" onClick={handleConnectLocalFolder} disabled={loading}>
                <Link size={18} /> Sélectionner le dossier local
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION INSTRUCTIONS SQL SUPABASE */}
      <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <Info className="color-primary" size={24} style={{ color: 'var(--primary-color)' }} />
          <h3 style={{ margin: 0 }}>Instructions de configuration Supabase (SQL)</h3>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Pour initialiser votre base de données PostgreSQL, ouvrez le <a href="https://supabase.com/dashboard/project/znkbczgdipzgplqnnpkx" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: 'var(--primary-color)' }}>SQL Editor de Supabase</a>, collez le script ci-dessous, puis cliquez sur <strong>Run</strong> :
        </p>
        <pre style={{ 
          background: 'rgba(0, 0, 0, 0.25)', 
          padding: '1rem', 
          borderRadius: 'var(--radius-md)', 
          fontSize: '0.825rem', 
          overflowX: 'auto',
          border: '1px solid var(--surface-border)',
          fontFamily: 'monospace',
          color: 'var(--text-main)',
          lineHeight: '1.4'
        }}>
{`CREATE TABLE IF NOT EXISTS public.posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  platform TEXT,
  status TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  "scheduledAt" TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read and write access for anon" ON public.posts;
CREATE POLICY "Allow public read and write access for anon" 
ON public.posts 
FOR ALL 
TO anon 
USING (true) 
WITH CHECK (true);`}
        </pre>
      </div>
    </div>
  );
}
