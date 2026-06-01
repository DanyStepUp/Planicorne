import React, { useState } from 'react';
import {
  Columns,
  Search,
  Plus,
  Trash2,
  Edit3,
  Copy,
  Check,
  ChevronRight,
  Filter,
  MoreVertical,
  Calendar,
  ExternalLink,
  FileText,
  Mail,
  Building
} from 'lucide-react';
import {
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaGoogle
} from 'react-icons/fa';
import SecureMedia from './SecureMedia';
import './Board.css';

const COLUMNS = [
  { id: 'draft', title: '💡 Idées / Brouillons', color: '#6366f1' },
  { id: 'validate', title: '👀 À valider', color: '#f59e0b' },
  { id: 'ready', title: '🚀 Prêt à publier', color: '#10b981' },
  { id: 'published', title: '✅ Publié', color: '#198CCC' }
];

const PLATFORM_ICONS = {
  facebook: FaFacebook,
  instagram: FaInstagram,
  linkedin: FaLinkedin,
  google: FaGoogle,
  blog: FileText,
  newsletter: Mail
};

const PLATFORM_COLORS = {
  facebook: '#1877F2',
  instagram: '#E4405F',
  linkedin: '#0A66C2',
  google: '#EA4335',
  blog: '#6366f1',
  newsletter: '#10b981'
};

const PLATFORM_LABELS = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  google: 'Google My Business',
  blog: 'Billet de Blog',
  newsletter: 'Newsletter'
};

