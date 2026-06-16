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
      app_users (
        role
      ),
      stepup_user_companies (
        company_id
      )
    `);
  
  if (error) {
    throw error;
  }
  return (data || []).map(u => ({
    ...u,
    user_role: u.app_users?.[0]?.role || 'stepup_user',
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

export async function authenticateUser(email, password) {
  try {
    const { data, error } = await supabase
      .rpc('rpc_authenticate_user', { p_email: email.trim().toLowerCase(), p_password: password });
    
    if (error) {
      if (error.code === 'P0001' || error.message?.includes('does not exist') || error.message?.includes('404')) {
        return authenticateUserFallback(email, password);
      }
      throw error;
    }
    return data;
  } catch (err) {
    console.warn("RPC authenticateUser failed, using legacy fallback:", err);
    return authenticateUserFallback(email, password);
  }
}

async function authenticateUserFallback(email, password) {
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

  if (data && data.clients) {
    data.company_id = data.clients.company_id;
  }

  return data;
}

/**
 * Rafraîchit les données de session d'un utilisateur à partir de son ID.
 */
export async function refreshUserSession(userId) {
  try {
    const { data, error } = await supabase
      .rpc('rpc_refresh_user_session', { p_user_id: userId });
    
    if (error) {
      if (error.code === 'P0001' || error.message?.includes('does not exist') || error.message?.includes('404')) {
        return refreshUserSessionFallback(userId);
      }
      throw error;
    }
    return data;
  } catch (err) {
    console.warn("RPC refreshUserSession failed, using legacy fallback:", err);
    return refreshUserSessionFallback(userId);
  }
}

async function refreshUserSessionFallback(userId) {
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

export async function createAppUser(user) {
  try {
    const { data, error } = await supabase
      .rpc('rpc_create_app_user', {
        p_id: user.id,
        p_email: user.email,
        p_password: user.password,
        p_name: user.name,
        p_role: user.role,
        p_client_id: user.client_id || null,
        p_stepup_user_id: user.stepup_user_id || null
      });
    
    if (error) {
      if (error.code === 'P0001' || error.message?.includes('does not exist') || error.message?.includes('404')) {
        return createAppUserFallback(user);
      }
      throw error;
    }
    return data;
  } catch (err) {
    console.warn("RPC rpc_create_app_user failed, using legacy fallback:", err);
    return createAppUserFallback(user);
  }
}

async function createAppUserFallback(user) {
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
  try {
    const { error: appUserErr } = await supabase
      .rpc('rpc_update_app_user', {
        p_target_column: 'client_id',
        p_target_id: clientId,
        p_name: clientData.name,
        p_email: clientData.email,
        p_password: loginData.password || null
      });

    if (appUserErr) {
      if (appUserErr.code === 'P0001' || appUserErr.message?.includes('does not exist') || appUserErr.message?.includes('404')) {
        await updateClientAppUserFallback(clientId, clientData, loginData);
      } else {
        throw appUserErr;
      }
    }
  } catch (err) {
    console.warn("RPC rpc_update_app_user failed, using legacy fallback:", err);
    await updateClientAppUserFallback(clientId, clientData, loginData);
  }

  return client ? client[0] : null;
}

async function updateClientAppUserFallback(clientId, clientData, loginData) {
  const appUserUpdate = {
    name: clientData.name,
    email: clientData.email.trim().toLowerCase()
  };
  if (loginData.password) {
    appUserUpdate.password = loginData.password;
  }

  const { error } = await supabase
    .from('app_users')
    .update(appUserUpdate)
    .eq('client_id', clientId);

  if (error) throw error;
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
  try {
    const { error: appUserErr } = await supabase
      .rpc('rpc_update_app_user', {
        p_target_column: 'stepup_user_id',
        p_target_id: stepupId,
        p_name: stepupData.name,
        p_email: stepupData.email,
        p_password: loginData.password || null,
        p_role: stepupData.user_role || null
      });

    if (appUserErr) {
      if (appUserErr.code === 'P0001' || appUserErr.message?.includes('does not exist') || appUserErr.message?.includes('404')) {
        await updateStepupAppUserFallback(stepupId, stepupData, loginData);
      } else {
        throw appUserErr;
      }
    }
  } catch (err) {
    console.warn("RPC rpc_update_app_user failed, using legacy fallback:", err);
    await updateStepupAppUserFallback(stepupId, stepupData, loginData);
  }

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

async function updateStepupAppUserFallback(stepupId, stepupData, loginData) {
  const appUserUpdate = {
    name: stepupData.name,
    email: stepupData.email.trim().toLowerCase()
  };
  if (stepupData.user_role) {
    appUserUpdate.role = stepupData.user_role;
  }
  if (loginData.password) {
    appUserUpdate.password = loginData.password;
  }

  const { error } = await supabase
    .from('app_users')
    .update(appUserUpdate)
    .eq('stepup_user_id', stepupId);

  if (error) throw error;
}

/**
 * Supprime un client et son compte utilisateur associé.
 */
export async function deleteClient(clientId) {
  // 1. Supprimer le compte de connexion dans app_users via RPC
  try {
    const { error: appUserErr } = await supabase
      .rpc('rpc_delete_app_user', {
        p_target_column: 'client_id',
        p_target_id: clientId
      });
    
    if (appUserErr) {
      if (appUserErr.code === 'P0001' || appUserErr.message?.includes('does not exist') || appUserErr.message?.includes('404')) {
        await deleteClientFallback(clientId);
      } else {
        throw appUserErr;
      }
    }
  } catch (err) {
    console.warn("RPC rpc_delete_app_user failed, using legacy fallback:", err);
    await deleteClientFallback(clientId);
  }

  // 2. Supprimer le profil client dans clients
  const { error: clientErr } = await supabase
    .from('clients')
    .delete()
    .eq('id', clientId);

  if (clientErr) throw clientErr;

  return true;
}

async function deleteClientFallback(clientId) {
  const { error: appUserErr } = await supabase
    .from('app_users')
    .delete()
    .eq('client_id', clientId);

  if (appUserErr) throw appUserErr;
}

/**
 * Supprime un collaborateur Step Up, ses liaisons entreprises et son compte de connexion.
 */
export async function deleteStepupUser(stepupId) {
  // 1. Supprimer les associations d'entreprises
  const { error: linkErr } = await supabase
    .from('stepup_user_companies')
    .delete()
    .eq('stepup_user_id', stepupId);

  if (linkErr) {
    console.error("Erreur de suppression des liaisons stepup_user_companies:", linkErr);
  }

  // 2. Supprimer le compte de connexion dans app_users via RPC
  try {
    const { error: appUserErr } = await supabase
      .rpc('rpc_delete_app_user', {
        p_target_column: 'stepup_user_id',
        p_target_id: stepupId
      });
    
    if (appUserErr) {
      if (appUserErr.code === 'P0001' || appUserErr.message?.includes('does not exist') || appUserErr.message?.includes('404')) {
        await deleteStepupUserFallback(stepupId);
      } else {
        throw appUserErr;
      }
    }
  } catch (err) {
    console.warn("RPC rpc_delete_app_user failed, using legacy fallback:", err);
    await deleteStepupUserFallback(stepupId);
  }

  // 3. Supprimer le profil dans stepup_users
  const { error: userErr } = await supabase
    .from('stepup_users')
    .delete()
    .eq('id', stepupId);

  if (userErr) throw userErr;

  return true;
}

async function deleteStepupUserFallback(stepupId) {
  const { error: appUserErr } = await supabase
    .from('app_users')
    .delete()
    .eq('stepup_user_id', stepupId);

  if (appUserErr) throw appUserErr;
}

/**
 * Récupère l'ensemble des données de la base Supabase pour la sauvegarde.
 */
export async function fetchAllDatabaseData() {
  try {
    let appUsersData = [];
    try {
      const { data, error } = await supabase.rpc('rpc_fetch_all_app_users');
      if (error) {
        if (error.code === 'P0001' || error.message?.includes('does not exist') || error.message?.includes('404')) {
          const { data: legacyData, error: legacyErr } = await supabase.from('app_users').select('*');
          if (legacyErr) throw legacyErr;
          appUsersData = legacyData || [];
        } else {
          throw error;
        }
      } else {
        appUsersData = data || [];
      }
    } catch (err) {
      console.warn("RPC rpc_fetch_all_app_users failed, using legacy fallback:", err);
      const { data: legacyData, error: legacyErr } = await supabase.from('app_users').select('*');
      if (legacyErr) throw legacyErr;
      appUsersData = legacyData || [];
    }

    const [posts, companies, clients, stepupUsers, comments, stepupUserCompanies] = await Promise.all([
      supabase.from('posts').select('*'),
      supabase.from('companies').select('*'),
      supabase.from('clients').select('*'),
      supabase.from('stepup_users').select('*'),
      supabase.from('comments').select('*'),
      supabase.from('stepup_user_companies').select('*')
    ]);

    return {
      backup_date: new Date().toISOString(),
      posts: posts.data || [],
      companies: companies.data || [],
      clients: clients.data || [],
      stepup_users: stepupUsers.data || [],
      comments: comments.data || [],
      app_users: appUsersData,
      stepup_user_companies: stepupUserCompanies.data || []
    };
  } catch (error) {
    console.error("Erreur lors de la récupération de la base Supabase pour sauvegarde:", error);
    throw error;
  }
}

/**
 * Permet à un utilisateur connecté de modifier son propre mot de passe.
 */
export async function changeUserPassword(userId, oldPassword, newPassword) {
  try {
    const { data, error } = await supabase
      .rpc('rpc_change_user_password', {
        p_user_id: userId,
        p_old_password: oldPassword,
        p_new_password: newPassword
      });
    
    if (error) {
      if (error.code === 'P0001' && (error.message?.includes('invalid_current_password') || error.message?.includes('user_not_found'))) {
        throw new Error(error.message);
      }
      if (error.message?.includes('does not exist') || error.message?.includes('404')) {
        return changeUserPasswordFallback(userId, oldPassword, newPassword);
      }
      throw error;
    }
    return data;
  } catch (err) {
    if (err.message === 'invalid_current_password' || err.message === 'user_not_found') {
      throw err;
    }
    console.warn("RPC rpc_change_user_password failed, using legacy fallback:", err);
    return changeUserPasswordFallback(userId, oldPassword, newPassword);
  }
}

async function changeUserPasswordFallback(userId, oldPassword, newPassword) {
  const { data, error } = await supabase
    .from('app_users')
    .select('password')
    .eq('id', userId)
    .single();

  if (error || !data) {
    throw new Error('user_not_found');
  }

  if (data.password !== oldPassword) {
    throw new Error('invalid_current_password');
  }

  const { error: updateErr } = await supabase
    .from('app_users')
    .update({ password: newPassword })
    .eq('id', userId);

  if (updateErr) throw updateErr;
  return true;
}

/**
 * Permet de réinitialiser le mot de passe d'un utilisateur par son e-mail (mot de passe oublié).
 */
export async function resetPasswordByEmail(email, newPassword) {
  try {
    const { data, error } = await supabase
      .rpc('rpc_reset_password_by_email', {
        p_email: email.trim().toLowerCase(),
        p_new_password: newPassword
      });
    
    if (error) {
      if (error.code === 'P0001' && error.message?.includes('email_not_found')) {
        throw new Error('email_not_found');
      }
      if (error.message?.includes('does not exist') || error.message?.includes('404')) {
        return resetPasswordByEmailFallback(email, newPassword);
      }
      throw error;
    }
    return data;
  } catch (err) {
    if (err.message === 'email_not_found') {
      throw err;
    }
    console.warn("RPC rpc_reset_password_by_email failed, using legacy fallback:", err);
    return resetPasswordByEmailFallback(email, newPassword);
  }
}

async function resetPasswordByEmailFallback(email, newPassword) {
  const formattedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from('app_users')
    .select('id')
    .eq('email', formattedEmail)
    .maybeSingle();

  if (error || !data) {
    throw new Error('email_not_found');
  }

  const { error: updateErr } = await supabase
    .from('app_users')
    .update({ password: newPassword })
    .eq('email', formattedEmail);

  if (updateErr) throw updateErr;
  return true;
}

/**
 * Associe un token de réinitialisation à un e-mail utilisateur.
 */
export async function setResetToken(email, token) {
  try {
    const { data, error } = await supabase
      .rpc('rpc_set_reset_token', {
        p_email: email.trim().toLowerCase(),
        p_token: token
      });
    
    if (error) {
      if (error.code === 'P0001' && error.message?.includes('email_not_found')) {
        throw new Error('email_not_found');
      }
      if (error.message?.includes('does not exist') || error.message?.includes('404')) {
        return setResetTokenFallback(email, token);
      }
      throw error;
    }
    return data;
  } catch (err) {
    if (err.message === 'email_not_found') {
      throw err;
    }
    console.warn("RPC rpc_set_reset_token failed, using legacy fallback:", err);
    return setResetTokenFallback(email, token);
  }
}

async function setResetTokenFallback(email, token) {
  const formattedEmail = email.trim().toLowerCase();
  
  // 1. Vérifier si l'utilisateur existe
  const { data, error } = await supabase
    .from('app_users')
    .select('id')
    .eq('email', formattedEmail)
    .maybeSingle();

  if (error || !data) {
    throw new Error('email_not_found');
  }

  // 2. Mettre à jour avec le token de réinitialisation et la date d'expiration
  const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 heure
  const { error: updateErr } = await supabase
    .from('app_users')
    .update({ 
      reset_token: token, 
      reset_token_expires_at: expiresAt 
    })
    .eq('email', formattedEmail);

  if (updateErr) throw updateErr;
  return true;
}

/**
 * Réinitialise le mot de passe d'un utilisateur possédant un token de réinitialisation valide.
 */
export async function resetPasswordByToken(token, newPassword) {
  try {
    const { data, error } = await supabase
      .rpc('rpc_reset_password_by_token', {
        p_token: token,
        p_new_password: newPassword
      });
    
    if (error) {
      if (error.code === 'P0001' && error.message?.includes('invalid_or_expired_token')) {
        throw new Error('invalid_or_expired_token');
      }
      if (error.message?.includes('does not exist') || error.message?.includes('404')) {
        return resetPasswordByTokenFallback(token, newPassword);
      }
      throw error;
    }
    return data;
  } catch (err) {
    if (err.message === 'invalid_or_expired_token') {
      throw err;
    }
    console.warn("RPC rpc_reset_password_by_token failed, using legacy fallback:", err);
    return resetPasswordByTokenFallback(token, newPassword);
  }
}

async function resetPasswordByTokenFallback(token, newPassword) {
  // 1. Trouver l'utilisateur possédant ce token et non expiré
  const { data, error } = await supabase
    .from('app_users')
    .select('id, email, reset_token_expires_at')
    .eq('reset_token', token)
    .maybeSingle();

  if (error || !data) {
    throw new Error('invalid_or_expired_token');
  }

  const isExpired = new Date(data.reset_token_expires_at) < new Date();
  if (isExpired) {
    throw new Error('invalid_or_expired_token');
  }

  // 2. Mettre à jour le mot de passe
  const { error: updateErr } = await supabase
    .from('app_users')
    .update({ 
      password: newPassword,
      reset_token: null,
      reset_token_expires_at: null
    })
    .eq('email', data.email);

  if (updateErr) throw updateErr;
  return true;
}

/**
 * Envoie un e-mail de réinitialisation via l'API Resend en passant par un RPC Supabase (contourne CORS).
 */
export async function sendResetEmailViaRpc(email, token, origin) {
  const apiKey = "re_bUjzhZmN_MJKrjWwh9fhqWgfRAgAk61x8";
  const { data, error } = await supabase
    .rpc('rpc_send_reset_email', {
      p_email: email,
      p_token: token,
      p_api_key: apiKey,
      p_origin: origin
    });

  if (error) {
    throw error;
  }
  return data;
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
