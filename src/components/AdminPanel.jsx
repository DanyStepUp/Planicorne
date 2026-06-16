import { useState } from 'react';
import {
  Plus,
  Building,
  User,
  Users,
  Save,
  ShieldAlert,
  Edit,
  Trash2
} from 'lucide-react';
import {
  insertCompany,
  insertClient,
  insertStepupUser,
  createAppUser,
  updateCompany,
  updateClient,
  updateStepupUser,
  deleteClient,
  deleteStepupUser
} from '../utils/supabaseService';
import SecureMedia from './SecureMedia';
import './AdminPanel.css';

export default function AdminPanel({
  companies = [],
  clients = [],
  stepupUsers = [],
  onRefreshData,
  currentUser
}) {
  const filteredStepupUsers = currentUser?.role?.trim().toLowerCase() === 'manager'
    ? stepupUsers.filter(u => u.user_role !== 'super_manager')
    : stepupUsers;
  const [activeFormTab, setActiveFormTab] = useState('company'); // company, client, stepup
  const [activeListTab, setActiveListTab] = useState('companies'); // companies, clients, stepup

  // Edit states
  const [editingCompany, setEditingCompany] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [editingStepup, setEditingStepup] = useState(null);

  // Form states - Company
  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  const [contractDetails, setContractDetails] = useState({
    linkedin: { count: 0, period: 'month' },
    facebook: { count: 0, period: 'month' },
    instagram: { count: 0, period: 'month' },
    google: { count: 0, period: 'month' },
    blog: { count: 0, period: 'month' },
    newsletter: { count: 0, period: 'month' },
    unquantifiable: ''
  });

  // Form states - Client User
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPassword, setClientPassword] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  // Form states - Step Up User
  const [stepupName, setStepupName] = useState('');
  const [stepupEmail, setStepupEmail] = useState('');
  const [stepupPassword, setStepupPassword] = useState('');
  const [stepupRole, setStepupRole] = useState('Rédacteur');
  const [stepupUserRole, setStepupUserRole] = useState('stepup_user');
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);

  const [loading, setLoading] = useState(false);

  // Helper to extract Google Drive ID
  const extractDriveId = (url) => {
    if (!url) return '';
    const matchD = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (matchD) return matchD[1];
    const matchId = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (matchId) return matchId[1];
    return url.trim(); // Return raw if no pattern matched
  };

  const handleCancelEdit = () => {
    setEditingCompany(null);
    setEditingClient(null);
    setEditingStepup(null);

    // Reset company form
    setCompanyName('');
    setLogoUrl('');

    setContractDetails({
      linkedin: { count: 0, period: 'month' },
      facebook: { count: 0, period: 'month' },
      instagram: { count: 0, period: 'month' },
      google: { count: 0, period: 'month' },
      blog: { count: 0, period: 'month' },
      newsletter: { count: 0, period: 'month' },
      unquantifiable: ''
    });

    // Reset client form
    setClientName('');
    setClientEmail('');
    setClientPassword('');
    setSelectedCompanyId('');

    // Reset stepup form
    setStepupName('');
    setStepupEmail('');
    setStepupPassword('');
    setStepupRole('Rédacteur');
    setStepupUserRole('stepup_user');
    setSelectedCompanyIds([]);
  };

  const handleStartEditCompany = (comp) => {
    handleCancelEdit();
    setEditingCompany(comp);
    setCompanyName(comp.name);
    setLogoUrl(comp.logo_drive_id ? `https://drive.google.com/file/d/${comp.logo_drive_id}/view` : '');

    let details = null;
    if (comp.contract_details) {
      try {
        details = typeof comp.contract_details === 'string'
          ? JSON.parse(comp.contract_details)
          : comp.contract_details;
      } catch (e) {
        console.error("Failed to parse contract_details:", e);
      }
    }

    let unquantifiableText = '';
    if (typeof details?.unquantifiable === 'string') {
      unquantifiableText = details.unquantifiable;
    } else if (details?.unquantifiable && typeof details.unquantifiable === 'object') {
      const active = [];
      if (details.unquantifiable.google_reviews) active.push("Gestion des avis Google My Business");
      if (details.unquantifiable.trustpilot_reviews) active.push("Gestion des avis Trustpilot");
      unquantifiableText = active.join(', ');
    }

    setContractDetails({
      linkedin: details?.linkedin || { count: comp.contract_linkedin || 0, period: 'month' },
      facebook: details?.facebook || { count: comp.contract_facebook || 0, period: 'month' },
      instagram: details?.instagram || { count: comp.contract_instagram || 0, period: 'month' },
      google: details?.google || { count: comp.contract_google || 0, period: 'month' },
      blog: details?.blog || { count: comp.contract_blog || 0, period: 'month' },
      newsletter: details?.newsletter || { count: comp.contract_newsletter || 0, period: 'month' },
      unquantifiable: unquantifiableText
    });


    setActiveFormTab('company');
  };

  const handleStartEditClient = (client) => {
    handleCancelEdit();
    setEditingClient(client);
    setClientName(client.name);
    setClientEmail(client.email);
    setSelectedCompanyId(client.company_id || '');
    setActiveFormTab('client');
  };

  const handleStartEditStepup = (user) => {
    if (user.user_role === 'super_manager' && !['admin', 'super_manager'].includes(currentUser?.role?.trim().toLowerCase())) {
      alert("Action non autorisée.");
      return;
    }
    handleCancelEdit();
    setEditingStepup(user);
    setStepupName(user.name);
    setStepupEmail(user.email);
    setStepupRole(user.role || 'Rédacteur');
    setStepupUserRole(user.user_role || 'stepup_user');
    setSelectedCompanyIds(user.company_ids || []);
    setActiveFormTab('stepup');
  };

  const handleSaveCompany = async (e) => {
    e.preventDefault();
    if (!companyName.trim()) return;
    setLoading(true);

    const driveId = extractDriveId(logoUrl);

    const companyData = {
      name: companyName.trim(),
      logo_drive_id: driveId || null,
      contract_linkedin: parseInt(contractDetails.linkedin.count) || 0,
      contract_facebook: parseInt(contractDetails.facebook.count) || 0,
      contract_instagram: parseInt(contractDetails.instagram.count) || 0,
      contract_google: parseInt(contractDetails.google.count) || 0,
      contract_blog: contractDetails.blog.period === 'month' ? parseInt(contractDetails.blog.count) || 0 : 0,
      contract_newsletter: contractDetails.newsletter.period === 'month' ? parseInt(contractDetails.newsletter.count) || 0 : 0,
      contract_details: contractDetails
    };

    try {
      if (editingCompany) {
        await updateCompany(editingCompany.id, companyData);

        alert(`L'entreprise "${companyName}" a été mise à jour avec succès !`);
        setEditingCompany(null);
      } else {
        const companyId = 'comp-' + Date.now();
        await insertCompany({
          id: companyId,
          ...companyData
        });

        alert(`L'entreprise "${companyName}" a été enregistrée avec succès !`);
      }

      setCompanyName('');
      setLogoUrl('');

      setContractDetails({
        linkedin: { count: 0, period: 'month' },
        facebook: { count: 0, period: 'month' },
        instagram: { count: 0, period: 'month' },
        google: { count: 0, period: 'month' },
        blog: { count: 0, period: 'month' },
        newsletter: { count: 0, period: 'month' },
        unquantifiable: ''
      });

      if (onRefreshData) await onRefreshData();
    } catch (err) {
      console.error(err);
      const errMsg = err?.message || '';
      if (errMsg.includes('contract_') || errMsg.includes('logo_drive_id') || errMsg.includes('column') || err?.code === '42703') {
        alert(
          "Erreur lors de l'enregistrement de l'entreprise. Des colonnes de configuration de contrat ou de logo sont manquantes dans la table 'companies' de votre base de données Supabase.\n\n" +
          "Pour corriger ce problème, veuillez exécuter le script de migration SQL suivant dans le SQL Editor de Supabase :\n\n" +
          "ALTER TABLE public.companies \n" +
          "ADD COLUMN IF NOT EXISTS logo_drive_id TEXT,\n" +
          "ADD COLUMN IF NOT EXISTS contract_linkedin INTEGER DEFAULT 0,\n" +
          "ADD COLUMN IF NOT EXISTS contract_facebook INTEGER DEFAULT 0,\n" +
          "ADD COLUMN IF NOT EXISTS contract_instagram INTEGER DEFAULT 0,\n" +
          "ADD COLUMN IF NOT EXISTS contract_google INTEGER DEFAULT 0,\n" +
          "ADD COLUMN IF NOT EXISTS contract_blog INTEGER DEFAULT 0,\n" +
          "ADD COLUMN IF NOT EXISTS contract_newsletter INTEGER DEFAULT 0,\n" +
          "ADD COLUMN IF NOT EXISTS contract_details JSONB;"
        );
      } else {
        alert("Erreur lors de l'enregistrement de l'entreprise. Assurez-vous d'avoir exécuté la migration SQL.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClient = async (e) => {
    e.preventDefault();
    if (!clientName.trim() || !clientEmail.trim() || (!editingClient && !clientPassword.trim()) || !selectedCompanyId) {
      alert("Veuillez remplir les champs requis et sélectionner une entreprise.");
      return;
    }
    setLoading(true);

    try {
      if (editingClient) {
        await updateClient(editingClient.id, {
          name: clientName.trim(),
          email: clientEmail.trim(),
          company_id: selectedCompanyId
        }, {
          password: clientPassword.trim() || undefined
        });

        alert(`L'accès client de "${clientName}" a été mis à jour avec succès !`);
        setEditingClient(null);
      } else {
        const clientId = 'client-' + Date.now();
        const appUserId = 'app-user-' + Date.now();

        // 1. Create client profile
        await insertClient({
          id: clientId,
          name: clientName.trim(),
          email: clientEmail.trim(),
          company_id: selectedCompanyId
        });

        // 2. Create login account
        await createAppUser({
          id: appUserId,
          email: clientEmail.trim().toLowerCase(),
          password: clientPassword.trim(),
          name: clientName.trim(),
          role: 'client',
          client_id: clientId
        });

        alert(`L'utilisateur client "${clientName}" a été créé et lié avec succès !`);
      }

      setClientName('');
      setClientEmail('');
      setClientPassword('');
      setSelectedCompanyId('');

      if (onRefreshData) await onRefreshData();
    } catch (err) {
      console.error(err);
      if (err?.code === '23505' || err?.message?.includes('already exists')) {
        alert("Cette adresse e-mail est déjà utilisée par un autre utilisateur (client ou collaborateur).");
      } else {
        alert("Erreur lors de l'enregistrement du compte client.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveStepupUser = async (e) => {
    e.preventDefault();
    if (!stepupName.trim() || !stepupEmail.trim() || (!editingStepup && !stepupPassword.trim())) {
      alert("Veuillez remplir tous les champs requis.");
      return;
    }
    setLoading(true);

    if (stepupUserRole === 'super_manager' && !['admin', 'super_manager'].includes(currentUser?.role?.trim().toLowerCase())) {
      alert("Vous n'avez pas l'autorisation d'attribuer le rôle de Super Manager.");
      setLoading(false);
      return;
    }

    try {
      if (editingStepup) {
        await updateStepupUser(editingStepup.id, {
          name: stepupName.trim(),
          email: stepupEmail.trim(),
          role: stepupRole,
          user_role: stepupUserRole
        }, {
          password: stepupPassword.trim() || undefined
        }, selectedCompanyIds);

        alert(`Le collaborateur Step Up "${stepupName}" a été mis à jour avec succès !`);
        setEditingStepup(null);
      } else {
        const stepupUserId = 'user-' + Date.now();
        const appUserId = 'app-user-' + Date.now();

        // 1. Create Step Up profile
        await insertStepupUser({
          id: stepupUserId,
          name: stepupName.trim(),
          email: stepupEmail.trim(),
          role: stepupRole
        }, selectedCompanyIds);

        // 2. Create login account
        await createAppUser({
          id: appUserId,
          email: stepupEmail.trim().toLowerCase(),
          password: stepupPassword.trim(),
          name: stepupName.trim(),
          role: stepupUserRole,
          stepup_user_id: stepupUserId
        });

        alert(`Le collaborateur Step Up "${stepupName}" a été ajouté avec succès !`);
      }

      setStepupName('');
      setStepupEmail('');
      setStepupPassword('');
      setStepupRole('Rédacteur');
      setStepupUserRole('stepup_user');
      setSelectedCompanyIds([]);

      if (onRefreshData) await onRefreshData();
    } catch (err) {
      console.error(err);
      if (err?.code === '23505' || err?.message?.includes('already exists')) {
        alert("Cette adresse e-mail est déjà utilisée par un autre utilisateur (client ou collaborateur).");
      } else {
        alert("Erreur lors de l'enregistrement du collaborateur Step Up.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClient = async (client) => {
    if (!window.confirm(`Voulez-vous vraiment supprimer le client "${client.name}" ? Cette action est irréversible.`)) {
      return;
    }
    setLoading(true);
    try {
      await deleteClient(client.id);
      alert(`Le client "${client.name}" a été supprimé avec succès.`);
      if (onRefreshData) await onRefreshData();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la suppression du client.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStepupUser = async (user) => {
    if (user.user_role === 'super_manager' && !['admin', 'super_manager'].includes(currentUser?.role?.trim().toLowerCase())) {
      alert("Action non autorisée.");
      return;
    }
    if (!window.confirm(`Voulez-vous vraiment supprimer le collaborateur "${user.name}" ? Cette action est irréversible.`)) {
      return;
    }
    setLoading(true);
    try {
      await deleteStepupUser(user.id);
      alert(`Le collaborateur "${user.name}" a été supprimé avec succès.`);
      if (onRefreshData) await onRefreshData();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la suppression du collaborateur.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-panel-container animate-fade-in">
      <div className="admin-header glass-panel">
        <ShieldAlert size={28} className="admin-header-icon" />
        <div>
          <h2>Espace Administration</h2>
          <p>Configurez les entreprises clientes, leurs contrats de posts et gérez les comptes d'accès de la plateforme.</p>
        </div>
      </div>

      <div className="admin-layout">
        {/* COLONNE GAUCHE - FORMULAIRES DE CRÉATION/MODIFICATION */}
        <div className="admin-forms-column glass-panel">
          <div className="admin-tab-nav">
            <button
              className={`admin-tab-btn ${activeFormTab === 'company' ? 'active' : ''}`}
              onClick={() => setActiveFormTab('company')}
              disabled={!!editingCompany || !!editingClient || !!editingStepup}
            >
              <Building size={16} />
              <span>Entreprise & Contrat</span>
            </button>
            <button
              className={`admin-tab-btn ${activeFormTab === 'client' ? 'active' : ''}`}
              onClick={() => setActiveFormTab('client')}
              disabled={!!editingCompany || !!editingClient || !!editingStepup}
            >
              <User size={16} />
              <span>Utilisateur Client</span>
            </button>
            <button
              className={`admin-tab-btn ${activeFormTab === 'stepup' ? 'active' : ''}`}
              onClick={() => setActiveFormTab('stepup')}
              disabled={!!editingCompany || !!editingClient || !!editingStepup}
            >
              <Users size={16} />
              <span>Membre Step Up</span>
            </button>
          </div>

          <div className="admin-tab-body">
            {/* FORMULAIRE 1 : AJOUT/ÉDITION ENTREPRISE & CONTRAT */}
            {activeFormTab === 'company' && (
              <form onSubmit={handleSaveCompany} className="admin-form animate-fade-in">
                <h3>{editingCompany ? `Modifier l'Entreprise : ${editingCompany.name}` : 'Nouvelle Entreprise'}</h3>

                <div className="form-group">
                  <label>Nom de l'entreprise</label>
                  <input
                    type="text"
                    placeholder="Ex: Acapela Corp"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Lien Google Drive du Logo (Optionnel)</label>
                  <input
                    type="text"
                    placeholder="Coller le lien de partage du fichier logo..."
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                  />
                  <span className="form-hint">Le logo sera extrait et chargé dynamiquement sans surcharger la base de données.</span>
                </div>

                <div className="contract-grid-title">Détails de production & Fréquence par canal :</div>

                <div className="contract-platforms-list">
                  {/* 1. Facebook */}
                  <div className="contract-platform-row">
                    <label>Facebook</label>
                    <div className="platform-input-group">
                      <input
                        type="number"
                        min="0"
                        value={contractDetails.facebook.count}
                        onChange={(e) => setContractDetails(prev => ({
                          ...prev,
                          facebook: { ...prev.facebook, count: parseInt(e.target.value) || 0 }
                        }))}
                      />
                      <span className="input-period-static">par mois</span>
                    </div>
                  </div>

                  {/* 2. Instagram */}
                  <div className="contract-platform-row">
                    <label>Instagram</label>
                    <div className="platform-input-group">
                      <input
                        type="number"
                        min="0"
                        value={contractDetails.instagram.count}
                        onChange={(e) => setContractDetails(prev => ({
                          ...prev,
                          instagram: { ...prev.instagram, count: parseInt(e.target.value) || 0 }
                        }))}
                      />
                      <span className="input-period-static">par mois</span>
                    </div>
                  </div>

                  {/* 3. LinkedIn */}
                  <div className="contract-platform-row">
                    <label>LinkedIn</label>
                    <div className="platform-input-group">
                      <input
                        type="number"
                        min="0"
                        value={contractDetails.linkedin.count}
                        onChange={(e) => setContractDetails(prev => ({
                          ...prev,
                          linkedin: { ...prev.linkedin, count: parseInt(e.target.value) || 0 }
                        }))}
                      />
                      <span className="input-period-static">par mois</span>
                    </div>
                  </div>

                  {/* 4. Google Posts */}
                  <div className="contract-platform-row">
                    <label>Google Posts</label>
                    <div className="platform-input-group">
                      <input
                        type="number"
                        min="0"
                        value={contractDetails.google.count}
                        onChange={(e) => setContractDetails(prev => ({
                          ...prev,
                          google: { ...prev.google, count: parseInt(e.target.value) || 0 }
                        }))}
                      />
                      <span className="input-period-static">par mois</span>
                    </div>
                  </div>

                  {/* 5. Billet de blog */}
                  <div className="contract-platform-row">
                    <label>Billet de blog</label>
                    <div className="platform-input-group">
                      <input
                        type="number"
                        min="0"
                        value={contractDetails.blog.count}
                        onChange={(e) => setContractDetails(prev => ({
                          ...prev,
                          blog: { ...prev.blog, count: parseInt(e.target.value) || 0 }
                        }))}
                      />
                      <select
                        value={contractDetails.blog.period}
                        onChange={(e) => setContractDetails(prev => ({
                          ...prev,
                          blog: { ...prev.blog, period: e.target.value }
                        }))}
                        style={{ background: 'var(--surface-color)', color: 'var(--text-main)', border: '1px solid var(--surface-border)' }}
                      >
                        <option value="month">par mois</option>
                        <option value="2_months">tous les 2 mois</option>
                        <option value="3_months">tous les 3 mois</option>
                      </select>
                    </div>
                  </div>

                  {/* 6. Newsletter */}
                  <div className="contract-platform-row">
                    <label>Newsletter</label>
                    <div className="platform-input-group">
                      <input
                        type="number"
                        min="0"
                        value={contractDetails.newsletter.count}
                        onChange={(e) => setContractDetails(prev => ({
                          ...prev,
                          newsletter: { ...prev.newsletter, count: parseInt(e.target.value) || 0 }
                        }))}
                      />
                      <select
                        value={contractDetails.newsletter.period}
                        onChange={(e) => setContractDetails(prev => ({
                          ...prev,
                          newsletter: { ...prev.newsletter, period: e.target.value }
                        }))}
                        style={{ background: 'var(--surface-color)', color: 'var(--text-main)', border: '1px solid var(--surface-border)' }}
                      >
                        <option value="month">par mois</option>
                        <option value="2_months">tous les 2 mois</option>
                        <option value="3_months">tous les 3 mois</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '1.25rem', marginBottom: '1.25rem' }}>
                  <label htmlFor="company-unquantifiable">Contrats non quantifiables (Optionnel)</label>
                  <input
                    id="company-unquantifiable"
                    type="text"
                    placeholder="Ex: Gestion des avis Google My Business, Trustpilot, etc."
                    value={contractDetails.unquantifiable || ''}
                    onChange={(e) => setContractDetails(prev => ({
                      ...prev,
                      unquantifiable: e.target.value
                    }))}
                    style={{ padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-main)', width: '100%', boxSizing: 'border-box' }}
                  />
                  <span className="form-hint" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Saisissez le détail textuel des contrats non mesurables.</span>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="submit" className="btn btn-primary-admin" style={{ flex: 1 }} disabled={loading || !companyName.trim()}>
                    <Save size={18} />
                    <span>{editingCompany ? "Mettre à jour" : "Enregistrer l'entreprise"}</span>
                  </button>
                  {editingCompany && (
                    <button type="button" className="btn btn-secondary-admin" style={{ flex: '0 0 auto', marginTop: '1rem', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--surface-border)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }} onClick={handleCancelEdit}>
                      Annuler
                    </button>
                  )}
                </div>
              </form>
            )}

            {/* FORMULAIRE 2 : AJOUT/ÉDITION UTILISATEUR CLIENT */}
            {activeFormTab === 'client' && (
              <form onSubmit={handleSaveClient} className="admin-form animate-fade-in">
                <h3>{editingClient ? `Modifier l'Accès Client : ${editingClient.name}` : 'Créer un accès Client'}</h3>

                <div className="form-group">
                  <label>Entreprise rattachée</label>
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    required
                  >
                    <option value="">-- Sélectionner l'entreprise --</option>
                    {companies.map(comp => (
                      <option key={comp.id} value={comp.id}>{comp.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Nom complet</label>
                  <input
                    type="text"
                    placeholder="Ex: Rakoto Rasoa"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>E-mail de connexion</label>
                  <input
                    type="email"
                    placeholder="Ex: votre@email.com"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Mot de passe {editingClient && <span style={{ fontWeight: 'normal', color: 'var(--text-muted)', fontSize: '0.8rem' }}>(Laisser vide si inchangé)</span>}</label>
                  <input
                    type="password"
                    placeholder={editingClient ? "Saisir un nouveau mot de passe..." : "Créer un mot de passe d'accès..."}
                    value={clientPassword}
                    onChange={(e) => setClientPassword(e.target.value)}
                    required={!editingClient}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="submit" className="btn btn-primary-admin" style={{ flex: 1 }} disabled={loading || !selectedCompanyId}>
                    {editingClient ? <Save size={18} /> : <Plus size={18} />}
                    <span>{editingClient ? "Mettre à jour" : "Créer le compte Client"}</span>
                  </button>
                  {editingClient && (
                    <button type="button" className="btn btn-secondary-admin" style={{ flex: '0 0 auto', marginTop: '1rem', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--surface-border)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }} onClick={handleCancelEdit}>
                      Annuler
                    </button>
                  )}
                </div>
              </form>
            )}

            {/* FORMULAIRE 3 : AJOUT/ÉDITION MEMBRE STEP UP */}
            {activeFormTab === 'stepup' && (
              <form onSubmit={handleSaveStepupUser} className="admin-form animate-fade-in">
                <h3>{editingStepup ? `Modifier le Collaborateur : ${editingStepup.name}` : 'Ajouter un collaborateur Step Up'}</h3>

                <div className="form-group">
                  <label>Nom complet</label>
                  <input
                    type="text"
                    placeholder="Ex: Chloé StepUp"
                    value={stepupName}
                    onChange={(e) => setStepupName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Rôle interne</label>
                  <input
                    type="text"
                    placeholder="Ex: Rédactrice, Graphiste, Chef de Projet"
                    value={stepupRole}
                    onChange={(e) => setStepupRole(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Permissions</label>
                  <select
                    value={stepupUserRole}
                    onChange={(e) => setStepupUserRole(e.target.value)}
                    required
                  >
                    <option value="stepup_user">Collaborateur Step Up</option>
                    <option value="manager">Manager Step Up</option>
                    {['admin', 'super_manager'].includes(currentUser?.role?.trim().toLowerCase()) && (
                      <option value="super_manager">Super Manager Step Up</option>
                    )}
                  </select>
                </div>

                <div className="form-group">
                  <label>E-mail professionnel</label>
                  <input
                    type="email"
                    placeholder="Ex: chloe@stepup.fr"
                    value={stepupEmail}
                    onChange={(e) => setStepupEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Mot de passe {editingStepup && <span style={{ fontWeight: 'normal', color: 'var(--text-muted)', fontSize: '0.8rem' }}>(Laisser vide si inchangé)</span>}</label>
                  <input
                    type="password"
                    placeholder={editingStepup ? "Saisir un nouveau mot de passe..." : "Mot de passe provisoire..."}
                    value={stepupPassword}
                    onChange={(e) => setStepupPassword(e.target.value)}
                    required={!editingStepup}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label>Entreprises rattachées</label>
                  <div className="admin-checkbox-list" style={{
                    maxHeight: '150px',
                    overflowY: 'auto',
                    border: '1px solid var(--surface-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.5rem',
                    background: 'rgba(255, 255, 255, 0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem'
                  }}>
                    {companies.length > 0 ? (
                      companies.map(comp => {
                        const isChecked = selectedCompanyIds.includes(comp.id);
                        return (
                          <label key={comp.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCompanyIds(prev => [...prev, comp.id]);
                                } else {
                                  setSelectedCompanyIds(prev => prev.filter(id => id !== comp.id));
                                }
                              }}
                            />
                            <span>{comp.name}</span>
                          </label>
                        );
                      })
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0.25rem' }}>Aucune entreprise enregistrée</span>
                    )}
                  </div>
                  <span className="form-hint" style={{ fontSize: '0.725rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                    Cochez les entreprises auxquelles associer ce collaborateur.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="submit" className="btn btn-primary-admin" style={{ flex: 1 }} disabled={loading}>
                    {editingStepup ? <Save size={18} /> : <Plus size={18} />}
                    <span>{editingStepup ? "Mettre à jour" : "Enregistrer le collaborateur"}</span>
                  </button>
                  {editingStepup && (
                    <button type="button" className="btn btn-secondary-admin" style={{ flex: '0 0 auto', marginTop: '1rem', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--surface-border)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }} onClick={handleCancelEdit}>
                      Annuler
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>

        {/* COLONNE DROITE - LISTE DE TOUTES LES ENTITÉS SÉLECTIONNABLES */}
        <div className="admin-list-column glass-panel">
          <div className="admin-tab-nav" style={{ marginBottom: '1.25rem' }}>
            <button
              className={`admin-tab-btn ${activeListTab === 'companies' ? 'active' : ''}`}
              onClick={() => setActiveListTab('companies')}
              style={{ padding: '0.75rem 0.25rem' }}
            >
              <Building size={15} />
              <span style={{ fontSize: '0.8rem' }}>Entreprises ({companies.length})</span>
            </button>
            <button
              className={`admin-tab-btn ${activeListTab === 'clients' ? 'active' : ''}`}
              onClick={() => setActiveListTab('clients')}
              style={{ padding: '0.75rem 0.25rem' }}
            >
              <User size={15} />
              <span style={{ fontSize: '0.8rem' }}>Clients ({clients.length})</span>
            </button>
            <button
              className={`admin-tab-btn ${activeListTab === 'stepup' ? 'active' : ''}`}
              onClick={() => setActiveListTab('stepup')}
              style={{ padding: '0.75rem 0.25rem' }}
            >
              <Users size={15} />
              <span style={{ fontSize: '0.8rem' }}>Membres ({filteredStepupUsers.length})</span>
            </button>
          </div>

          <div className="admin-companies-table-wrapper" style={{ border: 'none' }}>
            {/* LISTE 1 : ENTREPRISES */}
            {activeListTab === 'companies' && (
              companies.length > 0 ? (
                <table className="admin-companies-table">
                  <thead>
                    <tr>
                      <th style={{ width: '45px' }}>Logo</th>
                      <th>Entreprise</th>
                      <th>Contrat (Mensuel)</th>
                      <th style={{ width: '50px', textAlign: 'center' }}>Modifier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map(comp => (
                      <tr key={comp.id}>
                        <td className="company-logo-cell">
                          {comp.logo_drive_id ? (
                            <div className="admin-logo-wrapper">
                              <SecureMedia
                                driveId={comp.logo_drive_id}
                                type="image/png"
                                alt="Logo"
                              />
                            </div>
                          ) : (
                            <div className="admin-logo-fallback">🏢</div>
                          )}
                        </td>
                        <td className="company-name-cell">
                          <strong>{comp.name}</strong>
                        </td>
                        <td className="company-contract-cell">
                          <div className="contract-badge-grid">
                            {comp.contract_linkedin > 0 && <span className="c-badge badge-ln">LI: {comp.contract_linkedin}</span>}
                            {comp.contract_facebook > 0 && <span className="c-badge badge-fb">FB: {comp.contract_facebook}</span>}
                            {comp.contract_instagram > 0 && <span className="c-badge badge-ig">IG: {comp.contract_instagram}</span>}
                            {comp.contract_google > 0 && <span className="c-badge badge-g">GMB: {comp.contract_google}</span>}
                            {comp.contract_blog > 0 && <span className="c-badge badge-blog">Blog: {comp.contract_blog}</span>}
                            {comp.contract_newsletter > 0 && <span className="c-badge badge-mail">Mail: {comp.contract_newsletter}</span>}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn-option"
                            style={{ padding: '0.4rem', background: 'rgba(25, 140, 204, 0.1)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'var(--primary-color)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => handleStartEditCompany(comp)}
                          >
                            <Edit size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="admin-empty-state">
                  <Building size={48} style={{ opacity: 0.15, marginBottom: '1rem' }} />
                  <p>Aucune entreprise cliente enregistrée.</p>
                </div>
              )
            )}

            {/* LISTE 2 : UTILISATEURS CLIENTS */}
            {activeListTab === 'clients' && (
              clients.length > 0 ? (
                <table className="admin-companies-table">
                  <thead>
                    <tr>
                      <th>Nom complet</th>
                      <th>Adresse e-mail</th>
                      <th>Rattachement</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(client => (
                      <tr key={client.id}>
                        <td className="company-name-cell">
                          <strong>{client.name}</strong>
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{client.email}</td>
                        <td>
                          {client.companies ? (
                            <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
                              🏢 {client.companies.name}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Non rattachée</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                            <button
                              type="button"
                              className="btn-option"
                              style={{ padding: '0.4rem', background: 'rgba(25, 140, 204, 0.1)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'var(--primary-color)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                              onClick={() => handleStartEditClient(client)}
                              title="Modifier"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn-option"
                              style={{ padding: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#ef4444', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                              onClick={() => handleDeleteClient(client)}
                              title="Supprimer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="admin-empty-state">
                  <User size={48} style={{ opacity: 0.15, marginBottom: '1rem' }} />
                  <p>Aucun utilisateur client enregistré.</p>
                </div>
              )
            )}

            {/* LISTE 3 : MEMBRES STEP UP */}
            {activeListTab === 'stepup' && (
              filteredStepupUsers.length > 0 ? (
                <table className="admin-companies-table">
                  <thead>
                    <tr>
                      <th>Nom complet</th>
                      <th>Adresse e-mail</th>
                      <th>Rôle interne</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStepupUsers.map(user => {
                      const userComps = user.company_ids ? companies.filter(c => user.company_ids.includes(c.id)).map(c => c.name) : [];
                      return (
                        <tr key={user.id}>
                          <td className="company-name-cell">
                            <strong>{user.name}</strong>
                            {userComps.length > 0 && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem', fontWeight: 500 }}>
                                💼 {userComps.join(', ')}
                              </div>
                            )}
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>{user.email}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <span style={{ background: 'rgba(255,255,255,0.06)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, display: 'inline-block', width: 'fit-content' }}>
                                {user.role}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--primary-color)', fontWeight: 600 }}>
                                🔑 {user.user_role === 'super_manager' ? 'Super Manager' : (user.user_role === 'manager' ? 'Manager' : 'Collaborateur')}
                              </span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                              <button
                                type="button"
                                className="btn-option"
                                style={{ padding: '0.4rem', background: 'rgba(25, 140, 204, 0.1)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'var(--primary-color)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                onClick={() => handleStartEditStepup(user)}
                                title="Modifier"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                type="button"
                                className="btn-option"
                                style={{ padding: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#ef4444', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                onClick={() => handleDeleteStepupUser(user)}
                                title="Supprimer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="admin-empty-state">
                  <Users size={48} style={{ opacity: 0.15, marginBottom: '1rem' }} />
                  <p>Aucun collaborateur Step Up enregistré.</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
