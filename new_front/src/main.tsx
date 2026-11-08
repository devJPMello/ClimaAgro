
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { ptBR } from "@clerk/localizations";
import App from "./app/App.tsx";
import "./styles/index.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found.");
}

const root = createRoot(rootElement);

if (!publishableKey) {
  root.render(
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-lg text-center space-y-3">
        <h1 className="text-2xl">Configuração pendente</h1>
        <p className="text-muted-foreground">
          Defina <code>VITE_CLERK_PUBLISHABLE_KEY</code> no arquivo <code>.env</code> para habilitar autenticação.
        </p>
      </div>
    </div>
  );
} else {
  root.render(
    <ClerkProvider
      publishableKey={publishableKey}
      localization={ptBR}
      // Esconde o selo "Development mode" (instância de desenvolvimento do Clerk, sem domínio próprio).
      appearance={{ layout: { unsafe_disableDevelopmentModeWarnings: true } }}
    >
      <App />
    </ClerkProvider>
  );
}
  