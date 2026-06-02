
import { Moon, Sun, Columns, Cloud, FolderOpen, Database, LogOut, User, Calendar, Users } from 'lucide-react';
import './Header.css';

export default function Header({
  theme,
  toggleTheme,
  activeTab,
  setActiveTab,
  syncMode,
  localDirectoryName,
  supabaseConnected,
  supabaseTableExists,
  currentUser,
  onLogout
}) {
  const getSyncBadge = () => {
    switch (syncMode) {
      case 'supabase':
        if (supabaseConnected) {
          return (
            <div className="header-sync-badge sync-supabase" title="Connecté à Supabase PostgreSQL">
              <Database size={14} />
              <span className="badge-text">Supabase</span>
              <span className="badge-led led-green"></span>
            </div>
          );
        } else if (!supabaseTableExists) {
          return (
            <div className="header-sync-badge sync-supabase-error" title="Table 'posts' manquante sur Supabase">
              <Database size={14} />
              <span className="badge-text" style={{ maxWidth: '140px' }}>Table posts manquante</span>
              <span className="badge-led led-red"></span>
            </div>
          );
        } else {
          return (
            <div className="header-sync-badge sync-supabase-error" title="Connexion Supabase échouée / en cours">
              <Database size={14} />
              <span className="badge-text">Supabase Déconnecté</span>
              <span className="badge-led led-red"></span>
            </div>
          );
        }
      case 'local_dir':
        return (
          <div className="header-sync-badge sync-local-dir" title={`Synchronisé localement : ${localDirectoryName}`}>
            <FolderOpen size={14} />
            <span className="badge-text">{localDirectoryName}</span>
            <span className="badge-led led-green"></span>
          </div>
        );
      case 'cloud':
        return (
          <div className="header-sync-badge sync-cloud" title="Connecté à Google Drive Cloud">
            <Cloud size={14} />
            <span className="badge-text">Drive Cloud</span>
            <span className="badge-led led-green"></span>
          </div>
        );
      default:
        return (
          <div className="header-sync-badge sync-local" title="Stockage Local (Navigateur uniquement)">
            <Database size={14} />
            <span className="badge-text">Stockage Local</span>
            <span className="badge-led led-amber"></span>
          </div>
        );
    }
  };

  return (
    <header className="header glass-panel animate-fade-in">
      <div className="header-content">
        <div className="logo-section">
          <img src="/Logo Step Up.png" alt="Step Up Logo" className="logo" />
          <div className="header-titles">
            <h1 className="title">Step Up Planicorne</h1>
            <p className="subtitle">Créez et organisez vos contenus sociaux</p>
          </div>
        </div>

        {/* NOUVELLE BARRE DE NAVIGATION */}
        {currentUser && (
          <nav className="header-nav">
            {currentUser.role?.trim().toLowerCase() !== 'client' && (
              <button
                className={`nav-btn ${activeTab === 'calendar' ? 'active' : ''}`}
                onClick={() => setActiveTab('calendar')}
              >
                <Calendar size={18} />
                <span>Calendrier</span>
              </button>
            )}

            <button
              className={`nav-btn ${activeTab === 'board' ? 'active' : ''}`}
              onClick={() => setActiveTab('board')}
            >
              <Columns size={18} />
              <span>Kanban</span>
            </button>

            {currentUser.role?.trim().toLowerCase() === 'admin' && (
              <button
                className={`nav-btn ${activeTab === 'admin_panel' ? 'active' : ''}`}
                onClick={() => setActiveTab('admin_panel')}
              >
                <Users size={18} />
                <span>Administration</span>
              </button>
            )}

            {currentUser.role?.trim().toLowerCase() === 'admin' && (
              <button
                className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                <Database size={18} />
                <span>Base de données</span>
              </button>
            )}
          </nav>
        )}

        <div className="header-actions">
          {currentUser?.role?.trim().toLowerCase() === 'admin' && getSyncBadge()}

          {currentUser && (
            <div className="user-profile-badge" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.4rem 0.85rem',
              borderRadius: '9999px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--surface-border)',
              fontSize: '0.85rem',
              color: 'var(--text-main)'
            }}>
              <User size={14} style={{ color: 'var(--primary-color)' }} />
              <span>{currentUser.name}</span>
              <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '0.05rem 0.35rem', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>
                {currentUser.role?.trim().toLowerCase() === 'admin' ? 'Admin' : (currentUser.role?.trim().toLowerCase() === 'client' ? 'Client' : 'StepUp')}
              </span>
              <button 
                onClick={onLogout} 
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.2rem',
                  marginLeft: '0.25rem',
                  transition: 'transform 0.2s ease'
                }}
                title="Se déconnecter"
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                <LogOut size={14} />
              </button>
            </div>
          )}

          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label="Basculer le thème"
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </div>
      </div>
    </header>
  );
}

