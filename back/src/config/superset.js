const axios = require('axios');

// Configuração do Apache Superset
const SUPERSET_CONFIG = {
  baseUrl: process.env.SUPERSET_URL || 'http://localhost:8088',
  username: process.env.SUPERSET_USERNAME || 'admin',
  password: process.env.SUPERSET_PASSWORD || 'admin',
  apiPath: '/api/v1',
  timeout: 30000
};

class SupersetClient {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
  }

  async authenticate() {
    try {
      const response = await axios.post(`${SUPERSET_CONFIG.baseUrl}${SUPERSET_CONFIG.apiPath}/security/login`, {
        username: SUPERSET_CONFIG.username,
        password: SUPERSET_CONFIG.password,
        provider: 'db',
        refresh: true
      });

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      this.tokenExpiry = new Date(Date.now() + (response.data.exp * 1000));

      console.log('✅ Autenticado no Apache Superset com sucesso');
      return true;
    } catch (error) {
      console.error('❌ Erro ao autenticar no Superset:', error.response?.data || error.message);
      return false;
    }
  }

  async ensureAuthenticated() {
    if (!this.accessToken || !this.tokenExpiry || new Date() >= this.tokenExpiry) {
      return await this.authenticate();
    }
    return true;
  }

  async getHeaders() {
    await this.ensureAuthenticated();
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  // Criar dataset para dados de produtividade
  async createProductivityDataset() {
    try {
      const headers = await this.getHeaders();
      
      const datasetData = {
        table_name: 'productivity_view',
        database: 1, // ID do banco de dados no Superset
        schema: 'public',
        sql: `
          SELECT 
            p.id,
            p.year,
            p.season,
            p.crop_type,
            p.productivity,
            p.planted_area,
            p.total_production,
            p.historical_average,
            p.variation_from_average,
            p.soil_quality_index,
            p.climate_suitability_index,
            p.technology_level,
            p.irrigation_used,
            p.data_source,
            p.data_reliability,
            p.status,
            p.created_at,
            p.updated_at,
            g.name as region_name,
            g.state,
            g.region,
            g.ibge_code
          FROM productivity p
          JOIN geo_data g ON p.geo_data_id = g.id
          WHERE g.is_active = true
        `,
        is_managed_externally: false
      };

      const response = await axios.post(
        `${SUPERSET_CONFIG.baseUrl}${SUPERSET_CONFIG.apiPath}/dataset/`,
        datasetData,
        { headers }
      );

      console.log('✅ Dataset de produtividade criado no Superset');
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao criar dataset de produtividade:', error.response?.data || error.message);
      throw error;
    }
  }

  // Criar dataset para dados climáticos
  async createClimateDataset() {
    try {
      const headers = await this.getHeaders();
      
      const datasetData = {
        table_name: 'climate_view',
        database: 1,
        schema: 'public',
        sql: `
          SELECT 
            c.id,
            c.date,
            c.year,
            c.month,
            c.day,
            c.avg_temperature,
            c.max_temperature,
            c.min_temperature,
            c.precipitation,
            c.humidity,
            c.wind_speed,
            c.wind_direction,
            c.atmospheric_pressure,
            c.solar_radiation,
            c.evapotranspiration,
            c.water_stress_index,
            c.climate_suitability_index,
            c.consecutive_dry_days,
            c.rainy_days,
            c.monthly_precipitation,
            c.monthly_avg_temperature,
            c.data_source,
            c.weather_station,
            c.station_code,
            c.data_quality,
            c.status,
            c.created_at,
            c.updated_at,
            g.name as region_name,
            g.state,
            g.region,
            g.ibge_code
          FROM climate_data c
          JOIN geo_data g ON c.geo_data_id = g.id
          WHERE g.is_active = true
        `,
        is_managed_externally: false
      };

      const response = await axios.post(
        `${SUPERSET_CONFIG.baseUrl}${SUPERSET_CONFIG.apiPath}/dataset/`,
        datasetData,
        { headers }
      );

      console.log('✅ Dataset climático criado no Superset');
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao criar dataset climático:', error.response?.data || error.message);
      throw error;
    }
  }

  // Criar dashboard de produtividade
  async createProductivityDashboard() {
    try {
      const headers = await this.getHeaders();
      
      const dashboardData = {
        dashboard_title: 'Dashboard de Produtividade Agrícola',
        slug: 'produtividade-agricola',
        position_json: {
          DASHBOARD_VERSION_KEY: 'v2',
          DASHBOARD_ROOT_ID: 'ROOT_ID',
          'ROOT_ID': {
            type: 'ROOT',
            id: 'ROOT_ID',
            children: ['GRID_ID']
          },
          'GRID_ID': {
            type: 'GRID',
            id: 'GRID_ID',
            children: ['CHART-1', 'CHART-2', 'CHART-3', 'CHART-4']
          },
          'CHART-1': {
            type: 'CHART',
            id: 'CHART-1',
            children: [],
            meta: {
              width: 6,
              height: 4,
              chartId: 'productivity-map'
            }
          },
          'CHART-2': {
            type: 'CHART',
            id: 'CHART-2',
            children: [],
            meta: {
              width: 6,
              height: 4,
              chartId: 'productivity-trend'
            }
          },
          'CHART-3': {
            type: 'CHART',
            id: 'CHART-3',
            children: [],
            meta: {
              width: 6,
              height: 4,
              chartId: 'climate-correlation'
            }
          },
          'CHART-4': {
            type: 'CHART',
            id: 'CHART-4',
            children: [],
            meta: {
              width: 6,
              height: 4,
              chartId: 'regional-comparison'
            }
          }
        },
        css: '',
        json_metadata: JSON.stringify({
          filter_scopes: {},
          expanded_slices: {},
          refresh_frequency: 0,
          color_scheme: 'supersetColors',
          label_colors: {},
          timed_refresh_immune_slices: [],
          chart_configuration: {}
        }),
        published: true
      };

      const response = await axios.post(
        `${SUPERSET_CONFIG.baseUrl}${SUPERSET_CONFIG.apiPath}/dashboard/`,
        dashboardData,
        { headers }
      );

      console.log('✅ Dashboard de produtividade criado no Superset');
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao criar dashboard de produtividade:', error.response?.data || error.message);
      throw error;
    }
  }

  // Criar gráfico de mapa de calor de produtividade
  async createProductivityHeatmap() {
    try {
      const headers = await this.getHeaders();
      
      const chartData = {
        slice_name: 'Mapa de Produtividade por Região',
        viz_type: 'heatmap',
        datasource_id: 1, // ID do dataset de produtividade
        datasource_type: 'table',
        params: JSON.stringify({
          all_columns_x: 'region',
          all_columns_y: 'year',
          metric: 'productivity',
          adhoc_filters: [],
          row_limit: 1000,
          sort_by_metric: true,
          normalize_across: 'heatmap',
          xscale_interval: 1,
          yscale_interval: 1,
          left_columns: [],
          right_columns: []
        }),
        query_context: JSON.stringify({
          datasource: {
            id: 1,
            type: 'table'
          }
        })
      };

      const response = await axios.post(
        `${SUPERSET_CONFIG.baseUrl}${SUPERSET_CONFIG.apiPath}/chart/`,
        chartData,
        { headers }
      );

      console.log('✅ Gráfico de mapa de calor criado no Superset');
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao criar gráfico de mapa de calor:', error.response?.data || error.message);
      throw error;
    }
  }

  // Criar gráfico de série temporal
  async createTimeSeriesChart() {
    try {
      const headers = await this.getHeaders();
      
      const chartData = {
        slice_name: 'Série Temporal de Produtividade vs Clima',
        viz_type: 'line',
        datasource_id: 1,
        datasource_type: 'table',
        params: JSON.stringify({
          metrics: ['productivity', 'avg_temperature', 'precipitation'],
          groupby: ['year'],
          adhoc_filters: [],
          row_limit: 1000,
          x_axis: 'year',
          y_axis: 'productivity',
          color_scheme: 'supersetColors',
          line_interpolation: 'linear',
          show_legend: true,
          rich_tooltip: true,
          show_markers: true
        }),
        query_context: JSON.stringify({
          datasource: {
            id: 1,
            type: 'table'
          }
        })
      };

      const response = await axios.post(
        `${SUPERSET_CONFIG.baseUrl}${SUPERSET_CONFIG.apiPath}/chart/`,
        chartData,
        { headers }
      );

      console.log('✅ Gráfico de série temporal criado no Superset');
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao criar gráfico de série temporal:', error.response?.data || error.message);
      throw error;
    }
  }

  // Obter URL do dashboard
  async getDashboardUrl(dashboardId) {
    return `${SUPERSET_CONFIG.baseUrl}/superset/dashboard/${dashboardId}/`;
  }

  // Listar todos os dashboards
  async listDashboards() {
    try {
      const headers = await this.getHeaders();
      
      const response = await axios.get(
        `${SUPERSET_CONFIG.baseUrl}${SUPERSET_CONFIG.apiPath}/dashboard/`,
        { headers }
      );

      return response.data;
    } catch (error) {
      console.error('❌ Erro ao listar dashboards:', error.response?.data || error.message);
      throw error;
    }
  }

  // Configurar integração completa
  async setupIntegration() {
    try {
      console.log('🚀 Iniciando configuração do Apache Superset...');

      // Autenticar
      const authenticated = await this.authenticate();
      if (!authenticated) {
        throw new Error('Falha na autenticação com Superset');
      }

      // Criar datasets
      await this.createProductivityDataset();
      await this.createClimateDataset();

      // Criar gráficos
      await this.createProductivityHeatmap();
      await this.createTimeSeriesChart();

      // Criar dashboard
      const dashboard = await this.createProductivityDashboard();
      
      console.log('🎉 Integração com Superset configurada com sucesso!');
      console.log(`📊 Dashboard disponível em: ${await this.getDashboardUrl(dashboard.id)}`);

      return {
        success: true,
        dashboardUrl: await this.getDashboardUrl(dashboard.id),
        dashboardId: dashboard.id
      };
    } catch (error) {
      console.error('❌ Erro na configuração do Superset:', error);
      throw error;
    }
  }
}

// Instância singleton
const supersetClient = new SupersetClient();

module.exports = {
  SupersetClient,
  supersetClient,
  SUPERSET_CONFIG
};
