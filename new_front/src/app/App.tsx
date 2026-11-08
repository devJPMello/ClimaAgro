import { RouterProvider } from 'react-router';
import { router } from './routes';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';
import { ClerkTokenSync } from './providers/ClerkTokenSync';

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ClerkTokenSync />
        <RouterProvider router={router} />
        <Toaster
          position="top-right"
          // Abaixo do cabeçalho das páginas: o aviso não pode cobrir botões como o do histórico do IAgro.
          offset={{ top: 88, right: 24 }}
          mobileOffset={{ top: 128, right: 16, left: 16 }}
          richColors
          toastOptions={{
            // No celular o aviso não pode passar da largura da tela.
            style: { width: 'min(420px, calc(100vw - 32px))' },
          }}
        />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
