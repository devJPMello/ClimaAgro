/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  /** Base da API (ex.: http://localhost:5000/api). Opcional em dev — o cliente usa localhost:5000/api. */
  readonly VITE_API_URL?: string;
  readonly VITE_APP_NAME: string;
  /** Endpoint interno para geracao de relatorios com IA no backend. */
  readonly VITE_AI_REPORTS_ENDPOINT?: string;
  /** Se `true`, o front chama Gemini diretamente (nao recomendado para producao). */
  readonly VITE_USE_DIRECT_GEMINI?: string;
  /** Chave Gemini para ambiente de desenvolvimento/POC. */
  readonly VITE_GEMINI_API_KEY?: string;
  /** Modelo Gemini, ex.: gemini-1.5-flash. */
  readonly VITE_GEMINI_MODEL?: string;
  /** URL base opcional da API Gemini compatível com generateContent. */
  readonly VITE_GEMINI_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
