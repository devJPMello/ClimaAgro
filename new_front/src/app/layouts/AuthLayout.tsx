import { Outlet } from 'react-router';
import { Cloud, Sprout } from 'lucide-react';

export function AuthLayout() {
  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-dark via-primary to-primary-light relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40"></div>

        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
              <Cloud className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>
                ClimaAgro
              </h1>
              <p className="text-sm text-white/70">Inteligência Climática Agrícola</p>
            </div>
          </div>

          <div className="space-y-6 max-w-md">
            <h2 className="text-4xl leading-tight" style={{ fontFamily: 'var(--font-serif)' }}>
              Monitore o clima e otimize sua produção agrícola
            </h2>
            <p className="text-lg text-white/80 leading-relaxed">
              Plataforma completa para análise climática, monitoramento de produtividade
              e tomada de decisões baseada em dados geoespaciais e séries temporais.
            </p>
          </div>

          <div className="flex items-center gap-6 text-sm text-white/60">
            <Sprout className="w-20 h-20 opacity-10" />
          </div>
        </div>
      </div>

      {/* Right side - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 bg-background">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
