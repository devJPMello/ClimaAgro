
  # ClimaAgro web design

  This is a code bundle for ClimaAgro web design. The original project is available at https://www.figma.com/design/Jss2x5BZI5TMCn30pK4SJE/ClimaAgro-web-design.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## API (backend)

  - Defina `VITE_API_URL` com a base da API (ex.: `http://localhost:5000/api`).
  - Relatórios com IA: o fluxo recomendado é **POST** em `ai/reports/generate` no backend (chave `GEMINI_API_KEY` só no servidor). Não use `VITE_GEMINI_API_KEY` nem `VITE_USE_DIRECT_GEMINI=true` em produção.
  