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
          richColors
          toastOptions={{
            style: { width: '420px' },
          }}
        />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
