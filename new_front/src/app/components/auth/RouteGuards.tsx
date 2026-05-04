import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '@clerk/clerk-react';
import { useClerkAdmin } from '../../../hooks/useClerkAdmin';

interface GuardProps {
  children: ReactNode;
}

function FullScreenMessage({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-md">
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export function RequireAuth({ children }: GuardProps) {
  const { isLoaded, userId } = useAuth();

  if (!isLoaded) {
    return <FullScreenMessage message="Validando sua sessão..." />;
  }

  if (!userId) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function RequireGuest({ children }: GuardProps) {
  const { isLoaded, userId } = useAuth();

  if (!isLoaded) {
    return <FullScreenMessage message="Carregando autenticação..." />;
  }

  if (userId) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

/** Só monta os filhos se o Clerk ID estiver em `CLERK_ADMIN_USER_IDS` na API (igual ao item da sidebar). */
export function RequireClerkAdmin({ children }: GuardProps) {
  const { isLoaded, userId } = useAuth();
  const { isAdmin, loading } = useClerkAdmin(userId ?? undefined);

  if (!isLoaded) {
    return <FullScreenMessage message="Validando sua sessão..." />;
  }

  if (!userId) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return <FullScreenMessage message="A verificar permissões..." />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
