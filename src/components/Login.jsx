import React, { useState } from 'react';
import { Mail, Lock, ShieldAlert, LogIn, Sparkles } from 'lucide-react';
import { authenticateUser, logConnection } from '../utils/supabaseService';
import './Login.css';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const user = await authenticateUser(email.trim().toLowerCase(), password);
      if (user) {
        // Enregistrer le log de connexion
        await logConnection(user.email, user.role);
        
        // Connecter l'utilisateur dans le composant parent
        onLoginSuccess(user);
      } else {
        setError("Adresse email ou mot de passe incorrect.");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Impossible de contacter Supabase. Assurez-vous d'avoir exécuté la migration SQL.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSelect = (qEmail, qPassword) => {
    setEmail(qEmail);
    setPassword(qPassword);
    setError(null);
  };

  return (
    <div className="login-wrapper animate-fade-in">
      <div className="login-box glass-panel">
        <div className="login-logo-area">
          <img src="/Logo Step Up.png" alt="Step Up Logo" className="login-logo" />
          <h2>Step Up Planicorne</h2>
          <p>Rédigez, validez et organisez vos posts sur tous vos réseaux</p>
        </div>

        {error && (
          <div className="login-error-badge">
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="login-form">
          <div className="login-input-field">
            <label htmlFor="login-email">Adresse e-mail</label>
            <div className="input-with-icon">
              <Mail size={16} className="input-icon" />
              <input 
                id="login-email"
                type="email" 
                placeholder="dany.r@stepupdigital.net" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="login-input-field">
            <label htmlFor="login-password">Mot de passe</label>
            <div className="input-with-icon">
              <Lock size={16} className="input-icon" />
              <input 
                id="login-password"
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn-login-submit" disabled={loading}>
            {loading ? (
              <span>Connexion en cours...</span>
            ) : (
              <>
                <LogIn size={16} />
                <span>Se connecter</span>
              </>
            )}
          </button>
        </form>

        {/* COMPTES DE TEST RAPIDES */}
        <div className="quick-access-demo">
          <h4>
            <Sparkles size={14} style={{ color: 'var(--primary-color)' }} />
            <span>Sélection rapide de profil (Rôles) :</span>
          </h4>
          <div className="demo-buttons-grid">
            <button 
              type="button"
              className="btn-demo-acc btn-admin"
              onClick={() => handleQuickSelect('dany.r@stepupdigital.net', 'dany2026')}
            >
              👑 Dany R (Admin)
            </button>
            <button 
              type="button"
              className="btn-demo-acc btn-stepup"
              onClick={() => handleQuickSelect('chloe@stepup.fr', 'chloe123')}
            >
              👩‍💻 Chloé (Step Up)
            </button>
            <button 
              type="button"
              className="btn-demo-acc btn-client"
              onClick={() => handleQuickSelect('thomas@acapela.com', 'thomas123')}
            >
              💼 Thomas (Client)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
