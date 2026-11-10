import { createBrowserRouter, Navigate } from "react-router";
import { RootLayout } from "./layouts/RootLayout";
import { AuthLayout } from "./layouts/AuthLayout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { MapaClimatico } from "./pages/MapaClimatico";
import { MapaProdutividade } from "./pages/MapaProdutividade";
import { SeriesTemporais } from "./pages/SeriesTemporais";
import { ComparadorEstados } from "./pages/ComparadorEstados";
import { Alertas } from "./pages/Alertas";
import { ExportarRelatorios } from "./pages/ExportarRelatorios";
import { IAgro } from "./pages/IAgro";
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
      // A criação de conta é feita pelo Clerk na tela de login.
      { path: "/cadastro", element: <Navigate to="/login" replace /> },
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
      { path: "comparador", Component: ComparadorEstados },
      { path: "alertas", Component: Alertas },
      { path: "exportar", Component: ExportarRelatorios },
      { path: "iagro", Component: IAgro },
      { path: "perfil", Component: Perfil },
      { path: "*", Component: NotFound },
    ],
  },
]);
