import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '@clerk/clerk-react';
import { Cloud } from 'lucide-react';

interface GuardProps {
  children: ReactNode;
}

function FullScreenMessage({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6" aria-busy="true">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
          <Cloud className="w-7 h-7 text-primary" />
        </div>
        <p className="text-lg" style={{ fontFamily: 'var(--font-serif)' }}>
          ClimaAgro
        </p>
        <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 rounded-full bg-primary animate-[climaagro-loading_1.2s_ease-in-out_infinite]" />
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
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
