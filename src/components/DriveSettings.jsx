import { useState, useEffect } from 'react';
import { 
  Database, 
  Settings, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw 
} from 'lucide-react';
import { 
  getOrCreateDriveFolder,
  listDriveFolders,
  createDriveFolder
} from '../utils/driveSync';
import { saveSetting } from '../utils/supabaseService';
import './DriveSettings.css';

export default function DriveSettings({ 
  cloudAccessToken,
  setCloudAccessToken,
  setCloudFolderId,
  onRefreshBoard,
  supabaseConnected,
  supabaseTableExists,
  hasLegacyCardsToMigrate,
  onMigrateCards,
  checkSupabaseDb,
  // Backup props
  autoBackupEnabled,
  setAutoBackupEnabled,
  backupFolderId,
  setBackupFolderId,
  lastBackupTime,
  lastBackupStatus,
  onTriggerBackup
}) {
  const DEFAULT_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const DEFAULT_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';

  const [clientId, setClientId] = useState(() => localStorage.getItem('gdrive_client_id') || DEFAULT_CLIENT_ID);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gdrive_api_key') || DEFAULT_CLIENT_SECRET);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [testingConnection, setTestingConnection] = useState(false);

  // Backup folders states
  const [driveFolders, setDriveFolders] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

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

  // Fetch folders from Google Drive when connected
  useEffect(() => {
    const fetchFolders = async () => {
      if (!cloudAccessToken) {
        setDriveFolders([]);
        return;
      }
      setLoadingFolders(true);
      try {
        const folders = await listDriveFolders(cloudAccessToken);
        setDriveFolders(folders);
      } catch (err) {
        console.error("Erreur lors de la récupération des dossiers Drive:", err);
      } finally {
        setLoadingFolders(false);
      }
    };
    fetchFolders();
  }, [cloudAccessToken]);

  const handleCreateBackupFolder = async () => {
    if (!cloudAccessToken) return;
    setCreatingFolder(true);
    try {
      const newFolderId = await createDriveFolder(cloudAccessToken, "Sauvegardes Supabase");
      setBackupFolderId(newFolderId);
      
      // Refresh folders
      const folders = await listDriveFolders(cloudAccessToken);
      setDriveFolders(folders);
      showFeedback('success', "Dossier 'Sauvegardes Supabase' créé et sélectionné avec succès !");
    } catch (err) {
      showFeedback('error', "Erreur lors de la création du dossier : " + err.message);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const exists = await checkSupabaseDb();
      if (exists) {
        showFeedback('success', "Connexion réussie à Supabase ! La table 'posts' est opérationnelle.");
      } else {
        showFeedback('error', "Impossible de trouver la table 'posts' sur Supabase.");
      }
    } catch (e) {
      showFeedback('error', "Échec de la connexion à Supabase : " + e.message);
    } finally {
      setTestingConnection(false);
    }
  };

  // Local sync handles are no longer used since database is locked to Supabase.

  // --- GOOGLE DRIVE OAUTH CLOUD ---
  const handleConnectCloudDrive = async () => {
    const cId = DEFAULT_CLIENT_ID;
    const cSec = DEFAULT_CLIENT_SECRET;
    
    if (!cId || !cSec) {
      showFeedback('error', "Identifiants Google Drive OAuth manquants dans le fichier .env.");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      localStorage.setItem('gdrive_client_id', cId);
      localStorage.setItem('gdrive_api_key', cSec);
      await saveSetting('gdrive_client_id', cId);
      await saveSetting('gdrive_api_key', cSec);

      const redirectUri = window.location.origin + window.location.pathname;
      const scope = 'https://www.googleapis.com/auth/drive.file';
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(cId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=gdrive_auth&access_type=offline&prompt=consent`;
      
      localStorage.setItem('gdrive_pending_auth', 'true');
      window.location.href = authUrl;
    } catch (err) {
      showFeedback('error', "Échec du lancement de la connexion Google : " + err.message);
      setLoading(false);
    }
  };

  // Traiter le retour d'OAuth (code URL) au chargement
  useEffect(() => {
    const checkQueryParams = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const isPending = localStorage.getItem('gdrive_pending_auth') === 'true';
      
      if (code && isPending) {
        localStorage.removeItem('gdrive_pending_auth');
        setLoading(true);
        
        // Retirer le code de la barre d'adresse
        window.history.replaceState(null, null, window.location.pathname);
        
        try {
          const redirectUri = window.location.origin + window.location.pathname;
          const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              code: code,
              client_id: DEFAULT_CLIENT_ID,
              client_secret: DEFAULT_CLIENT_SECRET,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code'
            })
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Échec de l'échange de code : ${response.status} - ${errText}`);
          }

          const tokenData = await response.json();
          const token = tokenData.access_token;
          const refreshToken = tokenData.refresh_token;

          const folderId = await getOrCreateDriveFolder(token);
          
          setCloudAccessToken(token);
          setCloudFolderId(folderId);
          
          localStorage.setItem('gdrive_access_token', token);
          localStorage.setItem('gdrive_token_expires_at', (Date.now() + tokenData.expires_in * 1000).toString());
          if (refreshToken) {
            localStorage.setItem('gdrive_refresh_token', refreshToken);
            await saveSetting('gdrive_refresh_token', refreshToken);
          }
          localStorage.setItem('gdrive_folder_id', folderId);
          await saveSetting('gdrive_folder_id', folderId);
          
          await saveSetting('gdrive_client_id', DEFAULT_CLIENT_ID);
          await saveSetting('gdrive_api_key', DEFAULT_CLIENT_SECRET);

          showFeedback('success', "Connecté à Google Drive Cloud ! Le dossier 'AllPosts' a été configuré.");
          onRefreshBoard();
        } catch (err) {
          showFeedback('error', "Erreur d'initialisation Google Drive : " + err.message);
        } finally {
          setLoading(false);
        }
      }
    };
    
    checkQueryParams();
  }, [clientId, apiKey, onRefreshBoard, setCloudAccessToken, setCloudFolderId]);

  const handleDisconnectCloud = () => {
    setCloudAccessToken('');
    setCloudFolderId('');
    localStorage.removeItem('gdrive_access_token');
    localStorage.removeItem('gdrive_folder_id');
    showFeedback('success', "Google Drive déconnecté.");
    onRefreshBoard();
  };

  const [testingCloudConnection, setTestingCloudConnection] = useState(false);

  const handleTestCloudConnection = async () => {
    if (!cloudAccessToken) {
      showFeedback('error', "Google Drive n'est pas connecté. Veuillez d'abord vous connecter via OAuth.");
      return;
    }
    setTestingCloudConnection(true);
    try {
      await listDriveFolders(cloudAccessToken);
      showFeedback('success', "Connexion active et validée avec succès avec Google Drive Cloud !");
    } catch (err) {
      showFeedback('error', "Échec de validation de la connexion Google Drive Cloud : " + (err.message || err));
    } finally {
      setTestingCloudConnection(false);
    }
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
              className="status-dot status-active"
              style={{ backgroundColor: '#3ecf8e', boxShadow: '0 0 8px #3ecf8e' }}
            ></span>
            <div>
              <span className="status-label">Stockage actif :</span>
              <span className="status-value">
                ⚡ Supabase PostgreSQL Cloud ("Planicorne 2")
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

      <div className="settings-options-grid" style={{ gridTemplateColumns: '1fr', maxWidth: '600px', margin: '0 auto' }}>
        {/* OPTION SUPABASE UNIQUE */}
        <div className="option-card glass-panel active" style={{ borderColor: '#3ecf8e' }}>
          <div className="option-icon-wrapper" style={{ backgroundColor: '#3ecf8e', color: 'white' }}>
            <Database size={24} />
          </div>
          <h3>Supabase PostgreSQL (Unique)</h3>
          <p className="option-desc">
            Base de données PostgreSQL cloud sécurisée. Vos posts et commentaires sont stockés en temps réel et accessibles partout en toute sécurité.
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
                className="btn-option btn-active"
                style={{ flex: 1, backgroundColor: '#3ecf8e', borderColor: '#3ecf8e', color: '#000' }}
                disabled={true}
              >
                Stockage principal actif
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
      </div>

      {/* SECTION SAUVEGARDE AUTOMATIQUE SUPABASE */}
      <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem', borderLeft: '4px solid #3ecf8e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <Database size={24} style={{ color: '#3ecf8e' }} />
          <h3 style={{ margin: 0 }}>Sauvegarde automatique Supabase vers Google Drive</h3>
        </div>
        
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          Activez une sauvegarde automatique toutes les heures de l'ensemble de votre base Supabase (posts, entreprises, clients, commentaires, collaborateurs, comptes) dans le dossier Google Drive de votre choix.
        </p>

        {!cloudAccessToken ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--surface-border)', padding: '1.5rem', borderRadius: 'var(--radius-md)', alignItems: 'center', textAlign: 'center' }}>
            <span style={{ fontSize: '2rem' }}>☁️</span>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Pour configurer et planifier les sauvegardes automatiques de la base de données Supabase, vous devez d'abord associer votre compte Google Drive.
            </div>
            <button 
              className="btn-primary-admin" 
              style={{ marginTop: '0.5rem', padding: '0.65rem 1.5rem', width: 'auto' }} 
              onClick={handleConnectCloudDrive} 
              disabled={loading}
            >
              {loading ? "Redirection..." : "Associer mon compte Google Drive"}
            </button>
          </div>
        ) : (
          <div className="backup-config-area" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* STATUT DE CONNEXION ACTIVE INTÉGRÉ */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 600 }}>✓ Session Google Drive active</span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button 
                  type="button"
                  className="btn-option" 
                  style={{ backgroundColor: 'rgba(25, 140, 204, 0.1)', color: 'var(--primary-color)', border: '1px solid var(--primary-color)', padding: '0.4rem 1rem', fontSize: '0.85rem', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }} 
                  onClick={handleTestCloudConnection}
                  disabled={testingCloudConnection}
                >
                  {testingCloudConnection ? "Test en cours..." : "Tester la connexion"}
                </button>
                <button className="btn-grant-permission" style={{ backgroundColor: '#ef4444', color: 'white', padding: '0.4rem 1rem', marginTop: 0 }} onClick={handleDisconnectCloud}>
                  Déconnecter
                </button>
              </div>
            </div>

            {/* TOGGLE */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--surface-border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Activer la sauvegarde horaire automatique</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  L'application sauvegardera la base Supabase au format JSON toutes les heures en arrière-plan tant que l'onglet reste ouvert.
                </span>
              </div>
              <label className="switch-wrapper" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={autoBackupEnabled}
                  onChange={(e) => {
                    setAutoBackupEnabled(e.target.checked);
                    showFeedback('success', e.target.checked ? "Sauvegarde automatique toutes les heures activée." : "Sauvegarde automatique désactivée.");
                  }}
                  style={{
                    width: '44px',
                    height: '22px',
                    appearance: 'none',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    border: '1px solid var(--surface-border)',
                    borderRadius: '999px',
                    position: 'relative',
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'background-color 0.3s ease'
                  }}
                  className="backup-checkbox-toggle"
                />
                <style>{`
                  .backup-checkbox-toggle:checked {
                    background-color: #3ecf8e !important;
                  }
                  .backup-checkbox-toggle::before {
                    content: '';
                    position: absolute;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    top: 2px;
                    left: 2px;
                    background-color: var(--text-main);
                    transition: transform 0.3s ease;
                  }
                  .backup-checkbox-toggle:checked::before {
                    transform: translateX(22px);
                    background-color: #000;
                  }
                `}</style>
              </label>
            </div>

            {/* SELECTION DOSSIER */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Dossier Google Drive de destination :</label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <select
                  value={backupFolderId}
                  onChange={(e) => setBackupFolderId(e.target.value)}
                  style={{ flex: 1, padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', background: 'rgba(255, 255, 255, 0.02)', color: 'var(--text-main)' }}
                  disabled={loadingFolders}
                >
                  <option value="">-- Choisir un dossier Google Drive --</option>
                  {driveFolders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-primary-admin"
                  onClick={handleCreateBackupFolder}
                  disabled={creatingFolder}
                  style={{ marginTop: 0, padding: '0 1rem', fontSize: '0.85rem', whiteSpace: 'nowrap', width: 'auto' }}
                >
                  {creatingFolder ? "Création..." : "+ Créer 'Sauvegardes Supabase'"}
                </button>
              </div>
              {loadingFolders && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Chargement des dossiers Google Drive...</span>}
            </div>

            {/* BOUTON SAUVEGARDER MAINTENANT & STATUS */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255, 255, 255, 0.02)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Statut de la dernière sauvegarde :</span>
                <span style={{ fontSize: '0.8rem', color: lastBackupStatus?.startsWith('Erreur') ? '#ef4444' : 'var(--text-muted)' }}>
                  {lastBackupTime ? (
                    <>
                      {lastBackupStatus?.startsWith('Erreur') ? '❌ ' : '✅ '} 
                      <strong>{new Date(parseInt(lastBackupTime)).toLocaleString()}</strong>
                      {lastBackupStatus && ` - ${lastBackupStatus}`}
                    </>
                  ) : (
                    "Aucune sauvegarde effectuée pour le moment."
                  )}
                </span>
              </div>
              
              <button
                type="button"
                className="btn-primary-admin"
                onClick={onTriggerBackup}
                disabled={!backupFolderId}
                style={{ marginTop: 0, flex: '0 0 auto', width: 'auto', padding: '0.6rem 1.25rem', backgroundColor: '#3ecf8e', borderColor: '#3ecf8e', color: '#000', fontWeight: 700 }}
              >
                Sauvegarder maintenant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
