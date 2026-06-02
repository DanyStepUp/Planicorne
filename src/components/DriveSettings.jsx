import { useState, useEffect } from 'react';
import { 
  FolderOpen, 
  Database, 
  Settings, 
  CheckCircle2, 
  AlertTriangle, 
  Link, 
  Unlink, 
  RefreshCw 
} from 'lucide-react';
import { 
  saveHandleToDB, 
  clearHandleFromDB, 
  getOrCreateDriveFolder,
  listDriveFolders,
  createDriveFolder
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
  const [clientId, setClientId] = useState(localStorage.getItem('gdrive_client_id') || '');
  const [apiKey, setApiKey] = useState(localStorage.getItem('gdrive_api_key') || '');
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
      const redirectUri = window.location.origin + window.location.pathname;
      const scope = 'https://www.googleapis.com/auth/drive.file';
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scope)}&state=gdrive_auth`;
      
      localStorage.setItem('gdrive_pending_auth', 'true');
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
        
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');
        
        window.history.replaceState(null, null, window.location.pathname + window.location.search);
        
        try {
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

      {/* SECTION GOOGLE DRIVE AUTHENTICATION CLOUD */}
      <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <RefreshCw className="color-primary" size={24} style={{ color: 'var(--primary-color)' }} />
          <h3 style={{ margin: 0 }}>Connexion Google Drive Cloud (OAuth)</h3>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          Configurez les clés Google API de votre projet Cloud pour activer la sauvegarde automatique ou le mode Cloud direct.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>ID Client OAuth Google</label>
            <input 
              type="text" 
              placeholder="Ex: xxxxxxx.apps.googleusercontent.com"
              value={clientId} 
              onChange={(e) => setClientId(e.target.value)}
              style={{ padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-main)' }}
            />
          </div>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Clé API Google Drive</label>
            <input 
              type="password" 
              placeholder="Ex: AIzaSyDxxxxxxxxx"
              value={apiKey} 
              onChange={(e) => setApiKey(e.target.value)}
              style={{ padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-main)' }}
            />
          </div>
        </div>

        {cloudAccessToken ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', gap: '1rem', flexWrap: 'wrap' }}>
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
        ) : (
          <button className="btn-primary-admin" style={{ marginTop: 0, padding: '0.65rem 1.5rem', width: 'auto' }} onClick={handleConnectCloudDrive} disabled={loading}>
            Connecter Google Drive Cloud
          </button>
        )}
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
          <div className="backup-warning-box" style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '1rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>⚠️</span>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <strong>Google Drive n'est pas connecté.</strong> Bien que vous ayez renseigné l'ID Client et la Clé API, vous devez cliquer sur le bouton <strong>"Connecter Google Drive Cloud"</strong> ci-dessus pour lancer l'authentification OAuth et obtenir le jeton de connexion.
            </div>
          </div>
        ) : (
          <div className="backup-config-area" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
