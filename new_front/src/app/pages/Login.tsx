import { SignIn } from '@clerk/clerk-react';

export function Login() {
  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Bem-vindo de volta
        </h1>
        <p className="text-muted-foreground">
          Entre com sua conta para continuar
        </p>
      </div>

      {/* Hash routing evita conflito do OAuth com o data router (parâmetros na URL após o Google). */}
      <SignIn
        routing="hash"
        signInUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/login`}
        fallbackRedirectUrl="/"
        appearance={{
          variables: {
            colorPrimary: '#1976D2',
          },
        }}
      />
    </div>
  );
}
