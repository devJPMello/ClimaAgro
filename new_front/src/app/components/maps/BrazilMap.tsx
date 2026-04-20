import { useCallback, useEffect, useMemo, useState } from 'react';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import type { Layer } from 'leaflet';
import { Button } from '../ui/Button';
import 'leaflet/dist/leaflet.css';
import type { BrazilMapMetric } from './brazilMapConfig';
import { fillColorForMetric, formatPopupValueForMetric, resolveValueForFeature } from './brazilMapConfig';

interface BrazilMapProps {
  metric: BrazilMapMetric;
  height?: number;
  /** Valores por UF vindos do dashboard (API). Estados sem valor aparecem em cinza. */
  valuesByUf?: Partial<Record<string, number>>;
  /** Incrementar após atualizar dados para forçar repaint das cores no Leaflet. */
  dataRevision?: number;
}

export function BrazilMap({ metric, height = 600, valuesByUf, dataRevision = 0 }: BrazilMapProps) {
  const [geojsonData, setGeojsonData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGeojson = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/data/brazil-states.geojson');
      if (!response.ok) {
        throw new Error(`Falha ao carregar mapa (${response.status})`);
      }
      const data = await response.json();
      if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error('Formato GeoJSON inválido');
      }
      setGeojsonData(data);
    } catch (err) {
      setGeojsonData(null);
      setError(err instanceof Error ? err.message : 'Falha ao carregar dados do mapa');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGeojson();
  }, []);

  const layerKey = useMemo(() => `${metric}-${dataRevision}`, [metric, dataRevision]);

  const styleForFeature = useCallback(
    (feature: GeoJSON.Feature | undefined) => {
      if (!feature || feature.type !== 'Feature') {
        return { fillColor: '#94a3b8', weight: 1, opacity: 1, color: '#ffffff', fillOpacity: 0.85 };
      }
      const v = resolveValueForFeature(metric, feature as { properties?: Record<string, unknown> }, valuesByUf);
      return {
        fillColor: fillColorForMetric(metric, v),
        weight: 1,
        opacity: 1,
        color: '#ffffff',
        fillOpacity: 0.85,
      };
    },
    [metric, valuesByUf]
  );

  const onEachFeature = useCallback(
    (feature: GeoJSON.Feature, layer: Layer) => {
      const props = feature.properties as Record<string, unknown> | undefined;
      const name = (props?.name as string) || (props?.estado as string) || 'Estado';
      const ufRaw = props?.state ?? props?.sigla ?? props?.UF;
      const uf = String(ufRaw || '')
        .trim()
        .toUpperCase()
        .slice(0, 2);
      const v = resolveValueForFeature(metric, feature as { properties?: Record<string, unknown> }, valuesByUf);
      const label =
        v == null || Number.isNaN(v) ? 'Sem dado para esta UF' : formatPopupValueForMetric(metric, v);
      (layer as Layer & { bindPopup: (s: string) => void }).bindPopup(
        `<strong>${name}${uf ? ` (${uf})` : ''}</strong><br/>${label}`
      );
    },
    [metric, valuesByUf]
  );

  if (loading) {
    return (
      <div
        className="w-full overflow-hidden rounded-xl bg-muted/40 flex items-center justify-center"
        style={{ height }}
      >
        <p className="text-sm text-muted-foreground">Carregando mapa...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="w-full overflow-hidden rounded-xl border border-destructive/20 bg-destructive/5 flex flex-col items-center justify-center gap-3 p-6"
        style={{ height }}
      >
        <p className="text-sm text-destructive text-center">{error}</p>
        <Button variant="secondary" onClick={loadGeojson}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-xl" style={{ height }}>
      <MapContainer center={[-14.5, -52.5]} zoom={4} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {geojsonData && (
          <GeoJSON
            key={layerKey}
            data={geojsonData}
            style={styleForFeature}
            onEachFeature={onEachFeature}
          />
        )}
      </MapContainer>
    </div>
  );
}
