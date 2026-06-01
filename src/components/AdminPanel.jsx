import React, { useState } from 'react';
import { 
  Plus, 
  Building, 
  User, 
  Users, 
  Key, 
  FileText, 
  Mail, 
  Save, 
  ShieldAlert, 
  Globe 
} from 'lucide-react';
import { 
  insertCompany, 
  insertClient, 
  insertStepupUser, 
  createAppUser 
} from '../utils/supabaseService';
import SecureMedia from './SecureMedia';
import './AdminPanel.css';

export default function AdminPanel({ 
  companies = [], 
  clients = [], 
  stepupUsers = [], 
  onRefreshData 
}) {
  const [activeFormTab, setActiveFormTab] = useState('company'); // company, client, stepup

  // Form states - Company
  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [contractLinkedin, setContractLinkedin] = useState(0);
  const [contractFacebook, setContractFacebook] = useState(0);
  const [contractInstagram, setContractInstagram] = useState(0);
  const [contractGoogle, setContractGoogle] = useState(0);
  const [contractBlog, setContractBlog] = useState(0);
  const [contractNewsletter, setContractNewsletter] = useState(0);

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

  const handleAddCompany = async (e) => {
    e.preventDefault();
    if (!companyName.trim()) return;
    setLoading(true);

    const driveId = extractDriveId(logoUrl);
    const companyId = 'comp-' + Date.now();

    try {
      await insertCompany({
        id: companyId,
        name: companyName.trim(),
        logo_drive_id: driveId || null,
        contract_linkedin: parseInt(contractLinkedin) || 0,
        contract_facebook: parseInt(contractFacebook) || 0,
        contract_instagram: parseInt(contractInstagram) || 0,
        contract_google: parseInt(contractGoogle) || 0,
        contract_blog: parseInt(contractBlog) || 0,
        contract_newsletter: parseInt(contractNewsletter) || 0
      });

      alert(`L'entreprise "${companyName}" a été enregistrée avec succès !`);
      setCompanyName('');
      setLogoUrl('');
      setContractLinkedin(0);
      setContractFacebook(0);
      setContractInstagram(0);
      setContractGoogle(0);
      setContractBlog(0);
      setContractNewsletter(0);
      
      if (onRefreshData) await onRefreshData();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la création de l'entreprise. Assurez-vous d'avoir exécuté la migration SQL.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddClient = async (e) => {
    e.preventDefault();
    if (!clientName.trim() || !clientEmail.trim() || !clientPassword.trim() || !selectedCompanyId) {
      alert("Veuillez remplir tous les champs et sélectionner une entreprise.");
      return;
    }
    setLoading(true);

    const clientId = 'client-' + Date.now();
    const appUserId = 'app-user-' + Date.now();

    try {
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
      setClientName('');
      setClientEmail('');
      setClientPassword('');
      setSelectedCompanyId('');
      
      if (onRefreshData) await onRefreshData();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la création du compte client.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddStepupUser = async (e) => {
    e.preventDefault();
    if (!stepupName.trim() || !stepupEmail.trim() || !stepupPassword.trim()) {
      alert("Veuillez remplir tous les champs.");
      return;
    }
    setLoading(true);

    const stepupUserId = 'user-' + Date.now();
    const appUserId = 'app-user-' + Date.now();

    try {
      // 1. Create Step Up profile
      await insertStepupUser({
        id: stepupUserId,
        name: stepupName.trim(),
        email: stepupEmail.trim(),
        role: stepupRole
      });

      // 2. Create login account
      await createAppUser({
        id: appUserId,
        email: stepupEmail.trim().toLowerCase(),
        password: stepupPassword.trim(),
        name: stepupName.trim(),
        role: 'stepup_user',
        stepup_user_id: stepupUserId
      });

      alert(`Le collaborateur Step Up "${stepupName}" a été ajouté avec succès !`);
      setStepupName('');
      setStepupEmail('');
      setStepupPassword('');
      setStepupRole('Rédacteur');
      
      if (onRefreshData) await onRefreshData();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la création du collaborateur Step Up.");
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
        {/* COLONNE GAUCHE - FORMULAIRES DE CRÉATION */}
        <div className="admin-forms-column glass-panel">
          <div className="admin-tab-nav">
            <button 
              className={`admin-tab-btn ${activeFormTab === 'company' ? 'active' : ''}`}
              onClick={() => setActiveFormTab('company')}
            >
              <Building size={16} />
              <span>Entreprise & Contrat</span>
            </button>
            <button 
              className={`admin-tab-btn ${activeFormTab === 'client' ? 'active' : ''}`}
              onClick={() => setActiveFormTab('client')}
            >
              <User size={16} />
              <span>Utilisateur Client</span>
            </button>
            <button 
              className={`admin-tab-btn ${activeFormTab === 'stepup' ? 'active' : ''}`}
              onClick={() => setActiveFormTab('stepup')}
            >
              <Users size={16} />
              <span>Membre Step Up</span>
            </button>
          </div>

          <div className="admin-tab-body">
            {/* FORMULAIRE 1 : AJOUT ENTREPRISE & CONTRAT */}
            {activeFormTab === 'company' && (
              <form onSubmit={handleAddCompany} className="admin-form animate-fade-in">
                <h3>Nouvelle Entreprise</h3>
                
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

                <div className="contract-grid-title">Nombre de publications mensuelles par canal :</div>
                
                <div className="contract-inputs-grid">
                  <div className="form-group">
                    <label>LinkedIn</label>
                    <input 
                      type="number" 
                      min="0" 
                      value={contractLinkedin} 
                      onChange={(e) => setContractLinkedin(e.target.value)} 
                    />
                  </div>
                  <div className="form-group">
                    <label>Facebook</label>
                    <input 
                      type="number" 
                      min="0" 
                      value={contractFacebook} 
                      onChange={(e) => setContractFacebook(e.target.value)} 
                    />
                  </div>
                  <div className="form-group">
                    <label>Instagram</label>
                    <input 
                      type="number" 
                      min="0" 
                      value={contractInstagram} 
                      onChange={(e) => setContractInstagram(e.target.value)} 
                    />
                  </div>
                  <div className="form-group">
                    <label>Google Business</label>
                    <input 
                      type="number" 
                      min="0" 
                      value={contractGoogle} 
                      onChange={(e) => setContractGoogle(e.target.value)} 
                    />
                  </div>
                  <div className="form-group">
                    <label>Billet de Blog</label>
                    <input 
                      type="number" 
                      min="0" 
                      value={contractBlog} 
                      onChange={(e) => setContractBlog(e.target.value)} 
                    />
                  </div>
                  <div className="form-group">
                    <label>Newsletter</label>
                    <input 
                      type="number" 
                      min="0" 
                      value={contractNewsletter} 
                      onChange={(e) => setContractNewsletter(e.target.value)} 
                    />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary-admin" disabled={loading || !companyName.trim()}>
                  <Save size={18} />
                  <span>Enregistrer l'entreprise</span>
                </button>
              </form>
            )}

            {/* FORMULAIRE 2 : AJOUT UTILISATEUR CLIENT */}
            {activeFormTab === 'client' && (
              <form onSubmit={handleAddClient} className="admin-form animate-fade-in">
                <h3>Créer un accès Client</h3>

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
                    placeholder="Ex: Thomas Anderson"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>E-mail de connexion</label>
                  <input 
                    type="email" 
                    placeholder="Ex: thomas@acapela.com"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Mot de passe</label>
                  <input 
                    type="password" 
                    placeholder="Créer un mot de passe d'accès..."
                    value={clientPassword}
                    onChange={(e) => setClientPassword(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary-admin" disabled={loading || !selectedCompanyId}>
                  <Plus size={18} />
                  <span>Créer le compte Client</span>
                </button>
              </form>
            )}

            {/* FORMULAIRE 3 : AJOUT MEMBRE STEP UP */}
            {activeFormTab === 'stepup' && (
              <form onSubmit={handleAddStepupUser} className="admin-form animate-fade-in">
                <h3>Ajouter un collaborateur Step Up</h3>

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
                  <label>Mot de passe</label>
                  <input 
                    type="password" 
                    placeholder="Mot de passe provisoire..."
                    value={stepupPassword}
                    onChange={(e) => setStepupPassword(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary-admin" disabled={loading}>
                  <Plus size={18} />
                  <span>Enregistrer le collaborateur</span>
                </button>
              </form>
            )}
          </div>
        </div>

        {/* COLONNE DROITE - LISTE DES ENTREPRISES ET CONTRATS EN COURS */}
        <div className="admin-list-column glass-panel">
          <h3>Entreprises actives ({companies.length})</h3>
          
          <div className="admin-companies-table-wrapper">
            {companies.length > 0 ? (
              <table className="admin-companies-table">
                <thead>
                  <tr>
                    <th>Logo</th>
                    <th>Nom de l'entreprise</th>
                    <th>Contrat (Mensuel)</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="admin-empty-state">
                <Building size={48} style={{ opacity: 0.15, marginBottom: '1rem' }} />
                <p>Aucune entreprise cliente enregistrée pour le moment.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
