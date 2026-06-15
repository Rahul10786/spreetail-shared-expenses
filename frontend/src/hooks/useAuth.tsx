import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, authStorage } from '../services/api';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Synchronize auth state on mount
  useEffect(() => {
    async function loadUser() {
      const token = authStorage.getToken();
      if (token) {
        try {
          const res = await api.get<{ user: User }>('/auth/me');
          setUser(res.user);
          authStorage.setUser(res.user);
        } catch (err) {
          console.error('Failed to authenticate token:', err);
          logout();
        }
      }
      setLoading(false);
    }
    loadUser();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
    authStorage.setToken(res.token);
    authStorage.setUser(res.user);
    setUser(res.user);
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>('/auth/register', { name, email, password });
    authStorage.setToken(res.token);
    authStorage.setUser(res.user);
    setUser(res.user);
  };

  const logout = () => {
    authStorage.clearToken();
    authStorage.clearUser();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
