import { useState, useEffect } from 'react';
import { Mail, Lock, ShieldAlert, LogIn, ChevronLeft, RefreshCw, CheckCircle2, ShieldCheck, ExternalLink } from 'lucide-react';
import { authenticateUser, setResetToken, resetPasswordByToken, sendResetEmailViaRpc } from '../utils/supabaseService';
import './Login.css';

export default function Login({ onLoginSuccess, resetToken, onClearResetToken }) {
  const [mode, setMode] = useState('login'); // 'login' | 'forgot' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Forgot password flow states
  const [forgotEmail, setForgotEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [devCode, setDevCode] = useState(null);

  useEffect(() => {
    if (resetToken) {
      setMode('reset');
      setError(null);
      setSuccessMessage(null);
    }
  }, [resetToken]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const user = await authenticateUser(email.trim().toLowerCase(), password);
      if (user) {
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

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    if (!forgotEmail.trim()) {
      setError("Veuillez saisir votre adresse e-mail.");
      setLoading(false);
      return;
    }

    try {
      // Générer un jeton cryptographique aléatoire de 32 caractères hexadécimaux
      const token = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      
      // Stocker le token dans Supabase
      await setResetToken(forgotEmail, token);
      
      // Envoyer le mail via le RPC Supabase (contourne CORS)
      let sentSuccess = true;
      try {
        await sendResetEmailViaRpc(forgotEmail.trim(), token, window.location.origin);
      } catch (rpcErr) {
        console.warn("Échec de l'envoi d'e-mail par RPC (pg_net peut ne pas être activé) :", rpcErr);
        sentSuccess = false;
      }

      const resetLink = `${window.location.origin}/?reset_token=${token}`;
      
      // Loguer dans la console pour faciliter les tests
      console.log(
        `%c[RESEND EMAIL]%c Lien de réinitialisation : %c${resetLink}`,
        "background: #1579b0; color: white; padding: 2px 5px; border-radius: 3px; font-weight: bold;",
        "color: inherit;",
        "color: #22c55e; font-weight: bold; text-decoration: underline;"
      );
      setDevCode(resetLink);
      
      if (sentSuccess) {
        setSuccessMessage("Un e-mail contenant le lien de réinitialisation a été envoyé avec succès via Resend.");
      } else {
        setSuccessMessage("Le jeton a été créé ! Cependant, l'envoi d'e-mail via le serveur a échoué (pg_net n'est peut-être pas activé sur Supabase). Utilisez le bouton de simulation ci-dessous pour continuer.");
      }
      setForgotEmail('');
    } catch (err) {
      console.error("Request reset error:", err);
      if (err.message === 'email_not_found') {
        setError("Cette adresse e-mail n'est pas enregistrée dans le système.");
      } else {
        setError("Erreur lors de l'envoi du mail de réinitialisation. Veuillez exécuter la dernière migration SQL.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!resetToken) {
      setError("Jeton de réinitialisation manquant. Veuillez utiliser le lien reçu par e-mail.");
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Les mots de passe de confirmation ne correspondent pas.");
      setLoading(false);
      return;
    }

    try {
      await resetPasswordByToken(resetToken, newPassword);
      setSuccessMessage("Votre mot de passe a été réinitialisé avec succès ! Connectez-vous maintenant.");
      setMode('login');
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setDevCode(null);
      if (onClearResetToken) {
        onClearResetToken();
      }
    } catch (err) {
      console.error("Reset password error:", err);
      if (err.message === 'invalid_or_expired_token') {
        setError("Le lien de réinitialisation est invalide ou a expiré. Veuillez refaire une demande.");
      } else {
        setError("Erreur lors du changement de mot de passe. Assurez-vous d'avoir appliqué les dernières colonnes SQL.");
      }
    } finally {
      setLoading(false);
    }
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

        {successMessage && (
          <div className="login-success-badge">
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        {devCode && mode === 'forgot' && (
          <div className="dev-code-notice" style={{ flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <ShieldCheck size={16} />
              <strong>[Simulation Resend]</strong> E-mail envoyé avec succès !
            </div>
            <a 
              href={devCode} 
              className="dev-reset-link"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                color: '#f59e0b',
                textDecoration: 'underline',
                fontSize: '0.75rem',
                wordBreak: 'break-all',
                fontWeight: 600
              }}
            >
              <ExternalLink size={12} />
              <span>Simuler le clic sur le lien reçu</span>
            </a>
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="login-form">
            <div className="login-input-field">
              <label htmlFor="login-email">Adresse e-mail</label>
              <div className="input-with-icon">
                <Mail size={16} className="input-icon" />
                <input 
                  id="login-email"
                  type="email" 
                  placeholder="votre@email.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="login-input-field">
              <div className="password-label-row">
                <label htmlFor="login-password">Mot de passe</label>
                <button 
                  type="button" 
                  className="btn-forgot-password-link"
                  onClick={() => { setMode('forgot'); setError(null); setSuccessMessage(null); setDevCode(null); }}
                >
                  Mot de passe oublié ?
                </button>
              </div>
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
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleRequestReset} className="login-form">
            <div className="forgot-header-text">
              <h3>Réinitialisation du mot de passe</h3>
              <p>Saisissez votre e-mail pour recevoir par e-mail un lien de réinitialisation unique.</p>
            </div>

            <div className="login-input-field">
              <label htmlFor="forgot-email">Adresse e-mail</label>
              <div className="input-with-icon">
                <Mail size={16} className="input-icon" />
                <input 
                  id="forgot-email"
                  type="email" 
                  placeholder="votre@email.com" 
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="forgot-button-row">
              <button 
                type="button" 
                className="btn-login-back"
                onClick={() => { setMode('login'); setError(null); setDevCode(null); }}
                disabled={loading}
              >
                <ChevronLeft size={16} />
                <span>Retour</span>
              </button>

              <button type="submit" className="btn-login-submit" disabled={loading}>
                {loading ? (
                  <span>Envoi...</span>
                ) : (
                  <>
                    <RefreshCw size={16} />
                    <span>Envoyer le lien</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleVerifyAndReset} className="login-form">
            <div className="forgot-header-text">
              <h3>Nouveau mot de passe</h3>
              <p>Choisissez un nouveau mot de passe sécurisé pour votre compte.</p>
            </div>

            <div className="login-input-field">
              <label htmlFor="reset-password">Nouveau mot de passe</label>
              <div className="input-with-icon">
                <Lock size={16} className="input-icon" />
                <input 
                  id="reset-password"
                  type="password" 
                  placeholder="Minimum 6 caractères" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="login-input-field">
              <label htmlFor="reset-confirm">Confirmer le mot de passe</label>
              <div className="input-with-icon">
                <Lock size={16} className="input-icon" />
                <input 
                  id="reset-confirm"
                  type="password" 
                  placeholder="Confirmez le nouveau mot de passe" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="forgot-button-row">
              <button 
                type="button" 
                className="btn-login-back"
                onClick={() => { setMode('login'); setError(null); setDevCode(null); if (onClearResetToken) onClearResetToken(); }}
                disabled={loading}
              >
                <ChevronLeft size={16} />
                <span>Annuler</span>
              </button>

              <button type="submit" className="btn-login-submit" disabled={loading}>
                {loading ? (
                  <span>Réinitialisation...</span>
                ) : (
                  <>
                    <RefreshCw size={16} />
                    <span>Définir le mot de passe</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
