# ClimaAgro - Sistema de Monitoramento Climático

Sistema completo para monitoramento climático agrícola com front-end React e back-end Node.js, incluindo mapas interativos, alertas climáticos e relatórios personalizados.

## 📁 Estrutura do Projeto

```
ClimaAgro/
├── front/                 # Front-end React + TypeScript
│   ├── src/
│   │   ├── components/   # Componentes React
│   │   ├── contexts/     # Contextos (Auth, etc.)
│   │   └── ...
│   ├── public/           # Arquivos públicos
│   ├── package.json      # Dependências do front
│   └── tsconfig.json     # Configuração TypeScript
├── back/                 # Back-end Node.js + Express
│   ├── src/
│   │   ├── controllers/  # Controladores da API
│   │   ├── models/       # Modelos de dados
│   │   ├── routes/       # Rotas da API
│   │   ├── middleware/   # Middlewares
│   │   └── ...
│   ├── package.json      # Dependências do back
│   └── env.example       # Variáveis de ambiente
└── README.md
```

## 🚀 Funcionalidades

### Autenticação
- ✅ Login com email e senha
- ✅ Cadastro de usuários
- ✅ Login social (Google e Facebook)
- ✅ Validação de senhas

### Dashboard Principal
- ✅ Mapa geoespacial interativo
- ✅ Sidebar com navegação
- ✅ Resumo climático da região
- ✅ Ações rápidas

### Mapa Interativo
- ✅ Visualização de dados GeoJSON
- ✅ Popups informativos por região
- ✅ Legenda de temperatura
- ✅ Controles de camadas

### Alertas Climáticos
- ✅ Cards de alertas ativos
- ✅ Filtro por região
- ✅ Busca por texto
- ✅ Diferentes níveis de severidade

### Exportação de Relatórios
- ✅ Seleção de município
- ✅ Tipos de relatório (climático, produtividade, alertas, completo)
- ✅ Período personalizado
- ✅ Múltiplos formatos (PDF, Excel, CSV)

### Perfil do Usuário
- ✅ Visualização de dados pessoais
- ✅ Histórico de relatórios exportados
- ✅ Municípios mais consultados
- ✅ Últimos acessos ao sistema
- ✅ Exportação de dados completos

### Edição de Perfil
- ✅ Edição de informações pessoais
- ✅ Configuração de preferências
- ✅ Município favorito
- ✅ Preferências de notificação
- ✅ Pré-visualização em tempo real

## 🛠️ Tecnologias Utilizadas

- **React 18** - Biblioteca principal
- **TypeScript** - Tipagem estática
- **React Router DOM** - Roteamento
- **Leaflet** - Mapas interativos
- **React Leaflet** - Componentes de mapa
- **Lucide React** - Ícones
- **CSS3** - Estilização

## 📦 Instalação

### Front-end (React)

1. Navegue para a pasta front:
```bash
cd front
```

2. Instale as dependências:
```bash
npm install
```

3. Execute o projeto:
```bash
npm start
```

4. Acesse no navegador:
```
http://localhost:3000
```

### Back-end (Node.js)

1. Navegue para a pasta back:
```bash
cd back
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp env.example .env
# Edite o arquivo .env com suas configurações
```

4. Execute o servidor:
```bash
npm run dev
```

5. A API estará disponível em:
```
http://localhost:5000
```

## 🎯 Como Usar

### Login
- Use as credenciais de teste: `test@test.com` / `123456`
- Ou teste o login social (simulado)

### Navegação
- **Dashboard**: Tela principal com resumo e ações rápidas
- **Mapa Interativo**: Visualização completa do mapa com dados GeoJSON
- **Alertas Climáticos**: Lista de alertas com filtros
- **Exportar Relatório**: Geração de relatórios por município
- **Meu Perfil**: Dados pessoais e estatísticas
- **Editar Perfil**: Configurações e preferências

### Funcionalidades Principais
1. **Visualizar Mapa**: Clique em "Visualizar Mapa Interativo" no dashboard
2. **Ver Alertas**: Acesse "Ver Alertas Climáticos" para ver alertas ativos
3. **Exportar Relatório**: Use "Exportar Relatório" para gerar relatórios
4. **Configurar Perfil**: Acesse "Meu Perfil" e clique em "Editar Perfil"

## 📱 Responsividade

O sistema é totalmente responsivo e funciona em:
- Desktop (1200px+)
- Tablet (768px - 1199px)
- Mobile (até 767px)

## 🎨 Design

- Interface moderna e limpa
- Cores baseadas em gradientes azul/roxo
- Cards com sombras suaves
- Animações e transições fluidas
- Ícones consistentes (Lucide React)

## 🔧 Estrutura do Projeto

```
src/
├── components/          # Componentes React
│   ├── Login.tsx       # Tela de login
│   ├── Register.tsx    # Tela de cadastro
│   ├── Dashboard.tsx   # Dashboard principal
│   ├── InteractiveMap.tsx # Mapa interativo
│   ├── WeatherAlerts.tsx  # Alertas climáticos
│   ├── ExportReport.tsx   # Exportação de relatórios
│   ├── Profile.tsx     # Perfil do usuário
│   └── EditProfile.tsx # Edição de perfil
├── contexts/           # Contextos React
│   └── AuthContext.tsx # Contexto de autenticação
├── App.tsx            # Componente principal
└── index.tsx          # Ponto de entrada
```

## 🚀 Próximos Passos

Para implementar em produção, considere:

1. **Backend**: Implementar APIs reais para autenticação e dados
2. **Banco de Dados**: Conectar com banco para persistir dados
3. **Autenticação Social**: Integrar com APIs reais do Google/Facebook
4. **Dados GeoJSON**: Conectar com fontes reais de dados climáticos
5. **Notificações**: Implementar sistema real de notificações
6. **Testes**: Adicionar testes unitários e de integração

## 📄 Licença

Este projeto é para fins educacionais e de demonstração.
