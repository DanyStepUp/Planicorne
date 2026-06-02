import { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import PlatformSelector from './components/PlatformSelector';
import PostEditor from './components/PostEditor';
import PostPreview from './components/PostPreview';
import ActionPanel from './components/ActionPanel';
import CalendarView from './components/CalendarView';
import Board from './components/Board';
import DriveSettings from './components/DriveSettings';
import SaveCardModal from './components/SaveCardModal';
import CommentsSection from './components/CommentsSection';
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';
import { 
  getHandleFromDB, 
  verifyPermission, 
  readCardsFromDirectory, 
  writeCardToDirectory, 
  deleteCardFromDirectory,
  readCardsFromDriveCloud,
  writeCardToDriveCloud,
  deleteCardFromDriveCloud,
  uploadBackupToDrive
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
  fetchAllDatabaseData
} from './utils/supabaseService';
import { X, AlertCircle, FileText, Database } from 'lucide-react';
import './App.css';

// Posts d'exemple initiaux haut de gamme
const INITIAL_CARDS = [
  {
    id: 'init-1',
    title: 'Annonce de notre nouveau site web',
    content: "Nous sommes ravis de vous présenter notre tout nouveau site internet ! ✨\n\nPlus moderne, plus rapide, et conçu pour vous offrir la meilleure expérience utilisateur possible.\n\nDécouvrez nos services, nos études de cas et notre blog en un clic. Lien dans la bio ! 🚀\n\n#nouveau #site #startup #digital",
    platform: 'linkedin',
    status: 'draft',
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    scheduledAt: new Date(Date.now() + 3600000 * 24).toISOString(),
    attachments: [
      {
        id: 'init-att-1',
        name: 'nouveau-site.svg',
        type: 'image/svg+xml',
        size: 614,
        data: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23198CCC"/><stop offset="100%" stop-color="%236366f1"/></linearGradient></defs><rect width="800" height="400" fill="url(%23g)"/><circle cx="400" cy="200" r="120" fill="white" fill-opacity="0.1"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-size="44" font-weight="800" fill="white" letter-spacing="1.5">SITE WEB EN LIGNE ! ✨</text></svg>',
        isCover: true
      }
    ]
  },
  {
    id: 'init-2',
    title: 'Recrutement : Chef de Projet Digital',
    content: "Step Up recrute ! 🎯\n\nVous êtes passionné par le marketing digital, organisé et doté d'un excellent relationnel ? Rejoignez notre équipe en pleine croissance en tant que Chef de Projet Digital.\n\nPostulez dès aujourd'hui par email ou partagez cette opportunité à votre réseau ! 💼",
    platform: 'facebook',
    status: 'validate',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    scheduledAt: new Date(Date.now() + 3600000 * 48).toISOString()
  },
  {
    id: 'init-3',
    title: 'Citation inspirante - Lundi motivation',
    content: "« La seule façon de faire du bon travail est d'aimer ce que vous faites. » - Steve Jobs 💡\n\nTrès bon début de semaine à tous ! Que vos projets se concrétisent.\n\n#lundi #motivation #citation #leadership",
    platform: 'instagram',
    status: 'ready',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    scheduledAt: new Date(Date.now() - 3600000 * 24).toISOString()
  }
];

function App() {
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
  
  // États de synchronisation
  const [syncMode, setSyncMode] = useState(localStorage.getItem('sync_mode') || 'supabase');
  const [localDirectoryHandle, setLocalDirectoryHandle] = useState(null);
  const [localDirectoryName, setLocalDirectoryName] = useState('');
  const [cloudAccessToken, setCloudAccessToken] = useState(localStorage.getItem('gdrive_access_token') || '');
  const [cloudFolderId, setCloudFolderId] = useState(localStorage.getItem('gdrive_folder_id') || '');
  
  // États de sauvegarde automatique Supabase vers Google Drive
  const [autoBackupEnabled, setAutoBackupEnabledState] = useState(() => localStorage.getItem('auto_backup_enabled') === 'true');
  const [backupFolderId, setBackupFolderIdState] = useState(() => localStorage.getItem('auto_backup_folder_id') || '');
  const [lastBackupTime, setLastBackupTime] = useState(() => localStorage.getItem('last_supabase_backup_time') || '');
  const [lastBackupStatus, setLastBackupStatus] = useState(() => localStorage.getItem('last_supabase_backup_status') || '');

  const setAutoBackupEnabled = (val) => {
    setAutoBackupEnabledState(val);
    localStorage.setItem('auto_backup_enabled', val ? 'true' : 'false');
  };

  const setBackupFolderId = (val) => {
    setBackupFolderIdState(val);
    localStorage.setItem('auto_backup_folder_id', val);
  };
  
  // Session Utilisateur
  const [currentUser, setCurrentUser] = useState(JSON.parse(localStorage.getItem('app_user_session')) || null);

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
  
  // Édition bidirectionnelle et Modal de sauvegarde
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState(null);
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
    
    // Repasser en mode de stockage local par défaut
    setSyncMode('local');
    localStorage.setItem('sync_mode', 'local');
    
    setEditingCardId(null);
    setContent('');
    setAttachments([]);
    setScheduledAt('');
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
        setStepupUsers(users);
        setCompanies(comps);
      } catch (e) {
        console.error("Erreur de chargement des profils relationnels:", e);
      }
    }
  }, [syncMode, supabaseConnected]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadProfiles();
    }, 0);
    return () => clearTimeout(t);
  }, [loadProfiles]);

  // Fonction pour déclencher une sauvegarde manuelle ou planifiée
  const triggerSupabaseBackup = async () => {
    if (!cloudAccessToken || !backupFolderId) {
      console.warn("Impossible de sauvegarder : Token ou Dossier Google Drive manquant.");
      return;
    }

    try {
      setLastBackupStatus("Sauvegarde en cours...");
      localStorage.setItem('last_supabase_backup_status', "Sauvegarde en cours...");

      // 1. Récupération des données Supabase
      const data = await fetchAllDatabaseData();

      // 2. Génération du nom de fichier unique
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
      const fileName = `supabase_backup_${dateStr}_${timeStr}.json`;

      // 3. Téléversement vers Drive
      await uploadBackupToDrive(cloudAccessToken, backupFolderId, data, fileName);

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
  };

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
  }, [autoBackupEnabled, cloudAccessToken, backupFolderId, syncMode, supabaseConnected]);

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
      if (syncMode === 'supabase') {
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
      }
      else if (syncMode === 'local') {
        const stored = localStorage.getItem('trello_cards');
        if (stored) {
          setCards(JSON.parse(stored));
        } else {
          // Si vide, charger les exemples premium et les enregistrer dans localStorage
          setCards(INITIAL_CARDS);
          localStorage.setItem('trello_cards', JSON.stringify(INITIAL_CARDS));
        }
        setLocalPermissionNeeded(false);
      } 
      else if (syncMode === 'local_dir') {
        let handle = localDirectoryHandle;
        
        // Tenter de restaurer le handle depuis IndexedDB
        if (!handle) {
          try {
            handle = await getHandleFromDB();
            if (handle) {
              setLocalDirectoryHandle(handle);
              setLocalDirectoryName(handle.name);
            }
          } catch (e) {
            console.warn("Impossible de restaurer le dossier local depuis IndexedDB:", e);
          }
        }

        if (handle) {
          const hasPermission = await verifyPermission(handle, true);
          if (hasPermission) {
            setLocalPermissionNeeded(false);
            const localCards = await readCardsFromDirectory(handle);
            setCards(localCards);
          } else {
            setLocalPermissionNeeded(true);
          }
        } else {
          // Si le handle n'existe pas, repasser en mode local
          setSyncMode('local');
          localStorage.setItem('sync_mode', 'local');
        }
      } 
      else if (syncMode === 'cloud') {
        if (cloudAccessToken && cloudFolderId) {
          const cloudCards = await readCardsFromDriveCloud(cloudAccessToken, cloudFolderId);
          setCards(cloudCards);
        } else {
          // Si pas d'accès, repasser en local
          setSyncMode('local');
          localStorage.setItem('sync_mode', 'local');
        }
      }
    } catch (error) {
      console.error("Erreur lors du chargement des cartes de posts:", error);
    }
  }, [syncMode, localDirectoryHandle, cloudAccessToken, cloudFolderId, checkSupabaseDb, currentUser?.role, currentUser?.company_id, currentUser?.client_id]);

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
          if (syncMode === 'supabase') {
            await updatePost(editingCardId, cardData);
          } else if (syncMode === 'local') {
            localStorage.setItem('trello_cards', JSON.stringify(updatedCards));
          } else if (syncMode === 'local_dir' && localDirectoryHandle) {
            await writeCardToDirectory(localDirectoryHandle, updatedCard);
          } else if (syncMode === 'cloud' && cloudAccessToken) {
            await writeCardToDriveCloud(cloudAccessToken, cloudFolderId, updatedCard);
          }
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
        if (syncMode === 'supabase') {
          await insertPost(newCard);
        } else if (syncMode === 'local') {
          localStorage.setItem('trello_cards', JSON.stringify(updatedCards));
        } else if (syncMode === 'local_dir' && localDirectoryHandle) {
          await writeCardToDirectory(localDirectoryHandle, newCard);
        } else if (syncMode === 'cloud' && cloudAccessToken) {
          await writeCardToDriveCloud(cloudAccessToken, cloudFolderId, newCard);
        }
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
      setContent('');
      setAttachments([]);
      setScheduledAt('');
    }, 100);
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

  // Refus par le client (fait défiler vers la section des commentaires)
  const handleClientRefuse = () => {
    const commentsEl = document.querySelector('.comments-section-container');
    if (commentsEl) {
      commentsEl.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => {
        const textarea = document.querySelector('.comment-textarea');
        if (textarea) textarea.focus();
      }, 500);
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
      if (syncMode === 'supabase') {
        await updatePost(cardId, { status: newColumnId });
      } else if (syncMode === 'local') {
        localStorage.setItem('trello_cards', JSON.stringify(updatedCards));
      } else if (syncMode === 'local_dir' && localDirectoryHandle) {
        await writeCardToDirectory(localDirectoryHandle, updatedCard);
      } else if (syncMode === 'cloud' && cloudAccessToken) {
        await writeCardToDriveCloud(cloudAccessToken, cloudFolderId, updatedCard);
      }
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
      if (syncMode === 'supabase') {
        await deletePost(cardId);
      } else if (syncMode === 'local') {
        localStorage.setItem('trello_cards', JSON.stringify(updatedCards));
      } else if (syncMode === 'local_dir' && localDirectoryHandle) {
        await deleteCardFromDirectory(localDirectoryHandle, cardId);
      } else if (syncMode === 'cloud' && cloudAccessToken) {
        await deleteCardFromDriveCloud(cloudAccessToken, cloudFolderId, cardId);
      }
    } catch (dbError) {
      console.error("Erreur lors de la suppression dans Supabase:", dbError);
      alert("Erreur lors de la suppression sur Supabase.");
    }

    // Si on supprimait la carte actuellement ouverte dans l'éditeur, effacer le lien
    if (editingCardId === cardId) {
      setEditingCardId(null);
    }
  };

  // Charger une carte dans l'éditeur (bidirectionnalité)
  const handleEditCard = (card) => {
    setContent(card.content);
    setSelectedPlatform(card.platform);
    setAttachments(card.attachments || []);
    setScheduledAt(card.scheduledAt || '');
    setEditingCardId(card.id);
    setActiveTab('editor');
  };

  // Ajouter directement une carte depuis le tableau (carte vide)
  const handleAddCardDirectly = async (newCardData) => {
    const newCard = {
      ...newCardData,
      id: Date.now().toString(),
      attachments: []
    };

    const updatedCards = [newCard, ...cards];
    setCards(updatedCards);

    try {
      if (syncMode === 'supabase') {
        await insertPost(newCard);
      } else if (syncMode === 'local') {
        localStorage.setItem('trello_cards', JSON.stringify(updatedCards));
      } else if (syncMode === 'local_dir' && localDirectoryHandle) {
        await writeCardToDirectory(localDirectoryHandle, newCard);
      } else if (syncMode === 'cloud' && cloudAccessToken) {
        await writeCardToDriveCloud(cloudAccessToken, cloudFolderId, newCard);
      }
    } catch (dbError) {
      handleDbError(dbError, "Erreur lors de la création sur Supabase :");
    }
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
      if (syncMode === 'supabase') {
        await updatePost(cardId, { scheduledAt: finalDate });
      } else if (syncMode === 'local') {
        localStorage.setItem('trello_cards', JSON.stringify(updatedCards));
      } else if (syncMode === 'local_dir' && localDirectoryHandle) {
        const card = updatedCards.find(c => c.id === cardId);
        await writeCardToDirectory(localDirectoryHandle, card);
      } else if (syncMode === 'cloud' && cloudAccessToken) {
        const card = updatedCards.find(c => c.id === cardId);
        await writeCardToDriveCloud(cloudAccessToken, cloudFolderId, card);
      }
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
        syncMode={syncMode}
        localDirectoryName={localDirectoryName}
        supabaseConnected={supabaseConnected}
        supabaseTableExists={supabaseTableExists}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
      
      <main className="main-content">
        {!currentUser ? (
          <Login onLoginSuccess={handleLoginSuccess} />
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
        {currentUser?.role?.trim().toLowerCase() === 'admin' && syncMode === 'supabase' && hasLegacyCardsToMigrate && supabaseTableExists && (
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

        {currentUser?.role?.trim().toLowerCase() === 'admin' && syncMode === 'supabase' && !supabaseTableExists && (
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
            
            <div className="workspace">
              <div className="workspace-left">
                <PostEditor 
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
              
              <div className="workspace-right">
                <PostPreview 
                  content={content} 
                  platform={selectedPlatform} 
                  attachments={attachments}
                />
              </div>
            </div>
            
            <ActionPanel 
              content={content} 
              onSaveToTrello={() => setIsSaveModalOpen(true)}
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
            onMoveCard={handleMoveCard}
            onDeleteCard={handleDeleteCard}
            onEditCard={handleEditCard}
            onAddCardDirectly={handleAddCardDirectly}
            onUpdateCardDate={handleUpdateCardDate}
            syncMode={syncMode}
            currentUser={currentUser}
          />
        )}

        {/* ONGLET 2.5 : CALENDRIER DE PUBLICATION */}
        {activeTab === 'calendar' && (
          <CalendarView 
            cards={cards}
            onEditCard={handleEditCard}
            onAddCardDirectly={handleAddCardDirectly}
          />
        )}

        {/* ONGLET 2.75 : ADMINISTRATION */}
        {activeTab === 'admin_panel' && currentUser?.role?.trim().toLowerCase() === 'admin' && (
          <AdminPanel 
            companies={companies}
            clients={clients}
            stepupUsers={stepupUsers}
            onRefreshData={loadProfiles}
          />
        )}

        {/* ONGLET 3 : CONFIGURATION GOOGLE DRIVE */}
        {activeTab === 'settings' && currentUser?.role?.trim().toLowerCase() === 'admin' && (
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

      {/* MODAL D'ENREGISTREMENT */}
      {isSaveModalOpen && (
        <SaveCardModal 
          isOpen={isSaveModalOpen}
          onClose={() => setIsSaveModalOpen(false)}
          onSave={handleSaveCard}
          initialTitle={activeEditingCard ? activeEditingCard.title : (content ? content.split('\n')[0].substring(0, 30) : '')}
          initialColumn={activeEditingCard ? activeEditingCard.status : 'draft'}
          initialScheduledAt={activeEditingCard ? activeEditingCard.scheduledAt : ''}
          initialCompanyId={activeEditingCard ? activeEditingCard.company_id : ''}
          companies={companies}
          isUpdate={!!editingCardId}
        />
      )}
    </div>
  );
}

export default App;
