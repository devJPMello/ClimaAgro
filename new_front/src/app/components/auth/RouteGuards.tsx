import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '@clerk/clerk-react';

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
