import { Link } from 'react-router';
import { Cloud, Home } from 'lucide-react';
import { Button } from '../components/ui/Button';

export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center px-4">
        <div className="mb-8">
          <Cloud className="w-24 h-24 mx-auto text-primary mb-6" />
          <h1 className="text-8xl mb-4 text-primary" style={{ fontFamily: 'var(--font-serif)' }}>
            404
          </h1>
          <h2 className="text-2xl mb-3">Página não encontrada</h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-8">
            A página que você está procurando não existe ou foi movida para outro local.
          </p>
          <Link to="/">
            <Button variant="primary">
              <Home className="w-4 h-4" />
              Voltar ao Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
