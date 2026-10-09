import React, { createContext, useState, useContext, useEffect } from 'react';
import { appParams } from '@/lib/app-params';
import { isMock } from '@/lib/utils';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => { checkAppState(); }, []);

  const sdk = async () => (await import('@/api/base44Client')).base44;

  const checkAppState = async () => {
    if (isMock) {
      setUser({ email: 'writer@example.com', full_name: 'כותב' });
      setIsAuthenticated(true); setIsLoadingAuth(false); setIsLoadingPublicSettings(false); setAuthChecked(true);
      return;
    }
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      const base44 = await sdk();
      try {
        await base44.app.getPublicSettings();
        if (appParams.token) await checkUserAuth();
        else { setIsLoadingAuth(false); setIsAuthenticated(false); setAuthChecked(true); }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        const reason = appError?.data?.extra_data?.reason;
        if (appError.status === 403 && reason) setAuthError({ type: reason, message: appError.message });
        else setAuthError({ type: navigator.onLine === false ? 'offline' : 'unknown', message: appError.message || 'Failed to load app' });
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      setAuthError({ type: 'unknown', message: error.message });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const base44 = await sdk();
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      setIsAuthenticated(false);
      if (error.status === 401 || error.status === 403) setAuthError({ type: 'auth_required', message: 'Authentication required' });
    }
    setIsLoadingAuth(false);
    setAuthChecked(true);
  };

  const logout = async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    const base44 = await sdk();
    if (shouldRedirect) base44.auth.logout(window.location.href); else base44.auth.logout();
  };

  const navigateToLogin = async () => {
    const base44 = await sdk();
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings, authError, authChecked, logout, navigateToLogin, checkUserAuth, checkAppState }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
