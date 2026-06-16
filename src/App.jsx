import { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import PlatformSelector from './components/PlatformSelector';
import PostEditor from './components/PostEditor';
import ActionPanel from './components/ActionPanel';
import CalendarView from './components/CalendarView';
import Board from './components/Board';
import DriveSettings from './components/DriveSettings';
import CommentsSection from './components/CommentsSection';
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';
import { 
  verifyPermission, 
  readCardsFromDirectory, 
  uploadBackupToDrive,
  refreshGoogleAccessToken
} from './utils/driveSync';
import { 
  fetchPosts, 
  insertPost, 
  updatePost, 
  deletePost, 
  checkTableExists,
  migrateLegacyCards,
  fetchClients,
  fetchStepupUsers,
  insertComment,
  fetchCompanies,
  fetchAllDatabaseData,
  getSetting,
  saveSetting,
  refreshUserSession,
  changeUserPassword
} from './utils/supabaseService';
import { X, AlertCircle, FileText, Database, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import './App.css';



function App() {
  // Password change state
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  
  // URL Reset Token state
  const [urlResetToken, setUrlResetToken] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset_token');
    if (token) {
      setUrlResetToken(token);
    }
  }, []);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [changePwError, setChangePwError] = useState(null);
  const [changePwSuccess, setChangePwSuccess] = useState(null);

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    setChangePwError(null);
    setChangePwSuccess(null);

    if (newPassword.length < 6) {
      setChangePwError("Le nouveau mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setChangePwError("Les nouveaux mots de passe ne correspondent pas.");
      return;
    }

    setChangePwLoading(true);
    try {
      await changeUserPassword(currentUser.id, oldPassword, newPassword);
      setChangePwSuccess("Votre mot de passe a été modifié avec succès !");
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      // Fermer le modal après 2 secondes
      setTimeout(() => {
        setIsChangePasswordOpen(false);
        setChangePwSuccess(null);
      }, 2000);
    } catch (err) {
      console.error(err);
      if (err.message === 'invalid_current_password') {
        setChangePwError("Le mot de passe actuel saisi est incorrect.");
      } else {
        setChangePwError("Une erreur est survenue. Assurez-vous d'avoir exécuté la migration SQL.");
      }
    } finally {
      setChangePwLoading(false);
    }
  };

  const [activeTab, setActiveTab] = useState(() => {
    const cachedUser = JSON.parse(localStorage.getItem('app_user_session'));
    if (cachedUser) {
      return cachedUser.role?.trim().toLowerCase() === 'client' ? 'board' : 'calendar';
    }
    return 'calendar';
  }); // editor, board, settings, calendar
  const [selectedPlatform, setSelectedPlatform] = useState('linkedin');
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  
  // États de synchronisation (Forcé sur Supabase PostgreSQL)
  const syncMode = 'supabase';
  const setSyncMode = () => {};
  const [localDirectoryHandle, setLocalDirectoryHandle] = useState(null);
  const [localDirectoryName, setLocalDirectoryName] = useState('');
  const [cloudAccessToken, setCloudAccessToken] = useState(localStorage.getItem('gdrive_access_token') || '');
  const [cloudFolderId, setCloudFolderId] = useState(localStorage.getItem('gdrive_folder_id') || '');
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState(() => {
    const cachedUser = JSON.parse(localStorage.getItem('app_user_session'));
    const isClient = cachedUser?.role?.trim().toLowerCase() === 'client';
    if (isClient && cachedUser?.company_id) {
      return cachedUser.company_id;
    }
    return 'all';
  });
  
  // États de sauvegarde automatique Supabase vers Google Drive
  const [autoBackupEnabled, setAutoBackupEnabledState] = useState(() => localStorage.getItem('auto_backup_enabled') === 'true');
  const [backupFolderId, setBackupFolderIdState] = useState(() => localStorage.getItem('auto_backup_folder_id') || '');
  const [lastBackupTime, setLastBackupTime] = useState(() => localStorage.getItem('last_supabase_backup_time') || '');
  const [lastBackupStatus, setLastBackupStatus] = useState(() => localStorage.getItem('last_supabase_backup_status') || '');

  const setAutoBackupEnabled = async (val) => {
    setAutoBackupEnabledState(val);
    localStorage.setItem('auto_backup_enabled', val ? 'true' : 'false');
    try {
      await saveSetting('auto_backup_enabled', val ? 'true' : 'false');
    } catch (e) {
      console.error("Failed to save backup config:", e);
    }
  };

  const setBackupFolderId = async (val) => {
    setBackupFolderIdState(val);
    localStorage.setItem('auto_backup_folder_id', val);
    try {
      await saveSetting('auto_backup_folder_id', val);
    } catch (e) {
      console.error("Failed to save backup folder ID:", e);
    }
  };
  
  // Session Utilisateur
  const [currentUser, setCurrentUser] = useState(JSON.parse(localStorage.getItem('app_user_session')) || null);

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      alert("Pour installer l'application :\n\n• Sur Chrome / Edge / Firefox (PC ou Android) : Cliquez sur l'icône d'installation dans la barre d'adresse ou ouvrez le menu et sélectionnez 'Installer'.\n\n• Sur Safari (iOS - iPhone/iPad) : Cliquez sur le bouton 'Partager' (flèche vers le haut) et sélectionnez 'Sur l'écran d'accueil'.");
    }
  };

  // États Supabase
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [supabaseTableExists, setSupabaseTableExists] = useState(true);
  const [hasLegacyCardsToMigrate, setHasLegacyCardsToMigrate] = useState(() => {
    const localStored = localStorage.getItem('trello_cards');
    if (localStored) {
      try {
        const parsed = JSON.parse(localStored);
        return parsed && parsed.length > 0;
      } catch (e) {
        console.error("Erreur de parsing trello_cards:", e);
      }
    }
    return false;
  });
  const [clients, setClients] = useState([]);
  const [stepupUsers, setStepupUsers] = useState([]);
  const [companies, setCompanies] = useState([]);

  // Tableau de posts
  const [cards, setCards] = useState([]);
  
  // Pièces jointes du post en cours
  const [attachments, setAttachments] = useState([]);
  
  // Édition bidirectionnelle (Sans pop-up)
  const [editingCardId, setEditingCardId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingCompanyId, setEditingCompanyId] = useState('');
  const [editingStatus, setEditingStatus] = useState('draft');
  const [localPermissionNeeded, setLocalPermissionNeeded] = useState(false);

  // Appliquer le thème
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    localStorage.setItem('app_user_session', JSON.stringify(user));
    if (user.role?.trim().toLowerCase() === 'client') {
      setActiveTab('board');
    } else {
      setActiveTab('calendar');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('app_user_session');
    
    // Sécurisation de session Google Drive (éviter la fuite de jetons et de données cloud)
    localStorage.removeItem('gdrive_access_token');
    localStorage.removeItem('gdrive_folder_id');
    localStorage.removeItem('gdrive_cards_cache'); // Effacer le cache des posts du cloud
    setCloudAccessToken('');
    setCloudFolderId('');
    
    setEditingCardId(null);
    setEditingTitle('');
    setContent('');
    setAttachments([]);
    setScheduledAt('');
    setEditingCompanyId('');
    setEditingStatus('draft');
  };


  // Vérifier la connexion Supabase
  const checkSupabaseDb = useCallback(async () => {
    const exists = await checkTableExists();
    setSupabaseTableExists(exists);
    setSupabaseConnected(exists);
    return exists;
  }, []);



  // Charger les profils (Clients, Step Up Users & Entreprises)
  const loadProfiles = useCallback(async () => {
    if (syncMode === 'supabase' && supabaseConnected) {
      try {
        const cls = await fetchClients();
        const users = await fetchStepupUsers();
        const comps = await fetchCompanies();
        setClients(cls);
        
        // Filtrer les super_managers si l'utilisateur est un manager (rôle invisible pour le manager)
        const filteredUsers = currentUser?.role?.trim().toLowerCase() === 'manager'
          ? users.filter(u => u.user_role !== 'super_manager')
          : users;

        setStepupUsers(filteredUsers);
        setCompanies(comps);
      } catch (e) {
        console.error("Erreur de chargement des profils relationnels:", e);
      }
    }
  }, [syncMode, supabaseConnected, currentUser]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadProfiles();
    }, 0);
    return () => clearTimeout(t);
  }, [loadProfiles]);

  // Rafraîchir la session de l'utilisateur connecté sur Supabase en cas de changement (ex: attribution d'une entreprise)
  useEffect(() => {
    const checkUserSessionFreshness = async () => {
      if (currentUser && supabaseConnected) {
        try {
          const freshUser = await refreshUserSession(currentUser.id);
          if (freshUser) {
            if (JSON.stringify(freshUser) !== JSON.stringify(currentUser)) {
              console.log("Mise à jour de la session utilisateur locale détectée.");
              setCurrentUser(freshUser);
              localStorage.setItem('app_user_session', JSON.stringify(freshUser));
            }
          }
        } catch (err) {
          console.error("Erreur lors du rafraîchissement de la session utilisateur:", err);
        }
      }
    };
    checkUserSessionFreshness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseConnected]);

  // Charger la configuration Google Drive depuis la table app_settings
  useEffect(() => {
    const loadGDriveSettings = async () => {
      if (supabaseConnected) {
        try {
          const dbClientId = await getSetting('gdrive_client_id');
          const dbApiKey = await getSetting('gdrive_api_key');
          const dbFolderId = await getSetting('gdrive_folder_id');
          const dbBackupFolderId = await getSetting('auto_backup_folder_id');
          const dbAutoBackupEnabled = await getSetting('auto_backup_enabled');
          const dbRefreshToken = await getSetting('gdrive_refresh_token');

          if (dbClientId) localStorage.setItem('gdrive_client_id', dbClientId);
          if (dbApiKey) localStorage.setItem('gdrive_api_key', dbApiKey);
          if (dbFolderId) {
            localStorage.setItem('gdrive_folder_id', dbFolderId);
            setCloudFolderId(dbFolderId);
          }
          if (dbBackupFolderId) {
            localStorage.setItem('auto_backup_folder_id', dbBackupFolderId);
            setBackupFolderId(dbBackupFolderId);
          }
          if (dbAutoBackupEnabled) {
            const isEnabled = dbAutoBackupEnabled === 'true';
            localStorage.setItem('auto_backup_enabled', dbAutoBackupEnabled);
            setAutoBackupEnabledState(isEnabled);
          }

          if (dbRefreshToken) {
            localStorage.setItem('gdrive_refresh_token', dbRefreshToken);
            const cId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
            const cSec = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';

            try {
              const res = await refreshGoogleAccessToken(cId, cSec, dbRefreshToken);
              localStorage.setItem('gdrive_access_token', res.accessToken);
              localStorage.setItem('gdrive_token_expires_at', (Date.now() + res.expiresIn * 1000).toString());
              setCloudAccessToken(res.accessToken);
            } catch (err) {
              console.error("Erreur de rafraîchissement initial Google Drive:", err);
            }
          }
        } catch (e) {
          console.error("Erreur de chargement des paramètres Google Drive:", e);
        }
      }
    };

    loadGDriveSettings();
  }, [supabaseConnected]);

  // Rafraîchissement automatique périodique du jeton Google Drive
  useEffect(() => {
    const handleAutoRefresh = async () => {
      const refreshToken = localStorage.getItem('gdrive_refresh_token');
      if (!refreshToken) return;

      const expiresAt = localStorage.getItem('gdrive_token_expires_at');
      const isExpired = !expiresAt || Date.now() > parseInt(expiresAt) - 60000;

      if (isExpired) {
        const cId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
        const cSec = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';

        try {
          const res = await refreshGoogleAccessToken(cId, cSec, refreshToken);
          localStorage.setItem('gdrive_access_token', res.accessToken);
          localStorage.setItem('gdrive_token_expires_at', (Date.now() + res.expiresIn * 1000).toString());
          setCloudAccessToken(res.accessToken);
          console.log("Jeton d'accès Google Drive rafraîchi avec succès.");
        } catch (err) {
          console.error("Erreur lors du rafraîchissement du jeton Google Drive:", err);
        }
      }
    };

    const interval = setInterval(handleAutoRefresh, 30000);
    return () => clearInterval(interval);
  }, []);

  // Générateur de dump SQL compatible PostgreSQL
  const generateSqlDump = (data) => {
    let sql = `-- Planicorne 2 Database Backup\n`;
    sql += `-- Generated at ${new Date().toISOString()}\n\n`;
    
    // Disable foreign key checks for clean restoration
    sql += `SET session_replication_role = 'replica';\n\n`;

    // 1. Companies
    sql += `-- Table public.companies\n`;
    sql += `CREATE TABLE IF NOT EXISTS public.companies (\n`;
    sql += `  id text PRIMARY KEY,\n`;
    sql += `  name text NOT NULL,\n`;
    sql += `  logo_drive_id text,\n`;
    sql += `  contract_linkedin integer DEFAULT 0,\n`;
    sql += `  contract_facebook integer DEFAULT 0,\n`;
    sql += `  contract_instagram integer DEFAULT 0,\n`;
    sql += `  contract_google integer DEFAULT 0,\n`;
    sql += `  contract_blog integer DEFAULT 0,\n`;
    sql += `  contract_newsletter integer DEFAULT 0,\n`;
    sql += `  contract_details jsonb\n`;
    sql += `);\n\n`;

    if (data.companies && data.companies.length > 0) {
      data.companies.forEach(row => {
        const name = row.name ? `'${row.name.replace(/'/g, "''")}'` : 'NULL';
        const logo = row.logo_drive_id ? `'${row.logo_drive_id.replace(/'/g, "''")}'` : 'NULL';
        const details = row.contract_details ? `'${JSON.stringify(row.contract_details).replace(/'/g, "''")}'::jsonb` : 'NULL';
        sql += `INSERT INTO public.companies (id, name, logo_drive_id, contract_linkedin, contract_facebook, contract_instagram, contract_google, contract_blog, contract_newsletter, contract_details) `;
        sql += `VALUES ('${row.id}', ${name}, ${logo}, ${row.contract_linkedin || 0}, ${row.contract_facebook || 0}, ${row.contract_instagram || 0}, ${row.contract_google || 0}, ${row.contract_blog || 0}, ${row.contract_newsletter || 0}, ${details}) `;
        sql += `ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, logo_drive_id = EXCLUDED.logo_drive_id, contract_linkedin = EXCLUDED.contract_linkedin, contract_facebook = EXCLUDED.contract_facebook, contract_instagram = EXCLUDED.contract_instagram, contract_google = EXCLUDED.contract_google, contract_blog = EXCLUDED.contract_blog, contract_newsletter = EXCLUDED.contract_newsletter, contract_details = EXCLUDED.contract_details;\n`;
      });
      sql += `\n`;
    }

    // 2. Clients
    sql += `-- Table public.clients\n`;
    sql += `CREATE TABLE IF NOT EXISTS public.clients (\n`;
    sql += `  id text PRIMARY KEY,\n`;
    sql += `  name text NOT NULL,\n`;
    sql += `  email text UNIQUE NOT NULL,\n`;
    sql += `  company_id text REFERENCES public.companies(id) ON DELETE SET NULL\n`;
    sql += `);\n\n`;

    if (data.clients && data.clients.length > 0) {
      data.clients.forEach(row => {
        const name = row.name ? `'${row.name.replace(/'/g, "''")}'` : 'NULL';
        const email = row.email ? `'${row.email.replace(/'/g, "''")}'` : 'NULL';
        const compId = row.company_id ? `'${row.company_id}'` : 'NULL';
        sql += `INSERT INTO public.clients (id, name, email, company_id) VALUES ('${row.id}', ${name}, ${email}, ${compId}) `;
        sql += `ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, company_id = EXCLUDED.company_id;\n`;
      });
      sql += `\n`;
    }

    // 3. Stepup Users
    sql += `-- Table public.stepup_users\n`;
    sql += `CREATE TABLE IF NOT EXISTS public.stepup_users (\n`;
    sql += `  id text PRIMARY KEY,\n`;
    sql += `  name text NOT NULL,\n`;
    sql += `  email text UNIQUE NOT NULL,\n`;
    sql += `  role text\n`;
    sql += `);\n\n`;

    if (data.stepup_users && data.stepup_users.length > 0) {
      data.stepup_users.forEach(row => {
        const name = row.name ? `'${row.name.replace(/'/g, "''")}'` : 'NULL';
        const email = row.email ? `'${row.email.replace(/'/g, "''")}'` : 'NULL';
        const role = row.role ? `'${row.role.replace(/'/g, "''")}'` : 'NULL';
        sql += `INSERT INTO public.stepup_users (id, name, email, role) VALUES ('${row.id}', ${name}, ${email}, ${role}) `;
        sql += `ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role;\n`;
      });
      sql += `\n`;
    }

    // 4. App Users
    sql += `-- Table public.app_users\n`;
    sql += `CREATE TABLE IF NOT EXISTS public.app_users (\n`;
    sql += `  id text PRIMARY KEY,\n`;
    sql += `  email text UNIQUE NOT NULL,\n`;
    sql += `  password text NOT NULL,\n`;
    sql += `  name text NOT NULL,\n`;
    sql += `  role text NOT NULL,\n`;
    sql += `  client_id text REFERENCES public.clients(id) ON DELETE SET NULL,\n`;
    sql += `  stepup_user_id text REFERENCES public.stepup_users(id) ON DELETE SET NULL\n`;
    sql += `);\n\n`;

    if (data.app_users && data.app_users.length > 0) {
      data.app_users.forEach(row => {
        const name = row.name ? `'${row.name.replace(/'/g, "''")}'` : 'NULL';
        const email = row.email ? `'${row.email.replace(/'/g, "''")}'` : 'NULL';
        const password = row.password ? `'${row.password.replace(/'/g, "''")}'` : 'NULL';
        const role = row.role ? `'${row.role.replace(/'/g, "''")}'` : 'NULL';
        const clientId = row.client_id ? `'${row.client_id}'` : 'NULL';
        const stepupUserId = row.stepup_user_id ? `'${row.stepup_user_id}'` : 'NULL';
        sql += `INSERT INTO public.app_users (id, email, password, name, role, client_id, stepup_user_id) `;
        sql += `VALUES ('${row.id}', ${email}, ${password}, ${name}, ${role}, ${clientId}, ${stepupUserId}) `;
        sql += `ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password = EXCLUDED.password, name = EXCLUDED.name, role = EXCLUDED.role, client_id = EXCLUDED.client_id, stepup_user_id = EXCLUDED.stepup_user_id;\n`;
      });
      sql += `\n`;
    }

    // 5. Posts
    sql += `-- Table public.posts\n`;
    sql += `CREATE TABLE IF NOT EXISTS public.posts (\n`;
    sql += `  id text PRIMARY KEY,\n`;
    sql += `  title text NOT NULL,\n`;
    sql += `  content text,\n`;
    sql += `  platform text NOT NULL,\n`;
    sql += `  status text NOT NULL,\n`;
    sql += `  attachments jsonb DEFAULT '[]'::jsonb,\n`;
    sql += `  "createdAt" timestamp with time zone DEFAULT now(),\n`;
    sql += `  "updatedAt" timestamp with time zone DEFAULT now(),\n`;
    sql += `  "scheduledAt" timestamp with time zone,\n`;
    sql += `  company_id text REFERENCES public.companies(id) ON DELETE SET NULL,\n`;
    sql += `  client_id text REFERENCES public.clients(id) ON DELETE SET NULL\n`;
    sql += `);\n\n`;

    if (data.posts && data.posts.length > 0) {
      data.posts.forEach(row => {
        const title = row.title ? `'${row.title.replace(/'/g, "''")}'` : 'NULL';
        const content = row.content ? `'${row.content.replace(/'/g, "''")}'` : 'NULL';
        const attachments = row.attachments ? `'${JSON.stringify(row.attachments).replace(/'/g, "''")}'::jsonb` : `'[]'::jsonb`;
        const created = row.createdAt ? `'${row.createdAt}'` : 'now()';
        const updated = row.updatedAt ? `'${row.updatedAt}'` : 'now()';
        const scheduled = row.scheduledAt ? `'${row.scheduledAt}'` : 'NULL';
        const compId = row.company_id ? `'${row.company_id}'` : 'NULL';
        const clientId = row.client_id ? `'${row.client_id}'` : 'NULL';
        sql += `INSERT INTO public.posts (id, title, content, platform, status, attachments, "createdAt", "updatedAt", "scheduledAt", company_id, client_id) `;
        sql += `VALUES ('${row.id}', ${title}, ${content}, '${row.platform}', '${row.status}', ${attachments}, ${created}, ${updated}, ${scheduled}, ${compId}, ${clientId}) `;
        sql += `ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, platform = EXCLUDED.platform, status = EXCLUDED.status, attachments = EXCLUDED.attachments, "createdAt" = EXCLUDED."createdAt", "updatedAt" = EXCLUDED."updatedAt", "scheduledAt" = EXCLUDED."scheduledAt", company_id = EXCLUDED.company_id, client_id = EXCLUDED.client_id;\n`;
      });
      sql += `\n`;
    }

    // 6. Comments
    sql += `-- Table public.comments\n`;
    sql += `CREATE TABLE IF NOT EXISTS public.comments (\n`;
    sql += `  id text PRIMARY KEY,\n`;
    sql += `  post_id text REFERENCES public.posts(id) ON DELETE CASCADE,\n`;
    sql += `  content text NOT NULL,\n`;
    sql += `  "createdAt" timestamp with time zone DEFAULT now(),\n`;
    sql += `  client_author_id text REFERENCES public.clients(id) ON DELETE SET NULL,\n`;
    sql += `  stepup_author_id text REFERENCES public.stepup_users(id) ON DELETE SET NULL\n`;
    sql += `);\n\n`;

    if (data.comments && data.comments.length > 0) {
      data.comments.forEach(row => {
        const content = row.content ? `'${row.content.replace(/'/g, "''")}'` : 'NULL';
        const created = row.createdAt ? `'${row.createdAt}'` : 'now()';
        const clientAuthId = row.client_author_id ? `'${row.client_author_id}'` : 'NULL';
        const stepupAuthId = row.stepup_author_id ? `'${row.stepup_author_id}'` : 'NULL';
        sql += `INSERT INTO public.comments (id, post_id, content, "createdAt", client_author_id, stepup_author_id) `;
        sql += `VALUES ('${row.id}', '${row.post_id}', ${content}, ${created}, ${clientAuthId}, ${stepupAuthId}) `;
        sql += `ON CONFLICT (id) DO UPDATE SET post_id = EXCLUDED.post_id, content = EXCLUDED.content, "createdAt" = EXCLUDED."createdAt", client_author_id = EXCLUDED.client_author_id, stepup_author_id = EXCLUDED.stepup_author_id;\n`;
      });
      sql += `\n`;
    }

    // Restore foreign key checks
    sql += `SET session_replication_role = 'origin';\n`;

    return sql;
  };

  // Fonction pour déclencher une sauvegarde manuelle ou planifiée
  const triggerSupabaseBackup = useCallback(async () => {
    if (!cloudAccessToken || !backupFolderId) {
      console.warn("Impossible de sauvegarder : Token ou Dossier Google Drive manquant.");
      return;
    }

    try {
      setLastBackupStatus("Sauvegarde en cours...");
      localStorage.setItem('last_supabase_backup_status', "Sauvegarde en cours...");

      // 1. Récupération des données Supabase
      const data = await fetchAllDatabaseData();

      // 2. Génération du dump SQL et nom du fichier
      const sqlDump = generateSqlDump(data);
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
      const fileName = `supabase_backup_${dateStr}_${timeStr}.sql`;

      // 3. Téléversement vers Drive
      await uploadBackupToDrive(cloudAccessToken, backupFolderId, sqlDump, fileName);

      // 4. Succès
      const successTime = Date.now().toString();
      setLastBackupTime(successTime);
      setLastBackupStatus("Sauvegarde réussie.");
      localStorage.setItem('last_supabase_backup_time', successTime);
      localStorage.setItem('last_supabase_backup_status', "Sauvegarde réussie.");
    } catch (err) {
      console.error("Échec de la sauvegarde automatique Supabase :", err);
      const failTime = Date.now().toString();
      setLastBackupTime(failTime);
      setLastBackupStatus(`Erreur : ${err.message || err}`);
      localStorage.setItem('last_supabase_backup_time', failTime);
      localStorage.setItem('last_supabase_backup_status', `Erreur : ${err.message || err}`);
    }
  }, [cloudAccessToken, backupFolderId]);

  // Effect de tâche de fond pour lancer la sauvegarde horaire automatique
  useEffect(() => {
    if (!autoBackupEnabled || !cloudAccessToken || !backupFolderId || syncMode !== 'supabase' || !supabaseConnected) {
      return;
    }

    const checkAndRunBackup = async () => {
      const lastTime = localStorage.getItem('last_supabase_backup_time');
      const shouldBackup = !lastTime || (Date.now() - parseInt(lastTime)) >= 3600000; // 1 heure (3600000 ms)

      if (shouldBackup) {
        console.log("Déclenchement automatique de la sauvegarde horaire Supabase...");
        await triggerSupabaseBackup();
      }
    };

    checkAndRunBackup();

    const interval = setInterval(checkAndRunBackup, 60000); // Vérification chaque minute
    return () => clearInterval(interval);
  }, [autoBackupEnabled, cloudAccessToken, backupFolderId, syncMode, supabaseConnected, triggerSupabaseBackup]);

  // Effectuer la migration de LocalStorage vers Supabase
  const handleMigrateCards = async () => {
    try {
      const localStored = localStorage.getItem('trello_cards');
      if (!localStored) return;
      const cardsToMigrate = JSON.parse(localStored);
      
      const count = await migrateLegacyCards(cardsToMigrate);
      alert(`${count} posts ont été migrés avec succès vers Supabase !`);
      setHasLegacyCardsToMigrate(false);
      localStorage.removeItem('trello_cards');
      loadCards();
    } catch (error) {
      console.error("Erreur de migration:", error);
      alert("Erreur lors de la migration. Assurez-vous que la table 'posts' a été créée.");
    }
  };

  // --- CHARGEMENT ET SYNCHRONISATION DES CARTES ---
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const loadCards = useCallback(async () => {
    try {
      const tableExists = await checkSupabaseDb();
      if (tableExists) {
        let dbCards = await fetchPosts(currentUser);
        if (currentUser?.role?.trim().toLowerCase() === 'client') {
          dbCards = dbCards.filter(card => 
            (currentUser.company_id && card.company_id === currentUser.company_id) ||
            (currentUser.client_id && card.client_id === currentUser.client_id)
          );
        }
        setCards(dbCards);
      } else {
        setCards([]);
      }
      setLocalPermissionNeeded(false);
    } catch (error) {
      console.error("Erreur lors du chargement des cartes de posts:", error);
    }
  }, [checkSupabaseDb, currentUser]);

  // Déclencher le rechargement quand le mode change
  useEffect(() => {
    loadCards();
  }, [loadCards]);

  // --- ACTIONS SUR LES POSTS ---
  
  // Demander l'accès au dossier local s'il a été révoqué par le navigateur
  const handleGrantFolderPermission = async () => {
    if (localDirectoryHandle) {
      const hasPermission = await verifyPermission(localDirectoryHandle, true);
      if (hasPermission) {
        setLocalPermissionNeeded(false);
        const localCards = await readCardsFromDirectory(localDirectoryHandle);
        setCards(localCards);
      }
    }
  };

  // Assistant de diagnostic d'erreur de base de données (ex: colonne manquante)
  const handleDbError = (error, contextMsg) => {
    console.error(contextMsg, error);
    const errorStr = (error && error.message) ? error.message.toLowerCase() : '';
    const isMissingColumn = errorStr.includes('scheduledat') || errorStr.includes('column') || (error && error.code === '42703');
    if (isMissingColumn) {
      alert("La colonne 'scheduledAt' est manquante dans votre table Supabase 'posts'.\n\nPour corriger ce problème, ouvrez le SQL Editor dans votre console Supabase, collez le script suivant et cliquez sur RUN :\n\nALTER TABLE public.posts ADD COLUMN IF NOT EXISTS \"scheduledAt\" TIMESTAMP WITH TIME ZONE;");
    } else {
      alert(`${contextMsg} Assurez-vous que la table 'posts' existe et est accessible.`);
    }
  };

  // Enregistrer ou mettre à jour un post
  const handleSaveCard = async ({ title, column, scheduledAt: modalScheduledAt, company_id }) => {
    // Utiliser la date du modal si fournie, sinon celle configurée en direct dans l'éditeur
    const finalScheduledAt = modalScheduledAt !== undefined ? modalScheduledAt : (scheduledAt || null);

    const cardData = {
      title,
      content,
      platform: selectedPlatform,
      status: column,
      attachments,
      scheduledAt: finalScheduledAt,
      company_id: company_id || null,
      updatedAt: new Date().toISOString()
    };

    let updatedCards = [...cards];

    try {
      if (editingCardId) {
        // Cas : Modification d'une carte existante
        const index = cards.findIndex(c => c.id === editingCardId);
        if (index !== -1) {
          const originalCard = cards[index];
          const updatedCard = {
            ...originalCard,
            ...cardData,
            id: editingCardId // Conserver le même ID
          };
          updatedCards[index] = updatedCard;
          
          // Persister la modification
          await updatePost(editingCardId, cardData);
        }
      } else {
        // Cas : Création d'une nouvelle carte
        const newCard = {
          ...cardData,
          id: Date.now().toString(),
          createdAt: new Date().toISOString()
        };
        updatedCards.unshift(newCard); // Ajouter en haut de la liste
        
        // Persister la création
        await insertPost(newCard);
      }
    } catch (dbError) {
      handleDbError(dbError, "Erreur lors de la sauvegarde Supabase :");
      return; // Arrêter l'exécution
    }

    setCards(updatedCards);
    
    // Notification de succès visuelle simple
    alert("Post enregistré avec succès dans votre Tableau Trello !");
    
    // Rediriger l'utilisateur vers le tableau
    setActiveTab('board');

    // Nettoyer la session d'édition seulement APRÈS redirection
    setTimeout(() => {
      setEditingCardId(null);
      setEditingTitle('');
      setContent('');
      setAttachments([]);
      setScheduledAt('');
      setEditingCompanyId('');
      setEditingStatus('draft');
    }, 100);
  };

  const handleDirectSave = async () => {
    if (!editingTitle.trim()) {
      alert("Veuillez saisir un titre pour la publication.");
      return;
    }
    if (!editingCompanyId) {
      alert("Veuillez choisir une entreprise pour cette publication.");
      return;
    }

    await handleSaveCard({
      title: editingTitle.trim(),
      column: editingStatus,
      scheduledAt: scheduledAt || null,
      company_id: editingCompanyId
    });
  };

  // Validation par le client (colonne "À valider" -> "Prêt à publier")
  const handleClientValidate = async () => {
    if (!editingCardId) return;
    const confirmVal = window.confirm("Voulez-vous valider ce post et le déplacer dans 'Prêt à publier' ?");
    if (!confirmVal) return;

    try {
      const updatedCardData = { status: 'ready' };
      if (syncMode === 'supabase') {
        await updatePost(editingCardId, updatedCardData);
        if (currentUser?.client_id) {
          await insertComment(editingCardId, currentUser.client_id, 'client', 'Post validé');
        }
      }

      const updatedCards = cards.map(c => {
        if (c.id === editingCardId) {
          return { ...c, status: 'ready', updatedAt: new Date().toISOString() };
        }
        return c;
      });
      setCards(updatedCards);
      
      alert("Post validé avec succès !");
      
      setEditingCardId(null);
      setContent('');
      setAttachments([]);
      setActiveTab('board');
    } catch (e) {
      console.error("Erreur lors de la validation client:", e);
      alert("Erreur lors de la validation du post.");
    }
  };

  // Refus par le client (fait passer le post en statut 'draft' et retourne au tableau)
  const handleClientRefuse = async () => {
    if (!editingCardId) return;
    const confirmRefuse = window.confirm("Voulez-vous refuser ce post et le renvoyer dans 'Idées / Brouillons' ?");
    if (!confirmRefuse) return;

    const commentText = window.prompt("Veuillez indiquer les modifications demandées (optionnel) :");
    if (commentText === null) return; // Annulé

    try {
      const updatedCardData = { status: 'draft' };
      if (syncMode === 'supabase') {
        await updatePost(editingCardId, updatedCardData);
        // Insérer un commentaire de refus
        const fullComment = commentText.trim() 
          ? `Modifications demandées : ${commentText.trim()}` 
          : 'Modifications demandées';
        
        // Trouver l'ID de l'auteur client
        const authorId = currentUser?.client_id || currentUser?.id;
        if (authorId) {
          await insertComment(editingCardId, authorId, 'client', fullComment);
        }
      }

      const updatedCards = cards.map(c => {
        if (c.id === editingCardId) {
          return { ...c, status: 'draft', updatedAt: new Date().toISOString() };
        }
        return c;
      });
      setCards(updatedCards);
      
      alert("Le post a été renvoyé dans 'Idées / Brouillons'.");
      
      setEditingCardId(null);
      setContent('');
      setAttachments([]);
      setActiveTab('board');
    } catch (e) {
      console.error("Erreur lors du refus client:", e);
      alert("Erreur lors du refus du post.");
    }
  };

  // Glisser-déposer (Déplacer) une carte
  const handleMoveCard = async (cardId, newColumnId) => {
    const cardIndex = cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;

    const updatedCard = {
      ...cards[cardIndex],
      status: newColumnId,
      updatedAt: new Date().toISOString()
    };

    const updatedCards = [...cards];
    updatedCards[cardIndex] = updatedCard;
    setCards(updatedCards);

    // Persister le déplacement
    try {
      await updatePost(cardId, { status: newColumnId });
    } catch (dbError) {
      console.error("Erreur lors du déplacement dans Supabase:", dbError);
      alert("Erreur lors de la mise à jour sur Supabase.");
    }
  };

  // Supprimer une carte
  const handleDeleteCard = async (cardId) => {
    const updatedCards = cards.filter(c => c.id !== cardId);
    setCards(updatedCards);

    // Persister la suppression
    try {
      await deletePost(cardId);
    } catch (dbError) {
      console.error("Erreur lors de la suppression dans Supabase:", dbError);
      alert("Erreur lors de la suppression sur Supabase.");
    }

    // Si on supprimait la carte actuellement ouverte dans l'éditeur, effacer le lien
    if (editingCardId === cardId) {
      setEditingCardId(null);
    }
  };

  // Préparer la création d'un nouveau post dans l'éditeur (sans pop-up)
  const handleAddCard = (prefilledData = {}) => {
    setEditingCardId(null);
    setEditingTitle('');
    setContent('');
    setSelectedPlatform(prefilledData.platform || 'linkedin');
    setAttachments([]);
    setScheduledAt(prefilledData.scheduledAt || '');
    setEditingCompanyId(prefilledData.company_id || (companies.length > 0 ? companies[0].id : ''));
    setEditingStatus(prefilledData.status || 'draft');
    setActiveTab('editor');
  };

  // Charger une carte dans l'éditeur (bidirectionnalité)
  const handleEditCard = (card) => {
    setContent(card.content || '');
    setSelectedPlatform(card.platform || 'linkedin');
    setAttachments(card.attachments || []);
    setScheduledAt(card.scheduledAt || '');
    setEditingCardId(card.id);
    setEditingTitle(card.title || '');
    setEditingCompanyId(card.company_id || '');
    setEditingStatus(card.status || 'draft');
    setActiveTab('editor');
  };

  // Mettre à jour la date de publication d'une carte existante (depuis le Kanban)
  const handleUpdateCardDate = async (cardId, newDateStr) => {
    const finalDate = newDateStr ? new Date(newDateStr).toISOString() : null;
    const updatedCards = cards.map(c => {
      if (c.id === cardId) {
        return {
          ...c,
          scheduledAt: finalDate,
          updatedAt: new Date().toISOString()
        };
      }
      return c;
    });
    setCards(updatedCards);

    try {
      await updatePost(cardId, { scheduledAt: finalDate });
    } catch (dbError) {
      handleDbError(dbError, "Erreur lors de la mise à jour de la date de publication :");
    }
  };



  // Trouver les infos de la carte en cours de modification
  const activeEditingCard = cards.find(c => c.id === editingCardId);

  return (
    <div className="app-container">
      <Header 
        theme={theme} 
        toggleTheme={toggleTheme} 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        supabaseConnected={supabaseConnected}
        supabaseTableExists={supabaseTableExists}
        currentUser={currentUser}
        onLogout={handleLogout}
        onInstallApp={handleInstallApp}
        onChangePasswordClick={() => {
          setIsChangePasswordOpen(true);
          setChangePwError(null);
          setChangePwSuccess(null);
          setOldPassword('');
          setNewPassword('');
          setConfirmNewPassword('');
        }}
      />
      
      <main className="main-content">
        {!currentUser ? (
          <Login 
            onLoginSuccess={handleLoginSuccess} 
            resetToken={urlResetToken}
            onClearResetToken={() => {
              setUrlResetToken(null);
              // Clean the URL query params
              const url = new URL(window.location.href);
              url.searchParams.delete('reset_token');
              window.history.replaceState({}, '', url.pathname + url.search + url.hash);
            }}
          />
        ) : (
          <>
        {/* BANNIÈRE DE PERMISSION POUR LE DOSSIER LOCAL */}
        {localPermissionNeeded && (
          <div className="permission-banner glass-panel animate-fade-in">
            <div className="permission-banner-text">
              <AlertCircle className="warning-icon" size={20} />
              <span>Le navigateur a besoin de votre autorisation pour accéder au dossier Google Drive local synchronisé.</span>
            </div>
            <button className="btn-grant-permission" onClick={handleGrantFolderPermission}>
              Autoriser l'accès
            </button>
          </div>
        )}

        {/* BANNIÈRES SUPABASE */}
        {['admin', 'super_manager'].includes(currentUser?.role?.trim().toLowerCase()) && syncMode === 'supabase' && hasLegacyCardsToMigrate && supabaseTableExists && (
          <div className="permission-banner glass-panel animate-fade-in" style={{ borderColor: 'rgba(25, 140, 204, 0.4)', background: 'rgba(25, 140, 204, 0.05)', marginTop: '1rem' }}>
            <div className="permission-banner-text">
              <Database className="color-primary" style={{ color: 'var(--primary-color)' }} size={20} />
              <span>Vous avez des posts stockés localement dans votre navigateur. Souhaitez-vous les importer dans votre base Supabase ?</span>
            </div>
            <button className="btn-grant-permission" style={{ backgroundColor: 'var(--primary-color)', color: 'white' }} onClick={handleMigrateCards}>
              Migrer vers Supabase
            </button>
          </div>
        )}

        {['admin', 'super_manager'].includes(currentUser?.role?.trim().toLowerCase()) && syncMode === 'supabase' && !supabaseTableExists && (
          <div className="permission-banner glass-panel animate-fade-in" style={{ borderColor: 'rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.05)', marginTop: '1rem' }}>
            <div className="permission-banner-text">
              <AlertCircle className="warning-icon" style={{ color: '#f59e0b' }} size={20} />
              <span>La table <strong>posts</strong> n'existe pas encore sur Supabase. Veuillez configurer ou vérifier votre base de données Supabase.</span>
            </div>
            <button className="btn-grant-permission" style={{ backgroundColor: '#f59e0b', color: 'white' }} onClick={() => setActiveTab('settings')}>
              Aller aux paramètres
            </button>
          </div>
        )}

        {/* RENDU CONDITIONNEL DES ONGLETS */}
        
        {/* ONGLET 1 : RÉDACTEUR */}
        {activeTab === 'editor' && (
          <div className="tab-editor-layout animate-fade-in">
            {currentUser?.role?.trim().toLowerCase() !== 'client' && (
              <PlatformSelector 
                selectedPlatform={selectedPlatform} 
                onSelectPlatform={setSelectedPlatform} 
              />
            )}
            
            {/* INDICATEUR D'ÉDITION DE CARTE ACTIVE */}
            {activeEditingCard && (
              <div className="editing-card-banner glass-panel">
                <div className="editing-info">
                  <FileText size={16} />
                  <span>
                    {currentUser?.role?.trim().toLowerCase() === 'client' 
                      ? `Revue du post : "${activeEditingCard.title}"`
                      : `Modification en cours de : "${activeEditingCard.title}" (enregistrée dans Trello)`
                    }
                  </span>
                </div>
                {currentUser?.role?.trim().toLowerCase() !== 'client' && (
                  <button 
                    className="btn-cancel-edit-link" 
                    onClick={() => setEditingCardId(null)}
                    title="Créer un nouveau post à la place"
                  >
                    <X size={14} /> Annuler le lien
                  </button>
                )}
              </div>
            )}
            
            <div className={`workspace ${syncMode === 'supabase' && editingCardId ? 'has-comments' : ''}`}>
              <PostEditor 
                title={editingTitle}
                onChangeTitle={setEditingTitle}
                companyId={editingCompanyId}
                onChangeCompanyId={setEditingCompanyId}
                status={editingStatus}
                onChangeStatus={setEditingStatus}
                companies={companies}
                content={content} 
                onChange={setContent} 
                platform={selectedPlatform} 
                attachments={attachments}
                onUpdateAttachments={setAttachments}
                readOnly={currentUser?.role?.trim().toLowerCase() === 'client'}
                scheduledAt={scheduledAt}
                onUpdateScheduledAt={setScheduledAt}
              />

              {/* Section discussion et commentaires pour les cartes existantes */}
              {syncMode === 'supabase' && editingCardId && (
                <CommentsSection 
                  postId={editingCardId} 
                  clients={clients} 
                  stepupUsers={stepupUsers} 
                  currentUser={currentUser}
                />
              )}
            </div>
            
            <ActionPanel 
              content={content} 
              onSaveToTrello={handleDirectSave}
              isEditingExistingCard={!!editingCardId}
              readOnly={currentUser?.role?.trim().toLowerCase() === 'client'}
              isClient={currentUser?.role?.trim().toLowerCase() === 'client'}
              onClientValidate={handleClientValidate}
              onClientRefuse={handleClientRefuse}
            />
          </div>
        )}

        {/* ONGLET 2 : TABLEAU TRELLO */}
        {activeTab === 'board' && (
          <Board 
            cards={cards} 
            companies={companies}
            stepupUsers={stepupUsers}
            onMoveCard={handleMoveCard}
            onDeleteCard={handleDeleteCard}
            onEditCard={handleEditCard}
            onAddCard={handleAddCard}
            onUpdateCardDate={handleUpdateCardDate}
            syncMode={syncMode}
            currentUser={currentUser}
            selectedCompanyFilter={selectedCompanyFilter}
            setSelectedCompanyFilter={setSelectedCompanyFilter}
          />
        )}

        {/* ONGLET 2.5 : CALENDRIER DE PUBLICATION */}
        {activeTab === 'calendar' && (
          <CalendarView 
            cards={cards}
            companies={companies}
            onEditCard={handleEditCard}
            onAddCard={handleAddCard}
            selectedCompanyFilter={selectedCompanyFilter}
            setSelectedCompanyFilter={setSelectedCompanyFilter}
            currentUser={currentUser}
          />
        )}

        {/* ONGLET 2.75 : ADMINISTRATION */}
        {activeTab === 'admin_panel' && ['admin', 'manager', 'super_manager'].includes(currentUser?.role?.trim().toLowerCase()) && (
          <AdminPanel 
            companies={companies}
            clients={clients}
            stepupUsers={stepupUsers}
            onRefreshData={loadProfiles}
            currentUser={currentUser}
          />
        )}

        {/* ONGLET 3 : CONFIGURATION GOOGLE DRIVE */}
        {activeTab === 'settings' && ['admin', 'super_manager'].includes(currentUser?.role?.trim().toLowerCase()) && (
          <DriveSettings 
            syncMode={syncMode}
            setSyncMode={setSyncMode}
            localDirectoryName={localDirectoryName}
            setLocalDirectoryHandle={setLocalDirectoryHandle}
            setLocalDirectoryName={setLocalDirectoryName}
            cloudAccessToken={cloudAccessToken}
            setCloudAccessToken={setCloudAccessToken}
            cloudFolderId={cloudFolderId}
            setCloudFolderId={setCloudFolderId}
            onRefreshBoard={loadCards}
            supabaseConnected={supabaseConnected}
            supabaseTableExists={supabaseTableExists}
            hasLegacyCardsToMigrate={hasLegacyCardsToMigrate}
            onMigrateCards={handleMigrateCards}
            checkSupabaseDb={checkSupabaseDb}
            autoBackupEnabled={autoBackupEnabled}
            setAutoBackupEnabled={setAutoBackupEnabled}
            backupFolderId={backupFolderId}
            setBackupFolderId={setBackupFolderId}
            lastBackupTime={lastBackupTime}
            lastBackupStatus={lastBackupStatus}
            onTriggerBackup={triggerSupabaseBackup}
          />
        )}
          </>
        )}
      </main>

      {/* MODAL MODIFIER MOT DE PASSE */}
      {isChangePasswordOpen && (
        <div className="change-pw-modal-overlay animate-fade-in" onClick={() => setIsChangePasswordOpen(false)}>
          <div className="change-pw-modal glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Modifier mon mot de passe</h3>
              <button className="btn-close-modal" onClick={() => setIsChangePasswordOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {changePwError && (
              <div className="change-pw-error-badge">
                <AlertCircle size={16} />
                <span>{changePwError}</span>
              </div>
            )}

            {changePwSuccess && (
              <div className="change-pw-success-badge">
                <CheckCircle2 size={16} />
                <span>{changePwSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="change-pw-form">
              <div className="input-field">
                <label htmlFor="old-password">Mot de passe actuel</label>
                <div className="password-input-container" style={{ position: 'relative', width: '100%' }}>
                  <input
                    id="old-password"
                    type={showOldPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                    disabled={changePwLoading}
                    style={{ paddingRight: '2.5rem', width: '100%' }}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    aria-label={showOldPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0.25rem',
                      zIndex: 10
                    }}
                  >
                    {showOldPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="input-field">
                <label htmlFor="new-password">Nouveau mot de passe</label>
                <div className="password-input-container" style={{ position: 'relative', width: '100%' }}>
                  <input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Minimum 6 caractères"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={changePwLoading}
                    style={{ paddingRight: '2.5rem', width: '100%' }}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    aria-label={showNewPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0.25rem',
                      zIndex: 10
                    }}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="input-field">
                <label htmlFor="confirm-new-password">Confirmer le nouveau mot de passe</label>
                <div className="password-input-container" style={{ position: 'relative', width: '100%' }}>
                  <input
                    id="confirm-new-password"
                    type={showConfirmNewPassword ? "text" : "password"}
                    placeholder="Confirmez le nouveau mot de passe"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                    disabled={changePwLoading}
                    style={{ paddingRight: '2.5rem', width: '100%' }}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                    aria-label={showConfirmNewPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0.25rem',
                      zIndex: 10
                    }}
                  >
                    {showConfirmNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setIsChangePasswordOpen(false)}
                  disabled={changePwLoading}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={changePwLoading}
                >
                  {changePwLoading ? "Modification..." : "Modifier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
