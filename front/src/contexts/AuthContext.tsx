import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  favoriteMunicipality: string;
  notificationPreference: string;
  registrationDate: string;
  lastAccess: string;
  exportedReports: number;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  loginWithFacebook: () => Promise<boolean>;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Verificar se há usuário salvo no localStorage
    const savedUser = localStorage.getItem('climaagro_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    // Simulação de login - em produção, isso seria uma chamada para API
    if (email === 'test@test.com' && password === '123456') {
      const userData: User = {
        id: '1',
        name: 'João Pedro Mendes',
        email: 'joaopedromello13@rede.ulbra.br',
        phone: '(63) 99999-9999',
        favoriteMunicipality: 'Palmas - TO',
        notificationPreference: 'Receber alertas por e-mail',
        registrationDate: '12/03/2025',
        lastAccess: new Date().toLocaleString('pt-BR'),
        exportedReports: 8
      };
      setUser(userData);
      localStorage.setItem('climaagro_user', JSON.stringify(userData));
      return true;
    }
    return false;
  };

  const register = async (name: string, email: string, password: string): Promise<boolean> => {
    // Simulação de registro - em produção, isso seria uma chamada para API
    const userData: User = {
      id: Date.now().toString(),
      name,
      email,
      phone: '',
      favoriteMunicipality: '',
      notificationPreference: 'Receber alertas por e-mail',
      registrationDate: new Date().toLocaleDateString('pt-BR'),
      lastAccess: new Date().toLocaleString('pt-BR'),
      exportedReports: 0
    };
    setUser(userData);
    localStorage.setItem('climaagro_user', JSON.stringify(userData));
    return true;
  };

  const loginWithGoogle = async (): Promise<boolean> => {
    // Simulação de login com Google
    const userData: User = {
      id: 'google_1',
      name: 'João Pedro Mendes',
      email: 'joaopedromello13@gmail.com',
      phone: '(63) 99999-9999',
      favoriteMunicipality: 'Palmas - TO',
      notificationPreference: 'Receber alertas por e-mail',
      registrationDate: '12/03/2025',
      lastAccess: new Date().toLocaleString('pt-BR'),
      exportedReports: 8
    };
    setUser(userData);
    localStorage.setItem('climaagro_user', JSON.stringify(userData));
    return true;
  };

  const loginWithFacebook = async (): Promise<boolean> => {
    // Simulação de login com Facebook
    const userData: User = {
      id: 'facebook_1',
      name: 'João Pedro Mendes',
      email: 'joaopedromello13@facebook.com',
      phone: '(63) 99999-9999',
      favoriteMunicipality: 'Palmas - TO',
      notificationPreference: 'Receber alertas por e-mail',
      registrationDate: '12/03/2025',
      lastAccess: new Date().toLocaleString('pt-BR'),
      exportedReports: 8
    };
    setUser(userData);
    localStorage.setItem('climaagro_user', JSON.stringify(userData));
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('climaagro_user');
  };

  const updateUser = (userData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...userData };
      setUser(updatedUser);
      localStorage.setItem('climaagro_user', JSON.stringify(updatedUser));
    }
  };

  const value = {
    user,
    login,
    register,
    loginWithGoogle,
    loginWithFacebook,
    logout,
    updateUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
