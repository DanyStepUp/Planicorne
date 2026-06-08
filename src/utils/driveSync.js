// Module de synchronisation pour le stockage local, Google Drive local et Google Drive API Cloud

const DB_NAME = 'AllPostsDriveSync';
const STORE_NAME = 'handles';

// --- HELPERS INDEXEDDB POUR STOCKAGE HANDLE DOSSIER LOCAL ---
export async function saveHandleToDB(handle) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const putReq = store.put(handle, 'gdrive_directory');
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getHandleFromDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get('gdrive_directory');
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(getReq.error);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function clearHandleFromDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const delReq = store.delete('gdrive_directory');
      delReq.onsuccess = () => resolve();
      delReq.onerror = () => reject(delReq.error);
    };
    request.onerror = () => reject(request.error);
  });
}

// --- OPTION LOCAL DIRECTORY SYNC (FILE SYSTEM ACCESS API) ---

export async function verifyPermission(fileHandle, readWrite) {
  const options = {};
  if (readWrite) {
    options.mode = 'readwrite';
  }
  if ((await fileHandle.queryPermission(options)) === 'granted') {
    return true;
  }
  if ((await fileHandle.requestPermission(options)) === 'granted') {
    return true;
  }
  return false;
}

export async function readCardsFromDirectory(directoryHandle) {
  const cards = [];
  try {
    for await (const entry of directoryHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.json')) {
        const file = await entry.getFile();
        const text = await file.text();
        try {
          const card = JSON.parse(text);
          if (card.id && card.title) {
            cards.push(card);
          }
        } catch (e) {
          console.error("Erreur de parsing JSON pour le fichier:", entry.name, e);
        }
      }
    }
  } catch (error) {
    console.error("Erreur lors de la lecture du dossier local:", error);
    throw error;
  }
  return cards;
}

export async function writeCardToDirectory(directoryHandle, card) {
  try {
    const fileName = `post-${card.id}.json`;
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(card, null, 2));
    await writable.close();
  } catch (error) {
    console.error("Erreur lors de l'écriture du fichier local:", error);
    throw error;
  }
}

export async function deleteCardFromDirectory(directoryHandle, cardId) {
  try {
    const fileName = `post-${cardId}.json`;
    await directoryHandle.removeEntry(fileName);
  } catch (error) {
    console.warn("Impossible de supprimer le fichier du dossier local (peut-être déjà supprimé):", error);
  }
}


// --- OPTION GOOGLE DRIVE REST API (CLOUD) ---

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3/files';

// Fonction de requêtage avec gestion robuste des erreurs temporaires et limites de taux (Exponential Backoff)
async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      // Gérer la limite de taux (429) ou les erreurs temporaires serveur (5xx)
      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        if (i === retries - 1) return response; // Retourner la dernière réponse si c'est la fin
        console.warn(`Drive API rate limited or server error (${response.status}). Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Croissance exponentielle
        continue;
      }
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`Network error. Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

// Recherche ou crée le dossier "AllPosts" dans Google Drive Cloud
export async function getOrCreateDriveFolder(accessToken) {
  const query = encodeURIComponent("name = 'AllPosts' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const searchUrl = `${DRIVE_API_BASE}?q=${query}&fields=files(id,name)`;
  
  const searchRes = await fetchWithRetry(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (!searchRes.ok) {
    throw new Error("Erreur de communication avec Google Drive lors de la recherche du dossier.");
  }
  
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }
  
  // Création du dossier
  const createRes = await fetchWithRetry(DRIVE_API_BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'AllPosts',
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  
  if (!createRes.ok) {
    throw new Error("Impossible de créer le dossier 'AllPosts' dans Google Drive.");
  }
  
  const createData = await createRes.json();
  return createData.id;
}

// Lit toutes les cartes de posts depuis Google Drive Cloud (avec Cache Incremental & Quota Protection)
export async function readCardsFromDriveCloud(accessToken, folderId) {
  const query = encodeURIComponent(`'${folderId}' in parents and mimeType = 'application/json' and trashed = false`);
  const listUrl = `${DRIVE_API_BASE}?q=${query}&fields=files(id,name,modifiedTime)`;
  
  const listRes = await fetchWithRetry(listUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (!listRes.ok) {
    throw new Error("Erreur lors de la récupération des fichiers depuis Google Drive.");
  }
  
  const listData = await listRes.json();
  const files = listData.files || [];
  
  // Charger le cache local existant
  let cache = {};
  try {
    const cachedData = localStorage.getItem('gdrive_cards_cache');
    if (cachedData) {
      cache = JSON.parse(cachedData);
    }
  } catch (e) {
    console.warn("Impossible de charger le cache gdrive_cards_cache, réinitialisation...", e);
  }
  
  const newCache = {};
  const cards = [];
  
  // Filtrer les fichiers valides de posts
  const postFiles = files.filter(f => f.name.startsWith('post-') && f.name.endsWith('.json'));
  
  // Lecture incrémentale
  for (const file of postFiles) {
    const cachedItem = cache[file.id];
    
    // Si l'élément est en cache et sa date de modification est inchangée, utiliser le cache local
    if (cachedItem && cachedItem.modifiedTime === file.modifiedTime) {
      cards.push(cachedItem.card);
      newCache[file.id] = cachedItem;
    } else {
      // Sinon, télécharger le fichier depuis Drive
      try {
        const fileContentUrl = `${DRIVE_API_BASE}/${file.id}?alt=media`;
        const contentRes = await fetchWithRetry(fileContentUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (contentRes.ok) {
          const cardData = await contentRes.json();
          // Associe l'ID de fichier Drive Cloud pour pouvoir le modifier ultérieurement
          cardData.cloudFileId = file.id;
          cards.push(cardData);
          
          newCache[file.id] = {
            modifiedTime: file.modifiedTime,
            card: cardData
          };
        }
      } catch (err) {
        console.error(`Erreur de lecture du fichier Drive ${file.name}:`, err);
        // Fallback sur le cache en cas d'erreur réseau ponctuelle pour conserver la donnée
        if (cachedItem) {
          cards.push(cachedItem.card);
          newCache[file.id] = cachedItem;
        }
      }
    }
  }
  
  // Enregistrer le cache mis à jour dans localStorage
  try {
    localStorage.setItem('gdrive_cards_cache', JSON.stringify(newCache));
  } catch (e) {
    console.error("Impossible d'enregistrer le cache gdrive_cards_cache dans localStorage:", e);
  }
  
  return cards;
}

// Écrit ou met à jour une carte sur Google Drive Cloud
export async function writeCardToDriveCloud(accessToken, folderId, card) {
  const fileName = `post-${card.id}.json`;
  
  // 1. Recherche si le fichier existe déjà
  const query = encodeURIComponent(`'${folderId}' in parents and name = '${fileName}' and trashed = false`);
  const searchUrl = `${DRIVE_API_BASE}?q=${query}&fields=files(id)`;
  
  const searchRes = await fetchWithRetry(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  let fileId = null;
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      fileId = searchData.files[0].id;
    }
  }
  
  if (fileId) {
    // Mise à jour du contenu
    const updateUrl = `${UPLOAD_API_BASE}/${fileId}?uploadType=media`;
    const updateRes = await fetchWithRetry(updateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(card)
    });
    
    if (!updateRes.ok) {
      throw new Error(`Échec de la mise à jour du fichier ${fileName} sur Google Drive.`);
    }
    
    return fileId;
  } else {
    // Création des métadonnées du fichier
    const createRes = await fetchWithRetry(DRIVE_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: fileName,
        parents: [folderId],
        mimeType: 'application/json'
      })
    });
    
    if (!createRes.ok) {
      throw new Error(`Échec de la création du fichier ${fileName} sur Google Drive.`);
    }
    
    const createData = await createRes.json();
    const newFileId = createData.id;
    
    // Upload du contenu
    const uploadUrl = `${UPLOAD_API_BASE}/${newFileId}?uploadType=media`;
    const uploadRes = await fetchWithRetry(uploadUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(card)
    });
    
    if (!uploadRes.ok) {
      throw new Error(`Échec du téléversement du contenu pour ${fileName}.`);
    }
    
    return newFileId;
  }
}