export default function Board({
  cards = [],
  companies = [],
  onMoveCard,
  onDeleteCard,
  onEditCard,
  onAddCardDirectly,
  onUpdateCardDate,
  syncMode,
  currentUser
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState('all');
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState('all');
  const [draggedOverColumn, setDraggedOverColumn] = useState(null);
  const [copiedCardId, setCopiedCardId] = useState(null);
  const [activeMenuCardId, setActiveMenuCardId] = useState(null);

  const isClient = currentUser?.role?.trim().toLowerCase() === 'client';
  const activeColumns = isClient
    ? COLUMNS.filter(col => col.id === 'validate')
    : COLUMNS;

  const clientCompany = companies.find(c => c.id === currentUser?.company_id);

  // --- COMPTAGE MENSUEL PAR PLATEFORME POUR LES CONTRATS ---
  const getMonthlyCountByPlatform = (companyId, platform) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return cards.filter(card => {
      if (card.company_id !== companyId) return false;
      if (card.platform !== platform) return false;
      if (!card.scheduledAt) return false;
      try {
        const date = new Date(card.scheduledAt);
        return date.getFullYear() === currentYear && date.getMonth() === currentMonth;
      } catch {
        return false;
      }
    }).length;
  };

  // --- FILTRAGE DES CARTES ---
  const filteredCards = cards.filter(card => {
    const matchesSearch =
      card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.content.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesPlatform =
      selectedPlatformFilter === 'all' ||
      card.platform === selectedPlatformFilter;

    const matchesCompany =
      selectedCompanyFilter === 'all' ||
      card.company_id === selectedCompanyFilter;

    return matchesSearch && matchesPlatform && matchesCompany;
  });

  // --- GESTION DU DRAG-AND-DROP ---
  const handleDragStart = (e, cardId) => {
    if (isClient) return;
    e.dataTransfer.setData('text/plain', cardId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    if (isClient) return;
    if (draggedOverColumn !== columnId) {
      setDraggedOverColumn(columnId);
    }
  };

  const handleDragLeave = () => {
    setDraggedOverColumn(null);
  };

  const handleDrop = (e, columnId) => {
    e.preventDefault();
    if (isClient) return;
    setDraggedOverColumn(null);
    const cardId = e.dataTransfer.getData('text/plain');
    if (cardId) {
      onMoveCard(cardId, columnId);
    }
  };

  // --- ACTIONS SUR LES CARTES ---
  const handleCopyText = (card) => {
    navigator.clipboard.writeText(card.content);
    setCopiedCardId(card.id);
    setTimeout(() => setCopiedCardId(null), 2000);
    setActiveMenuCardId(null);
  };

  const toggleCardMenu = (e, cardId) => {
    e.stopPropagation();
    if (isClient) return;
    setActiveMenuCardId(activeMenuCardId === cardId ? null : cardId);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // --- ENREGISTRER UNE NOUVELLE CARTE RAPIDE ---
  const handleQuickAdd = (columnId) => {
    if (isClient) return;
    const title = prompt("Saisissez le titre de votre post :");
    if (!title || !title.trim()) return;

    // Plateforme par défaut : linkedin
    onAddCardDirectly({
      title: title.trim(),
      content: "",
      platform: 'linkedin',
      status: columnId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  };

  // --- RENDU PROGRESSION CONTRAT ---
  const renderContractProgress = (company) => {
    if (!company) return null;

    const platforms = [
      { key: 'linkedin', label: 'LinkedIn', target: company.contract_linkedin, color: '#0A66C2' },
      { key: 'facebook', label: 'Facebook', target: company.contract_facebook, color: '#1877F2' },
      { key: 'instagram', label: 'Instagram', target: company.contract_instagram, color: '#E4405F' },
      { key: 'google', label: 'Google Business', target: company.contract_google, color: '#EA4335' },
      { key: 'blog', label: 'Billet de Blog', target: company.contract_blog, color: '#6366f1' },
      { key: 'newsletter', label: 'Newsletter', target: company.contract_newsletter, color: '#10b981' }
    ];

    const activeContracts = platforms.filter(p => p.target > 0);

    if (activeContracts.length === 0) {
      return (
        <div className="empty-contract-msg">
          Aucun objectif de publication configuré.
        </div>
      );
    }

    return (
      <div className="contract-progress-list animate-fade-in">
        {activeContracts.map(p => {
          const currentCount = getMonthlyCountByPlatform(company.id, p.key);
          const ratio = p.target > 0 ? Math.min(100, Math.round((currentCount / p.target) * 100)) : 0;
          return (
            <div key={p.key} className="contract-progress-item">
              <div className="contract-progress-info">
                <span className="contract-platform-name" style={{ color: p.color }}>
                  {p.label}
                </span>
                <span className="contract-ratio">
                  <strong>{currentCount}</strong> / {p.target}
                </span>
              </div>
              <div className="contract-progress-bar-bg">
                <div 
                  className="contract-progress-bar-fill" 
                  style={{ 
                    width: `${ratio}%`, 
                    backgroundColor: p.color,
                    boxShadow: `0 0 8px ${p.color}50`
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const selectedCompany = companies.find(c => c.id === selectedCompanyFilter);

  // Calcul des KPIs globaux ou spécifiques à l'entreprise sélectionnée
  const getCompanyKPIs = (compId) => {
    const compCards = compId === 'all' 
      ? cards 
      : cards.filter(c => c.company_id === compId);

    const validate = compCards.filter(c => c.status === 'validate').length;
    const ready = compCards.filter(c => c.status === 'ready').length;
    const published = compCards.filter(c => c.status === 'published').length;

    // Total prévus ce mois-ci
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const scheduledThisMonth = compCards.filter(c => {
      if (!c.scheduledAt) return false;
      try {
        const d = new Date(c.scheduledAt);
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      } catch {
        return false;
      }
    }).length;

    return { validate, ready, published, scheduledThisMonth };
  };

  const kpis = getCompanyKPIs(selectedCompanyFilter);

  return (
    <div className={`board-layout-container ${!isClient ? 'has-sidebar' : ''} animate-fade-in`}>
      {/* SIDEBAR POUR STEP UP / ADMIN */}
      {!isClient && (
        <aside className="board-sidebar glass-panel">
          <div className="sidebar-header">
            <Building size={18} className="sidebar-header-icon" />
            <h3>Filtrer par Client</h3>
          </div>
          
          <div className="sidebar-companies-list">
            <button
              className={`sidebar-company-btn ${selectedCompanyFilter === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCompanyFilter('all')}
            >
              <div className="btn-logo-fallback">💼</div>
              <span className="btn-name">Toutes les entreprises</span>
              <span className="sidebar-badge">{cards.length}</span>
            </button>

            {companies.map(comp => {
              const compCardsCount = cards.filter(c => c.company_id === comp.id).length;
              return (
                <button
                  key={comp.id}
                  className={`sidebar-company-btn ${selectedCompanyFilter === comp.id ? 'active' : ''}`}
                  onClick={() => setSelectedCompanyFilter(comp.id)}
                >
                  {comp.logo_drive_id ? (
                    <div className="btn-logo-wrapper">
                      <SecureMedia 
                        driveId={comp.logo_drive_id} 
                        type="image/png" 
                        alt={comp.name} 
                      />
                    </div>
                  ) : (
                    <div className="btn-logo-fallback">🏢</div>
                  )}
                  <span className="btn-name">{comp.name}</span>
                  <span className="sidebar-badge">{compCardsCount}</span>
                </button>
              );
            })}
          </div>

          <div className="sidebar-divider"></div>

          {/* SUIVI ET KPIS DE L'ENTREPRISE SÉLECTIONNÉE */}
          <div className="sidebar-kpis-panel">
            <h4 className="sidebar-panel-title">
              {selectedCompanyFilter === 'all' ? 'KPIs Globaux' : `KPIs - ${selectedCompany?.name}`}
            </h4>

            <div className="sidebar-kpi-grid">
              <div className="sidebar-kpi-card" style={{ '--kpi-border': '#f59e0b' }}>
                <span className="kpi-val">{kpis.validate}</span>
                <span className="kpi-lbl">À valider</span>
              </div>
              <div className="sidebar-kpi-card" style={{ '--kpi-border': '#10b981' }}>
                <span className="kpi-val">{kpis.ready}</span>
                <span className="kpi-lbl">Prêt</span>
              </div>
              <div className="sidebar-kpi-card" style={{ '--kpi-border': '#198CCC' }}>
                <span className="kpi-val">{kpis.published}</span>
                <span className="kpi-lbl">Publié</span>
              </div>
              <div className="sidebar-kpi-card" style={{ '--kpi-border': '#6366f1' }}>
                <span className="kpi-val">{kpis.scheduledThisMonth}</span>
                <span className="kpi-lbl">Prévus ce mois</span>
              </div>
            </div>

            {selectedCompanyFilter !== 'all' && selectedCompany && (
              <div className="sidebar-contract-progress-section animate-fade-in">
                <h4 className="sidebar-panel-title">Objectifs du Contrat</h4>
                {renderContractProgress(selectedCompany)}
              </div>
            )}
          </div>
        </aside>
      )}

      {/* CONTENU PRINCIPAL DU TABLEAU */}
      <div className="board-main-content">
        {/* BANNIÈRE CLIENT POUR LE RÔLE CLIENT */}
        {isClient && clientCompany && (
          <div className="client-banner glass-panel">
            <div className="client-banner-left">
              {clientCompany.logo_drive_id ? (
                <div className="client-banner-logo">
                  <SecureMedia 
                    driveId={clientCompany.logo_drive_id} 
                    type="image/png" 
                    alt={clientCompany.name} 
                  />
                </div>
              ) : (
                <div className="client-banner-logo-fallback">🏢</div>
              )}
              <div className="client-banner-welcome">
                <h2>Bonjour, {currentUser.name} !</h2>
                <p>Espace client <strong>{clientCompany.name}</strong>. Examinez, commentez et validez vos publications en un clic.</p>
              </div>
            </div>
            
            <div className="client-banner-right">
              <h4 className="contract-title">Suivi de vos publications ce mois</h4>
              {renderContractProgress(clientCompany)}
            </div>
          </div>
        )}

        {/* CONTROLES (RECHERCHE + FILTRES PAR CANAL) */}
        <div className="board-controls-panel glass-panel">
          <div className="search-box-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Rechercher un post par titre ou contenu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="board-search-input"
            />
          </div>

          <div className="filter-pills-row">
            <span className="filter-label"><Filter size={14} /> Filtrer :</span>
            <button
              className={`filter-pill ${selectedPlatformFilter === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedPlatformFilter('all')}
            >
              Tous
            </button>
            {['linkedin', 'facebook', 'instagram', 'google', 'blog', 'newsletter'].map(plat => {
              const Icon = PLATFORM_ICONS[plat];
              return (
                <button
                  key={plat}
                  className={`filter-pill ${selectedPlatformFilter === plat ? 'active' : ''}`}
                  style={{
                    '--pill-hover-color': PLATFORM_COLORS[plat],
                    borderColor: selectedPlatformFilter === plat ? PLATFORM_COLORS[plat] : 'transparent',
                    background: selectedPlatformFilter === plat ? `rgba(${plat === 'linkedin' ? '25,140,204' : '255,255,255'}, 0.1)` : ''
                  }}
                  onClick={() => setSelectedPlatformFilter(plat)}
                >
                  {Icon && <Icon size={14} style={{ color: PLATFORM_COLORS[plat] }} />}
                  {PLATFORM_LABELS[plat]}
                </button>
              );
            })}
          </div>
        </div>

        {/* GRILLE DE COLONNES KANBAN */}
        <div className="kanban-grid" style={isClient ? { gridTemplateColumns: '1fr', maxWidth: '480px', margin: '0 auto' } : {}}>
          {activeColumns.map(col => {
            const colCards = filteredCards.filter(c => c.status === col.id);
            const isOver = draggedOverColumn === col.id;

            return (
              <div
                key={col.id}
                className={`kanban-column glass-panel ${isOver ? 'column-dragover' : ''}`}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.id)}
                style={{ '--col-accent': col.color }}
              >
                {/* Entête colonne */}
                <div className="column-header">
                  <div className="column-title-wrapper">
                    <span className="column-dot" style={{ backgroundColor: col.color }}></span>
                    <h3>{col.title}</h3>
                    <span className="cards-badge">{colCards.length}</span>
                  </div>

                  {!isClient && (
                    <button
                      className="btn-add-card-quick"
                      onClick={() => handleQuickAdd(col.id)}
                      title="Ajouter une carte rapide"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>

                {/* Conteneur de cartes */}
                <div className="column-cards-list">
                  {colCards.length > 0 ? (
                    colCards.map(card => {
                      const PlatformIcon = PLATFORM_ICONS[card.platform] || FaLinkedin;
                      const platformColor = PLATFORM_COLORS[card.platform] || '#198CCC';
                      const isMenuOpen = activeMenuCardId === card.id;
                      const coverImage = card.attachments?.find(att => att.isCover);
                      const isCoverVideo = coverImage?.type?.startsWith('video/');

                      return (
                        <div
                          key={card.id}
                          className="kanban-card glass-panel"
                          draggable={!isClient}
                          onDragStart={(e) => handleDragStart(e, card.id)}
                          onClick={() => onEditCard(card)}
                          style={{ borderLeft: `4px solid ${platformColor}` }}
                        >
                          {coverImage && (
                            <div className="card-cover" style={{ position: 'relative' }}>
                              <SecureMedia
                                src={coverImage.data}
                                driveId={coverImage.driveId}
                                type={coverImage.type}
                                alt="Couverture"
                              />
                              {isCoverVideo && (
                                <div className="video-play-overlay">
                                  <span className="play-icon-triangle">▶</span>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="card-top-row">
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span
                                className="card-platform-tag"
                                style={{
                                  color: platformColor,
                                  background: `${platformColor}15`
                                }}
                              >
                                <PlatformIcon size={12} />
                                {PLATFORM_LABELS[card.platform]}
                              </span>
                              
                              {card.companies?.name && (
                                <span 
                                  className="card-platform-tag"
                                  style={{ 
                                    color: 'var(--primary-color)', 
                                    background: 'rgba(25, 140, 204, 0.08)',
                                    fontWeight: 600
                                  }}
                                >
                                  💼 {card.companies.name}
                                </span>
                              )}
                            </div>

                            {!isClient && (
                              <div className="card-menu-container">
                                <button
                                  className="btn-card-menu-trigger"
                                  onClick={(e) => toggleCardMenu(e, card.id)}
                                >
                                  <MoreVertical size={14} />
                                </button>

                                {isMenuOpen && (
                                  <div className="card-dropdown-menu glass-panel" onClick={(e) => e.stopPropagation()}>
                                    <button onClick={() => { onEditCard(card); setActiveMenuCardId(null); }}>
                                      <Edit3 size={14} /> Modifier
                                    </button>
                                    <button onClick={() => handleCopyText(card)}>
                                      {copiedCardId === card.id ? (
                                        <><Check size={14} className="color-success" /> Copié</>
                                      ) : (
                                        <><Copy size={14} /> Copier</>
                                      )}
                                    </button>
                                    <div className="dropdown-divider"></div>
                                    <button
                                      className="btn-delete-card"
                                      onClick={() => {
                                        if (confirm("Supprimer ce post ?")) onDeleteCard(card.id);
                                        setActiveMenuCardId(null);
                                      }}
                                    >
                                      <Trash2 size={14} /> Supprimer
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <h4 className="card-title">{card.title}</h4>

                          <p className="card-excerpt">
                            {card.content ? (
                              card.content.length > 120
                                ? card.content.substring(0, 120) + "..."
                                : card.content
                            ) : (
                              <span className="card-empty-placeholder">Contenu vide. Cliquez pour rédiger.</span>
                            )}
                          </p>

                          <div className="card-bottom-row">
                            <span
                              className="card-date"
                              title={isClient ? "Date prévue de publication" : "Date prévue de publication (Cliquer pour modifier)"}
                              onClick={(e) => {
                                if (isClient) return;
                                e.stopPropagation();
                                const input = e.currentTarget.querySelector('input');
                                if (input) {
                                  try {
                                    input.showPicker();
                                  } catch {
                                    input.focus();
                                  }
                                }
                              }}
                              style={isClient ? {} : { cursor: 'pointer', position: 'relative' }}
                            >
                              <Calendar size={12} />
                              {card.scheduledAt ? formatDate(card.scheduledAt) : "Non planifié"}

                              {!isClient && (
                                <input
                                  type="datetime-local"
                                  style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    opacity: 0,
                                    cursor: 'pointer'
                                  }}
                                  value={card.scheduledAt ? new Date(new Date(card.scheduledAt).getTime() - new Date(card.scheduledAt).getTimezoneOffset() * 60000).toISOString().substring(0, 16) : ''}
                                  onChange={(evt) => {
                                    const newDate = evt.target.value;
                                    onUpdateCardDate(card.id, newDate);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              )}
                            </span>

                            <button
                              className="card-open-editor-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditCard(card);
                              }}
                              title="Ouvrir dans le rédacteur"
                            >
                              <ExternalLink size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="column-empty-state">
                      <Columns size={28} className="column-empty-icon" />
                      <p>Aucun post dans cette colonne !</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
