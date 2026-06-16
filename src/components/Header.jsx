
import { Moon, Sun, Columns, Database, LogOut, User, Calendar, Users, Lock, Download } from 'lucide-react';
import './Header.css';

export default function Header({
  theme,
  toggleTheme,
  activeTab,
  setActiveTab,
  supabaseConnected,
  supabaseTableExists,
  currentUser,
  onLogout,
  onChangePasswordClick,
  onInstallApp
}) {
  const getSyncBadge = () => {
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
  };

  return (
    <header className="header glass-panel animate-fade-in">
      <div className="header-content">
        <div className="header-top-row">
          <div className="logo-section">
            <img src="/Logo Step Up.png" alt="Step Up Logo" className="logo" />
            <div className="header-titles">
              <h1 className="title">Step Up Planicorne</h1>
              <p className="subtitle">Créez et organisez vos contenus sociaux</p>
            </div>
          </div>

          <div className="header-actions">
            {['admin', 'manager', 'super_manager'].includes(currentUser?.role?.trim().toLowerCase()) && getSyncBadge()}

            {currentUser && (
              <div className="user-profile-badge">
                <User size={14} className="user-profile-icon" />
                <span className="user-name-text">{currentUser.name}</span>
                <span className="user-role-badge">
                  {currentUser.role?.trim().toLowerCase() === 'admin' ? 'Admin' : (currentUser.role?.trim().toLowerCase() === 'super_manager' ? 'Super Manager' : (currentUser.role?.trim().toLowerCase() === 'manager' ? 'Manager' : (currentUser.role?.trim().toLowerCase() === 'client' ? 'Client' : 'StepUp')))}
                </span>
                <button 
                  onClick={onChangePasswordClick} 
                  className="btn-header-lock"
                  title="Modifier mon mot de passe"
                >
                  <Lock size={14} />
                </button>
                <button 
                  onClick={onLogout} 
                  className="btn-header-logout"
                  title="Se déconnecter"
                >
                  <LogOut size={14} />
                </button>
              </div>
            )}

            {onInstallApp && (
              <button
                className="install-app-btn"
                onClick={onInstallApp}
                title="Installer l'application"
                aria-label="Installer l'application"
              >
                <Download size={18} />
              </button>
            )}

            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label="Basculer le thème"
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </div>

        {/* NOUVELLE BARRE DE NAVIGATION */}
        {currentUser && (
          <div className="header-bottom-row">
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

              {['admin', 'manager', 'super_manager'].includes(currentUser.role?.trim().toLowerCase()) && (
                <button
                  className={`nav-btn ${activeTab === 'admin_panel' ? 'active' : ''}`}
                  onClick={() => setActiveTab('admin_panel')}
                >
                  <Users size={18} />
                  <span>Administration</span>
                </button>
              )}

              {['admin', 'super_manager'].includes(currentUser.role?.trim().toLowerCase()) && (
                <button
                  className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
                  onClick={() => setActiveTab('settings')}
                >
                  <Database size={18} />
                  <span>Base de données</span>
                </button>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}