// Supprime une carte de Google Drive Cloud
export async function deleteCardFromDriveCloud(accessToken, folderId, cardId) {
  const fileName = `post-${cardId}.json`;
  
  // Recherche du fichier
  const query = encodeURIComponent(`'${folderId}' in parents and name = '${fileName}' and trashed = false`);
  const searchUrl = `${DRIVE_API_BASE}?q=${query}&fields=files(id)`;
  
  const searchRes = await fetchWithRetry(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      const fileId = searchData.files[0].id;
      
      // Suppression définitive (ou mise à la corbeille)
      const deleteRes = await fetchWithRetry(`${DRIVE_API_BASE}/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!deleteRes.ok) {
        console.warn(`Impossible de supprimer le fichier Drive ${fileId}`);
      }
    }
  }
}

/**
 * Liste les dossiers du Google Drive de l'utilisateur.
 */
export async function listDriveFolders(accessToken) {
  const query = encodeURIComponent("mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const listUrl = `${DRIVE_API_BASE}?q=${query}&fields=files(id,name)&orderBy=name`;
  
  const res = await fetch(listUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (!res.ok) {
    throw new Error("Impossible de lister les dossiers Google Drive.");
  }
  
  const data = await res.json();
  return data.files || [];
}

/**
 * Crée un nouveau dossier Google Drive.
 */
export async function createDriveFolder(accessToken, folderName) {
  const res = await fetch(DRIVE_API_BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  
  if (!res.ok) {
    throw new Error(`Échec de la création du dossier "${folderName}".`);
  }
  
  const data = await res.json();
  return data.id;
}

/**
 * Téléverse un fichier JSON de sauvegarde Supabase dans un dossier Google Drive spécifique.
 */
export async function uploadBackupToDrive(accessToken, folderId, data, fileName) {
  const isSql = fileName.endsWith('.sql');
  const mimeType = isSql ? 'text/plain' : 'application/json';

  // 1. Création du fichier vide avec parents
  const createRes = await fetch(DRIVE_API_BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: fileName,
      parents: [folderId],
      mimeType: mimeType
    })
  });
  
  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Échec de création du fichier "${fileName}" sur Google Drive : ${createRes.status} - ${errText}`);
  }
  
  const createData = await createRes.json();
  const fileId = createData.id;
  
  // 2. Remplissage avec le contenu
  const uploadUrl = `${UPLOAD_API_BASE}/${fileId}?uploadType=media`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': mimeType
    },
    body: isSql ? data : JSON.stringify(data, null, 2)
  });
  
  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Échec de téléversement du contenu de la sauvegarde : ${uploadRes.status} - ${errText}`);
  }
  
  return fileId;
}


/**
 * Rafraîchit le jeton d'accès Google Drive à l'aide du Refresh Token.
 */
export async function refreshGoogleAccessToken(clientId, clientSecret, refreshToken) {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google OAuth Refresh error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in
    };
  } catch (err) {
    console.error("Échec du rafraîchissement du token Google Drive :", err);
    throw err;
  }
}

