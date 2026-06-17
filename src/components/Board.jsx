import { useState, useEffect } from 'react';
import {
  Columns,
  Search,
  Plus,
  Trash2,
  Edit3,
  Copy,
  Check,
  Filter,
  MoreVertical,
  Calendar,
  ExternalLink,
  FileText,
  Mail,
  Building,
  ChevronDown,
  ChevronUp
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
  stepupUsers = [],
  onMoveCard,
  onDeleteCard,
  onEditCard,
  onAddCard,
  onUpdateCardDate,
  currentUser,
  selectedCompanyFilter,
  setSelectedCompanyFilter
}) {
  const isClient = currentUser?.role?.trim().toLowerCase() === 'client';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState('all');
  const [draggedOverColumn, setDraggedOverColumn] = useState(null);
  const [copiedCardId, setCopiedCardId] = useState(null);
  const [activeMenuCardId, setActiveMenuCardId] = useState(null);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);

  // Close company dropdown when clicking outside
  useEffect(() => {
    if (!isCompanyDropdownOpen) return;
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.sidebar-companies-dropdown-container')) {
        setIsCompanyDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [isCompanyDropdownOpen]);

  // Set default company filter to first company when companies load
  useEffect(() => {
    if (isClient) return;
    if (selectedCompanyFilter === 'all' && companies.length > 0) {
      const t = setTimeout(() => {
        setSelectedCompanyFilter(companies[0].id);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [companies, selectedCompanyFilter, isClient]);

  const clientVisibleBoards = currentUser?.visible_boards || ['validate'];
  const activeColumns = isClient
    ? COLUMNS.filter(col => clientVisibleBoards.includes(col.id))
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

  // Helper functions for date operations
  const formatDateToYYYYMMDD = (date) => {
    const d = new Date(date);
    const month = '' + (d.getMonth() + 1);
    const day = '' + d.getDate();
    const year = d.getFullYear();
    return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
  };

  const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  const [startDateStr, setStartDateStr] = useState(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return formatDateToYYYYMMDD(firstDay);
  });

  const [endDateStr, setEndDateStr] = useState(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = addDays(firstDay, 31); // 1 month default (31 days)
    return formatDateToYYYYMMDD(end);
  });

  const [includeUnscheduled, setIncludeUnscheduled] = useState(true);

  const handleStartDateChange = (e) => {
    const newStartStr = e.target.value;
    if (!newStartStr) return;
    setStartDateStr(newStartStr);

    const newStart = new Date(newStartStr);
    if (isNaN(newStart.getTime())) return;
    const currentEnd = new Date(endDateStr);
    if (isNaN(currentEnd.getTime())) return;
    
    if (newStart > currentEnd) {
      const newEnd = addDays(newStart, 31);
      setEndDateStr(formatDateToYYYYMMDD(newEnd));
    } else {
      const diffTime = currentEnd.getTime() - newStart.getTime();
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      if (diffDays > 31) {
        const newEnd = addDays(newStart, 31);
        setEndDateStr(formatDateToYYYYMMDD(newEnd));
      }
    }
  };

  const handleEndDateChange = (e) => {
    const newEndStr = e.target.value;
    if (!newEndStr) return;
    setEndDateStr(newEndStr);

    const newEnd = new Date(newEndStr);
    if (isNaN(newEnd.getTime())) return;
    const currentStart = new Date(startDateStr);
    if (isNaN(currentStart.getTime())) return;

    if (newEnd < currentStart) {
      const newStart = addDays(newEnd, -31);
      setStartDateStr(formatDateToYYYYMMDD(newStart));
    } else {
      const diffTime = newEnd.getTime() - currentStart.getTime();
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      if (diffDays > 31) {
        const newStart = addDays(newEnd, -31);
        setStartDateStr(formatDateToYYYYMMDD(newStart));
      }
    }
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
      isClient ||
      selectedCompanyFilter === 'all' ||
      card.company_id === selectedCompanyFilter;

    // Filter by Date Range
    let matchesDate = false;
    if (card.scheduledAt) {
      try {
        const cardDate = new Date(card.scheduledAt);
        const start = new Date(startDateStr);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(endDateStr);
        end.setHours(23, 59, 59, 999);
        
        matchesDate = cardDate >= start && cardDate <= end;
      } catch (e) {
        console.error("Error parsing card date:", e);
        matchesDate = includeUnscheduled;
      }
    } else {
      matchesDate = includeUnscheduled;
    }

    return matchesSearch && matchesPlatform && matchesCompany && matchesDate;
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
    if (isClient && !(columnId === 'draft' && clientVisibleBoards.includes('draft'))) return;
    onAddCard({
      status: columnId,
      company_id: isClient ? currentUser.company_id : (selectedCompanyFilter !== 'all' ? selectedCompanyFilter : (companies.length > 0 ? companies[0].id : ''))
    });
  };

  // --- RENDU PROGRESSION CONTRAT ---
  const renderContractProgress = (company) => {
    if (!company) return null;

    let details = null;
    if (company.contract_details) {
      try {
        details = typeof company.contract_details === 'string'
          ? JSON.parse(company.contract_details)
          : company.contract_details;
      } catch (e) {
        console.error("Failed to parse contract_details:", e);
      }
    }

    const platforms = [
      { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2' },
      { key: 'facebook', label: 'Facebook', color: '#1877F2' },
      { key: 'instagram', label: 'Instagram', color: '#E4405F' },
      { key: 'google', label: 'Google Business', color: '#EA4335' },
      { key: 'blog', label: 'Billet de Blog', color: '#6366f1' },
      { key: 'newsletter', label: 'Newsletter', color: '#10b981' }
    ].map(p => {
      let target;
      let labelSuffix = '';
      if (details?.frequencies?.[p.key]) {
        const freq = details.frequencies[p.key];
        target = freq.count || 0;
        if (freq.period === '2_months') labelSuffix = ' (tous les 2 mois)';
        else if (freq.period === '3_months') labelSuffix = ' (tous les 3 mois)';
        else if (freq.period === 'week') labelSuffix = ' (par semaine)';
        else if (freq.period === 'month') labelSuffix = ' (mensuel)';
      } else {
        target = company[`contract_${p.key}`] || 0;
        labelSuffix = ' (mensuel)';
      }
      return { ...p, target, label: p.label + labelSuffix };
    });

    const activeContracts = platforms.filter(p => p.target > 0);
    const hasUnquantifiable = typeof details?.unquantifiable === 'string' ? details.unquantifiable.trim().length > 0 : false;

    if (activeContracts.length === 0 && !hasUnquantifiable) {
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

        {hasUnquantifiable && (
          <div className="unquantifiable-contracts-section" style={{ marginTop: '0.75rem', borderTop: '1px solid var(--surface-border)', paddingTop: '0.75rem' }}>
            <span style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>Services non quantifiables :</span>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', fontWeight: 500, lineHeight: 1.4 }}>
              ✨ {details.unquantifiable}
            </div>
          </div>
        )}
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

  const renderStepupMembersList = (companyId) => {
    if (!companyId) return null;
    const assignedMembers = stepupUsers.filter(user => 
      user.company_ids && user.company_ids.includes(companyId)
    );

    if (assignedMembers.length === 0) {
      return (
        <div className="stepup-members-empty" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          Aucun collaborateur Step Up assigné à cette entreprise.
        </div>
      );
    }

    return (
      <div className="stepup-members-list-container" style={{ marginTop: '0.75rem', borderTop: '1px dashed var(--surface-border)', paddingTop: '0.75rem' }}>
        <span style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem', textAlign: 'left' }}>
          Membres Step Up assignés :
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {assignedMembers.map(m => (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', fontSize: '0.75rem', color: 'var(--text-main)', background: 'rgba(255,255,255,0.02)', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid var(--surface-border)', textAlign: 'left' }}>
              <span style={{ fontWeight: 600 }}>{m.name} <span style={{ fontSize: '0.675rem', color: 'var(--primary-color)', marginLeft: '0.25rem', background: 'rgba(25, 140, 204, 0.08)', padding: '0.05rem 0.30rem', borderRadius: '3px' }}>{m.role}</span></span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '0.15rem' }}>📧 {m.email}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={`board-layout-container ${!isClient ? 'has-sidebar' : ''} ${isClient ? 'is-client-board' : ''} animate-fade-in`}>
      {/* SIDEBAR POUR STEP UP / ADMIN */}
      {!isClient && (
        <aside className={`board-sidebar glass-panel ${isSidebarExpanded ? 'expanded' : 'collapsed'}`}>
          <div className="sidebar-header" onClick={() => setIsSidebarExpanded(!isSidebarExpanded)} style={{ cursor: 'pointer' }}>
            <Building size={18} className="sidebar-header-icon" />
            <h3 style={{ flexGrow: 1 }}>Filtrer par Client</h3>
            <span className="sidebar-toggle-icon-mobile">
              {isSidebarExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </div>
          
          <div className="sidebar-companies-dropdown-container" style={{ position: 'relative', width: '100%', marginBottom: '0.5rem' }}>
            <button 
              type="button"
              className="sidebar-dropdown-trigger glass-panel"
              onClick={() => setIsCompanyDropdownOpen(!isCompanyDropdownOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--surface-border)',
                color: 'var(--text-main)',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '0.85rem',
                fontWeight: '500',
                transition: 'var(--transition)'
              }}
            >
              {selectedCompany ? (
                <>
                  {selectedCompany.logo_drive_id ? (
                    <div className="btn-logo-wrapper">
                      <SecureMedia 
                        driveId={selectedCompany.logo_drive_id} 
                        type="image/png" 
                        alt={selectedCompany.name} 
                      />
                    </div>
                  ) : (
                    <div className="btn-logo-fallback">🏢</div>
                  )}
                  <span className="btn-name" style={{ flexGrow: 1 }}>{selectedCompany.name}</span>
                </>
              ) : (
                <>
                  <div className="btn-logo-fallback">🏢</div>
                  <span className="btn-name" style={{ flexGrow: 1 }}>Sélectionner un client...</span>
                </>
              )}
              <ChevronDown 
                size={16} 
                style={{ 
                  transform: isCompanyDropdownOpen ? 'rotate(180deg)' : 'none', 
                  transition: 'transform 0.2s',
                  color: 'var(--text-muted)' 
                }} 
              />
            </button>

            {isCompanyDropdownOpen && (
              <div 
                className="sidebar-dropdown-menu glass-panel"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '0.5rem',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  zIndex: 100,
                  background: 'var(--surface-color)',
                  border: '1px solid var(--surface-border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '0.35rem'
                }}
              >
                {companies.map(comp => {
                  const compCardsCount = cards.filter(c => c.company_id === comp.id).length;
                  return (
                    <button
                      key={comp.id}
                      type="button"
                      className={`sidebar-company-btn ${selectedCompanyFilter === comp.id ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedCompanyFilter(comp.id);
                        setIsCompanyDropdownOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.6rem 0.85rem',
                        borderRadius: 'var(--radius-md)',
                        background: selectedCompanyFilter === comp.id ? 'rgba(25, 140, 204, 0.08)' : 'transparent',
                        border: 'none',
                        color: selectedCompanyFilter === comp.id ? 'var(--primary-color)' : 'var(--text-main)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        fontSize: '0.825rem',
                        fontWeight: selectedCompanyFilter === comp.id ? '600' : '500',
                        transition: 'var(--transition)'
                      }}
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
                      <span className="btn-name" style={{ flexGrow: 1 }}>{comp.name}</span>
                      <span className="sidebar-badge">{compCardsCount}</span>
                    </button>
                  );
                })}
              </div>
            )}
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
                {renderStepupMembersList(selectedCompany.id)}
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
              {renderStepupMembersList(clientCompany.id)}
            </div>
          </div>
        )}

        {/* CONTROLES (RECHERCHE + FILTRES PAR CANAL + FILTRE DATE) */}
        <div className="board-controls-panel glass-panel">
          <div className="board-controls-row">
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

          <div className="board-controls-row board-date-filter-row">
            <div className="board-date-filter-container">
              <div className="date-input-group">
                <label htmlFor="board-start-date">Du :</label>
                <input
                  id="board-start-date"
                  type="date"
                  value={startDateStr}
                  onChange={handleStartDateChange}
                  className="board-date-input"
                />
              </div>
              <div className="date-input-group">
                <label htmlFor="board-end-date">Au :</label>
                <input
                  id="board-end-date"
                  type="date"
                  value={endDateStr}
                  onChange={handleEndDateChange}
                  className="board-date-input"
                />
              </div>
              <label className="include-unscheduled-label">
                <input
                  type="checkbox"
                  checked={includeUnscheduled}
                  onChange={(e) => setIncludeUnscheduled(e.target.checked)}
                  className="board-checkbox"
                />
                <span>Inclure les posts sans date</span>
              </label>
              <span className="date-range-hint">(Période max. 1 mois)</span>
            </div>
          </div>
        </div>

        {/* GRILLE DE COLONNES KANBAN */}
        <div className={`kanban-grid ${isClient ? 'client-kanban-grid' : ''}`}>
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

                  {(!isClient || (col.id === 'draft' && clientVisibleBoards.includes('draft'))) && (
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

                            {(!isClient || (card.status === 'draft' && clientVisibleBoards.includes('draft'))) && (
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
