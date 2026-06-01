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

// Recherche ou crée le dossier "AllPosts" dans Google Drive Cloud
export async function getOrCreateDriveFolder(accessToken) {
  const query = encodeURIComponent("name = 'AllPosts' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const searchUrl = `${DRIVE_API_BASE}?q=${query}&fields=files(id,name)`;
  
  const searchRes = await fetch(searchUrl, {
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
  const createRes = await fetch(DRIVE_API_BASE, {
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

// Lit toutes les cartes de posts depuis Google Drive Cloud
export async function readCardsFromDriveCloud(accessToken, folderId) {
  const query = encodeURIComponent(`'${folderId}' in parents and mimeType = 'application/json' and trashed = false`);
  const listUrl = `${DRIVE_API_BASE}?q=${query}&fields=files(id,name)`;
  
  const listRes = await fetch(listUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (!listRes.ok) {
    throw new Error("Erreur lors de la récupération des fichiers depuis Google Drive.");
  }
  
  const listData = await listRes.json();
  const files = listData.files || [];
  const cards = [];
  
  // Lecture de chaque fichier JSON
  for (const file of files) {
    if (file.name.startsWith('post-') && file.name.endsWith('.json')) {
      try {
        const fileContentUrl = `${DRIVE_API_BASE}/${file.id}?alt=media`;
        const contentRes = await fetch(fileContentUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (contentRes.ok) {
          const cardData = await contentRes.json();
          // Associe l'ID de fichier Drive Cloud pour pouvoir le modifier ultérieurement
          cardData.cloudFileId = file.id;
          cards.push(cardData);
        }
      } catch (err) {
        console.error(`Erreur de lecture du fichier Drive ${file.name}:`, err);
      }
    }
  }
  
  return cards;
}

// Écrit ou met à jour une carte sur Google Drive Cloud
export async function writeCardToDriveCloud(accessToken, folderId, card) {
  const fileName = `post-${card.id}.json`;
  
  // 1. Recherche si le fichier existe déjà
  const query = encodeURIComponent(`'${folderId}' in parents and name = '${fileName}' and trashed = false`);
  const searchUrl = `${DRIVE_API_BASE}?q=${query}&fields=files(id)`;
  
  const searchRes = await fetch(searchUrl, {
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
    const updateRes = await fetch(updateUrl, {
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
    const createRes = await fetch(DRIVE_API_BASE, {
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
    const uploadRes = await fetch(uploadUrl, {
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
  
  const searchRes = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      const fileId = searchData.files[0].id;
      
      // Suppression définitive (ou mise à la corbeille)
      const deleteRes = await fetch(`${DRIVE_API_BASE}/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!deleteRes.ok) {
        console.warn(`Impossible de supprimer le fichier Drive ${fileId}`);
      }
    }
  }
}
