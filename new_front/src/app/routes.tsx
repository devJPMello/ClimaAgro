import { createBrowserRouter } from "react-router";
import { RootLayout } from "./layouts/RootLayout";
import { AuthLayout } from "./layouts/AuthLayout";
import { Login } from "./pages/Login";
import { Cadastro } from "./pages/Cadastro";
import { Dashboard } from "./pages/Dashboard";
import { MapaClimatico } from "./pages/MapaClimatico";
import { MapaProdutividade } from "./pages/MapaProdutividade";
import { SeriesTemporais } from "./pages/SeriesTemporais";
import { Alertas } from "./pages/Alertas";
import { ExportarRelatorios } from "./pages/ExportarRelatorios";
import { Perfil } from "./pages/Perfil";
import { NotFound } from "./pages/NotFound";
import { RequireAuth, RequireGuest } from "./components/auth/RouteGuards";

function GuestLayout() {
  return (
    <RequireGuest>
      <AuthLayout />
    </RequireGuest>
  );
}

function ProtectedLayout() {
  return (
    <RequireAuth>
      <RootLayout />
    </RequireAuth>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: GuestLayout,
    children: [
      { path: "/login", Component: Login },
      { path: "/cadastro", Component: Cadastro },
    ],
  },
  {
    path: "/",
    Component: ProtectedLayout,
    children: [
      { index: true, Component: Dashboard },
      { path: "mapa-climatico", Component: MapaClimatico },
      { path: "mapa-produtividade", Component: MapaProdutividade },
      { path: "series-temporais", Component: SeriesTemporais },
      { path: "alertas", Component: Alertas },
      { path: "exportar", Component: ExportarRelatorios },
      { path: "perfil", Component: Perfil },
      { path: "*", Component: NotFound },
    ],
  },
]);
