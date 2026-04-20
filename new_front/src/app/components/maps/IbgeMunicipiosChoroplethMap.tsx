import { useCallback, useEffect, useMemo, useState } from 'react';
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Layer } from 'leaflet';
import type { Feature, FeatureCollection } from 'geojson';
import { Button } from '../ui/Button';
import 'leaflet/dist/leaflet.css';
import { getIbgeMalhaUfMunicipiosGeoJsonUrl } from '../../../lib/geo/ibgeMunicipioEnv';
import type { BrazilMapMetric } from './brazilMapConfig';
import { fillColorForMetric, formatPopupValueForMetric, normalizeIbgeMunicipioCode } from './brazilMapConfig';

const TO_CENTER: [number, number] = [-10.25, -48.3];
const TO_ZOOM = 6;

function FitBoundsToGeoJson({ data }: { data: FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    const gj = L.geoJSON(data as L.GeoJSONGeoJson);
    const b = gj.getBounds();
    if (b.isValid()) {
      map.fitBounds(b, { padding: [16, 16], maxZoom: 9 });
    }
  }, [map, data]);
  return null;
}

export interface IbgeMunicipiosChoroplethMapProps {
  metric: BrazilMapMetric;
  valuesByCodarea: Record<string, number>;
  nameByCodarea: Record<string, string>;
  height?: number;
  dataRevision?: number;
}

function codareaFromProperties(props: Record<string, unknown> | undefined): string {
  const raw = props?.codarea ?? props?.CD_MUN ?? props?.cod_municipio;
  return normalizeIbgeMunicipioCode(raw as string | number | undefined);
}

export function IbgeMunicipiosChoroplethMap({
  metric,
  valuesByCodarea,
  nameByCodarea,
  height = 560,
  dataRevision = 0,
}: IbgeMunicipiosChoroplethMapProps) {
  const [geojsonData, setGeojsonData] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGeojson = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = getIbgeMalhaUfMunicipiosGeoJsonUrl();
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Falha ao carregar malha municipal (${response.status})`);
      }
      const data = await response.json();
      if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error('Formato GeoJSON inválido');
      }
      setGeojsonData(data);
    } catch (err) {
      setGeojsonData(null);
      setError(err instanceof Error ? err.message : 'Falha ao carregar malha dos municípios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGeojson();
  }, []);

  const layerKey = useMemo(() => `mun-${metric}-${dataRevision}`, [metric, dataRevision]);

  const hasChoroplethValues = useMemo(
    () => Object.keys(valuesByCodarea).some((k) => valuesByCodarea[k] != null && Number.isFinite(Number(valuesByCodarea[k]))),
    [valuesByCodarea]
  );

  const styleForFeature = useCallback(
    (feature: Feature | undefined) => {
      if (!feature || feature.type !== 'Feature') {
        return { fillColor: '#cbd5e1', weight: 0.5, opacity: 1, color: '#ffffff', fillOpacity: 0.88 };
      }
      const props = feature.properties as Record<string, unknown> | undefined;
      const code = codareaFromProperties(props);
      const v = code && valuesByCodarea[code] != null ? Number(valuesByCodarea[code]) : null;
      const boundary = hasChoroplethValues
        ? { weight: 0.6 as const, color: '#ffffff' as const }
        : { weight: 0.85 as const, color: '#94a3b8' as const };
      return {
        fillColor: fillColorForMetric(metric, v),
        weight: boundary.weight,
        opacity: 1,
        color: boundary.color,
        fillOpacity: hasChoroplethValues ? 0.88 : 0.35,
      };
    },
    [metric, valuesByCodarea, hasChoroplethValues]
  );

  const onEachFeature = useCallback(
    (feature: Feature, layer: Layer) => {
      const props = feature.properties as Record<string, unknown> | undefined;
      const code = codareaFromProperties(props);
      const v = code && valuesByCodarea[code] != null ? Number(valuesByCodarea[code]) : null;
      const nome = (code && nameByCodarea[code]) || (props?.NM_MUN as string) || `Código IBGE ${code || '—'}`;
      const label = formatPopupValueForMetric(metric, v != null && Number.isFinite(v) ? v : null);
      (layer as Layer & { bindPopup: (s: string) => void }).bindPopup(`<strong>${nome}</strong><br/>${label}`);
    },
    [metric, valuesByCodarea, nameByCodarea]
  );

  if (loading) {
    return (
      <div
        className="w-full overflow-hidden rounded-xl bg-muted/40 flex items-center justify-center"
        style={{ height }}
      >
        <p className="text-sm text-muted-foreground">Carregando malha municipal (IBGE)...</p>
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
      <MapContainer center={TO_CENTER} zoom={TO_ZOOM} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {geojsonData && (
          <>
            <FitBoundsToGeoJson data={geojsonData} />
            <GeoJSON
              key={layerKey}
              data={geojsonData}
              style={styleForFeature}
              onEachFeature={onEachFeature}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}
