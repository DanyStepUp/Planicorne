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
export async function fetchPosts() {
  const { data, error } = await supabase
    .from('posts')
    .select('*, companies(name)')
    .order('updatedAt', { ascending: false });

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
    .select('id, name, email, role');
  
  if (error) {
    throw error;
  }
  return data || [];
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
      contract_newsletter: company.contract_newsletter || 0
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
export async function insertStepupUser(user) {
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
