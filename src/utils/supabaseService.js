import { supabase } from './supabaseClient';

/**
 * Checks whether the 'posts' table exists in the Supabase PostgreSQL database.
 * Returns false if the table has not been created yet or is inaccessible.
 */
export async function checkTableExists() {
  try {
    const { error } = await supabase.from('posts').select('id').limit(1);
    if (error) {
      // If table does not exist, Postgres returns relation does not exist
      if (error.message && (error.message.includes('does not exist') || error.code === '42P01')) {
        return false;
      }
      // If there's another error (like network issue), propagate it
      console.warn("Database check returned error:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Failed to check if 'posts' table exists:", e);
    return false;
  }
}

/**
 * Fetches all posts from the Supabase database, ordered by updatedAt descending.
 */
export async function fetchPosts(currentUser = null) {
  let query = supabase
    .from('posts')
    .select('*, companies(name)');

  if (currentUser) {
    const role = currentUser.role?.trim().toLowerCase();
    if (role === 'client') {
      if (currentUser.company_id) {
        query = query.eq('company_id', currentUser.company_id);
      } else if (currentUser.client_id) {
        query = query.eq('client_id', currentUser.client_id);
      }
    }
  }

  const { data, error } = await query.order('updatedAt', { ascending: false });

  if (error) {
    throw error;
  }
  return data || [];
}

/**
 * Inserts a new post into the Supabase database.
 */
export async function insertPost(post) {
  const formattedPost = {
    id: post.id,
    title: post.title,
    content: post.content,
    platform: post.platform,
    status: post.status,
    attachments: post.attachments || [],
    createdAt: post.createdAt || new Date().toISOString(),
    updatedAt: post.updatedAt || new Date().toISOString(),
    scheduledAt: post.scheduledAt || null,
    company_id: post.company_id || null,
    client_id: post.client_id || null
  };

  const { data, error } = await supabase
    .from('posts')
    .insert([formattedPost])
    .select();

  if (error) {
    throw error;
  }
  return data ? data[0] : null;
}

/**
 * Updates an existing post in the Supabase database.
 */
export async function updatePost(id, updates) {
  const formattedUpdates = {
    ...updates,
    updatedAt: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('posts')
    .update(formattedUpdates)
    .eq('id', id)
    .select();

  if (error) {
    throw error;
  }
  return data ? data[0] : null;
}

/**
 * Deletes a post from the Supabase database by ID.
 */
export async function deletePost(id) {
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', id);

  if (error) {
    throw error;
  }
  return true;
}

/**
 * Migrates a list of legacy cards (e.g. from LocalStorage) to the Supabase database.
 * Upserts them by ID.
 */
export async function migrateLegacyCards(cards) {
  if (!cards || cards.length === 0) return 0;

  const formattedCards = cards.map(card => ({
    id: card.id,
    title: card.title,
    content: card.content,
    platform: card.platform,
    status: card.status,
    attachments: card.attachments || [],
    createdAt: card.createdAt || new Date().toISOString(),
    updatedAt: card.updatedAt || new Date().toISOString(),
    scheduledAt: card.scheduledAt || null,
    company_id: card.company_id || null,
    client_id: card.client_id || null
  }));

  const { data, error } = await supabase
    .from('posts')
    .upsert(formattedCards)
    .select();

  if (error) {
    throw error;
  }
  return data ? data.length : 0;
}

/**
 * Fetches all clients from the Supabase database, including their company name.
 */
export async function fetchClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, email, company_id, companies(name)');
  
  if (error) {
    throw error;
  }
  return data || [];
}

/**
 * Fetches all Step Up users (internal team) from the Supabase database.
 */
export async function fetchStepupUsers() {
  const { data, error } = await supabase
    .from('stepup_users')
    .select(`
      id, 
      name, 
      email, 
      role,
      stepup_user_companies (
        company_id
      )
    `);
  
  if (error) {
    throw error;
  }
  return (data || []).map(u => ({
    ...u,
    company_ids: u.stepup_user_companies ? u.stepup_user_companies.map(c => c.company_id) : []
  }));
}

/**
 * Fetches all comments for a specific post and resolves author identities.
 */
export async function getCommentsForPost(postId) {
  const { data, error } = await supabase
    .from('comments')
    .select(`
      id,
      post_id,
      content,
      createdAt,
      client_author_id,
      stepup_author_id,
      clients (
        name,
        companies (
          name
        )
      ),
      stepup_users (
        name,
        role
      )
    `)
    .eq('post_id', postId)
    .order('createdAt', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(comment => {
    let authorName = 'Anonyme';
    let authorType = '';
    let authorDetail = '';

    if (comment.clients) {
      authorName = comment.clients.name;
      authorType = 'Client';
      authorDetail = comment.clients.companies ? comment.clients.companies.name : 'Indépendant';
    } else if (comment.stepup_users) {
      authorName = comment.stepup_users.name;
      authorType = 'Step Up';
      authorDetail = comment.stepup_users.role;
    }

    return {
      id: comment.id,
      postId: comment.post_id,
      content: comment.content,
      createdAt: comment.createdAt,
      authorName,
      authorType,
      authorDetail
    };
  });
}

/**
 * Inserts a new comment into the Supabase database.
 */
export async function insertComment(postId, authorId, authorType, content) {
  const newComment = {
    id: 'comment-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    post_id: postId,
    content: content,
    createdAt: new Date().toISOString()
  };

  if (authorType === 'client') {
    newComment.client_author_id = authorId;
  } else if (authorType === 'stepup_user') {
    newComment.stepup_author_id = authorId;
  }

  const { data, error } = await supabase
    .from('comments')
    .insert([newComment])
    .select();

  if (error) {
    throw error;
  }
  return data ? data[0] : null;
}

/**
 * Authentifie un utilisateur avec son email et son mot de passe.
 * Retourne le profil utilisateur ou null s'il n'est pas trouvé.
 */
export async function authenticateUser(email, password) {
  const { data, error } = await supabase
    .from('app_users')
    .select(`
      id,
      email,
      password,
      name,
      role,
      client_id,
      stepup_user_id,
      clients (
        company_id
      )
    `)
    .eq('email', email)
    .eq('password', password)
    .single();

  if (error) {
    return null;
  }

  // Mettre à plat le company_id pour un accès facile
  if (data && data.clients) {
    data.company_id = data.clients.company_id;
  }

  return data;
}

/**
 * Rafraîchit les données de session d'un utilisateur à partir de son ID.
 */
export async function refreshUserSession(userId) {
  const { data, error } = await supabase
    .from('app_users')
    .select(`
      id,
      email,
      password,
      name,
      role,
      client_id,
      stepup_user_id,
      clients (
        company_id
      )
    `)
    .eq('id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  if (data.clients) {
    data.company_id = data.clients.company_id;
  }

  return data;
}

/**
 * Récupère la liste de toutes les entreprises enregistrées (avec logos et contrats).
 */
export async function fetchCompanies() {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('name');

  if (error) {
    throw error;
  }
  return data || [];
}

/**
 * Insère une nouvelle entreprise dans Supabase.
 */
export async function insertCompany(company) {
  const { data, error } = await supabase
    .from('companies')
    .insert([{
      id: company.id,
      name: company.name,
      logo_drive_id: company.logo_drive_id || null,
      contract_linkedin: company.contract_linkedin || 0,
      contract_facebook: company.contract_facebook || 0,
      contract_instagram: company.contract_instagram || 0,
      contract_google: company.contract_google || 0,
      contract_blog: company.contract_blog || 0,
      contract_newsletter: company.contract_newsletter || 0,
      contract_details: company.contract_details || null
    }])
    .select();

  if (error) {
    throw error;
  }
  return data ? data[0] : null;
}

/**
 * Insère un nouveau client (profil d'entreprise) dans Supabase.
 */
export async function insertClient(client) {
  const { data, error } = await supabase
    .from('clients')
    .insert([{
      id: client.id,
      name: client.name,
      email: client.email,
      company_id: client.company_id || null
    }])
    .select();

  if (error) {
    throw error;
  }
  return data ? data[0] : null;
}

/**
 * Insère un nouvel utilisateur Step Up dans Supabase.
 */
export async function insertStepupUser(user, companyIds = []) {
  const { data, error } = await supabase
    .from('stepup_users')
    .insert([{
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || 'editor'
    }])
    .select();

  if (error) {
    throw error;
  }

  // Enregistrer les associations d'entreprises
  if (companyIds && companyIds.length > 0) {
    const rows = companyIds.map(companyId => ({
      stepup_user_id: user.id,
      company_id: companyId
    }));
    const { error: err } = await supabase
      .from('stepup_user_companies')
      .insert(rows);
    if (err) console.error("Erreur d'insertion stepup_user_companies:", err);
  }

  return data ? data[0] : null;
}

/**
 * Crée un compte utilisateur global dans app_users.
 */
export async function createAppUser(user) {
  const { data, error } = await supabase
    .from('app_users')
    .insert([{
      id: user.id,
      email: user.email,
      password: user.password,
      name: user.name,
      role: user.role,
      client_id: user.client_id || null,
      stepup_user_id: user.stepup_user_id || null
    }])
    .select();

  if (error) {
    throw error;
  }
  return data ? data[0] : null;
}

/**
 * Enregistre un log de connexion dans la base de données.
 */
export async function logConnection(email, role) {
  try {
    const { error } = await supabase
      .from('connection_logs')
      .insert([{ user_email: email, user_role: role }]);

    if (error) {
      console.warn("Erreur d'insertion du log de connexion:", error);
    }
  } catch (err) {
    console.error("Échec de journalisation de la connexion:", err);
  }
}

/**
 * Met à jour une entreprise existante dans Supabase.
 */
export async function updateCompany(id, company) {
  const { data, error } = await supabase
    .from('companies')
    .update({
      name: company.name,
      logo_drive_id: company.logo_drive_id || null,
      contract_linkedin: parseInt(company.contract_linkedin) || 0,
      contract_facebook: parseInt(company.contract_facebook) || 0,
      contract_instagram: parseInt(company.contract_instagram) || 0,
      contract_google: parseInt(company.contract_google) || 0,
      contract_blog: parseInt(company.contract_blog) || 0,
      contract_newsletter: parseInt(company.contract_newsletter) || 0,
      contract_details: company.contract_details || null
    })
    .eq('id', id)
    .select();

  if (error) {
    throw error;
  }
  return data ? data[0] : null;
}

/**
 * Met à jour les informations d'un client et ses identifiants de connexion associés.
 */
export async function updateClient(clientId, clientData, loginData = {}) {
  // 1. Mise à jour de la table 'clients'
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .update({
      name: clientData.name,
      email: clientData.email,
      company_id: clientData.company_id || null
    })
    .eq('id', clientId)
    .select();

  if (clientErr) throw clientErr;

  // 2. Mise à jour de la table 'app_users' (compte de connexion)
  const appUserUpdate = {
    name: clientData.name,
    email: clientData.email.trim().toLowerCase()
  };
  if (loginData.password) {
    appUserUpdate.password = loginData.password;
  }

  const { error: appUserErr } = await supabase
    .from('app_users')
    .update(appUserUpdate)
    .eq('client_id', clientId);

  if (appUserErr) throw appUserErr;

  return client ? client[0] : null;
}

/**
 * Met à jour les informations d'un collaborateur Step Up et ses identifiants associés.
 */
export async function updateStepupUser(stepupId, stepupData, loginData = {}, companyIds = []) {
  // 1. Mise à jour de la table 'stepup_users'
  const { data: user, error: userErr } = await supabase
    .from('stepup_users')
    .update({
      name: stepupData.name,
      email: stepupData.email,
      role: stepupData.role
    })
    .eq('id', stepupId)
    .select();

  if (userErr) throw userErr;

  // 2. Mise à jour de la table 'app_users' (compte de connexion)
  const appUserUpdate = {
    name: stepupData.name,
    email: stepupData.email.trim().toLowerCase()
  };
  if (loginData.password) {
    appUserUpdate.password = loginData.password;
  }

  const { error: appUserErr } = await supabase
    .from('app_users')
    .update(appUserUpdate)
    .eq('stepup_user_id', stepupId);

  if (appUserErr) throw appUserErr;

  // 3. Mise à jour de la table de liaison stepup_user_companies
  // Supprimer les anciennes associations
  const { error: delErr } = await supabase
    .from('stepup_user_companies')
    .delete()
    .eq('stepup_user_id', stepupId);
  
  if (delErr) {
    console.error("Erreur de suppression stepup_user_companies:", delErr);
  }

  // Insérer les nouvelles associations
  if (companyIds && companyIds.length > 0) {
    const rows = companyIds.map(companyId => ({
      stepup_user_id: stepupId,
      company_id: companyId
    }));
    const { error: insErr } = await supabase
      .from('stepup_user_companies')
      .insert(rows);
    if (insErr) {
      console.error("Erreur d'insertion stepup_user_companies:", insErr);
    }
  }

  return user ? user[0] : null;
}

/**
 * Récupère l'ensemble des données de la base Supabase pour la sauvegarde.
 */
export async function fetchAllDatabaseData() {
  try {
    const [posts, companies, clients, stepupUsers, comments, appUsers, stepupUserCompanies] = await Promise.all([
      supabase.from('posts').select('*'),
      supabase.from('companies').select('*'),
      supabase.from('clients').select('*'),
      supabase.from('stepup_users').select('*'),
      supabase.from('comments').select('*'),
      supabase.from('app_users').select('*'),
      supabase.from('stepup_user_companies').select('*')
    ]);

    return {
      backup_date: new Date().toISOString(),
      posts: posts.data || [],
      companies: companies.data || [],
      clients: clients.data || [],
      stepup_users: stepupUsers.data || [],
      comments: comments.data || [],
      app_users: appUsers.data || [],
      stepup_user_companies: stepupUserCompanies.data || []
    };
  } catch (error) {
    console.error("Erreur lors de la récupération de la base Supabase pour sauvegarde:", error);
    throw error;
  }
}

/**
 * Récupère une valeur de configuration globale depuis la table app_settings.
 */
export async function getSetting(key) {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    
    if (error) throw error;
    return data ? data.value : null;
  } catch (err) {
    console.warn(`Erreur lors de la récupération du paramètre ${key}:`, err);
    return null;
  }
}

/**
 * Enregistre ou met à jour une valeur de configuration globale dans la table app_settings.
 */
export async function saveSetting(key, value) {
  try {
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key, value: String(value) });
    
    if (error) throw error;
    return true;
  } catch (err) {
    console.error(`Erreur lors de l'enregistrement du paramètre ${key}:`, err);
    throw err;
  }
}
