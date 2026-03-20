import React, { useState } from 'react';
import { Download, FileText, Calendar, MapPin, CheckCircle } from 'lucide-react';
import Layout from './Layout';
import './ExportReport.css';

interface Municipality {
  id: string;
  name: string;
  state: string;
  region: string;
}

interface ReportType {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const ExportReport: React.FC = () => {
  const [selectedMunicipality, setSelectedMunicipality] = useState('');
  const [selectedReportType, setSelectedReportType] = useState('');
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [format, setFormat] = useState('pdf');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const municipalities: Municipality[] = [
    { id: 'palmas', name: 'Palmas', state: 'TO', region: 'Norte' },
    { id: 'gurupi', name: 'Gurupi', state: 'TO', region: 'Sul' },
    { id: 'araguaina', name: 'Araguaína', state: 'TO', region: 'Norte' },
    { id: 'porto-nacional', name: 'Porto Nacional', state: 'TO', region: 'Centro' },
    { id: 'colinas', name: 'Colinas', state: 'TO', region: 'Sul' },
    { id: 'paraiso', name: 'Paraíso do Tocantins', state: 'TO', region: 'Centro' },
    { id: 'tocantinopolis', name: 'Tocantinópolis', state: 'TO', region: 'Norte' },
    { id: 'miracema', name: 'Miracema do Tocantins', state: 'TO', region: 'Centro' }
  ];

  const reportTypes: ReportType[] = [
    {
      id: 'climate',
      name: 'Relatório Climático',
      description: 'Dados de temperatura, umidade, precipitação e vento',
      icon: <Calendar size={24} />
    },
    {
      id: 'productivity',
      name: 'Relatório de Produtividade',
      description: 'Análise de condições para cultivo e produtividade',
      icon: <FileText size={24} />
    },
    {
      id: 'alerts',
      name: 'Relatório de Alertas',
      description: 'Histórico de alertas climáticos e recomendações',
      icon: <CheckCircle size={24} />
    },
    {
      id: 'complete',
      name: 'Relatório Completo',
      description: 'Todos os dados disponíveis para a região',
      icon: <Download size={24} />
    }
  ];

  const handleExport = async () => {
    if (!selectedMunicipality || !selectedReportType) {
      alert('Por favor, selecione um município e um tipo de relatório');
      return;
    }

    setIsExporting(true);
    
    // Simular processo de exportação
    setTimeout(() => {
      setIsExporting(false);
      setExportSuccess(true);
      
      // Reset form after 3 seconds
      setTimeout(() => {
        setExportSuccess(false);
        setSelectedMunicipality('');
        setSelectedReportType('');
        setDateRange({ startDate: '', endDate: '' });
        setFormat('pdf');
      }, 3000);
    }, 2000);
  };

  const selectedMunicipalityData = municipalities.find(m => m.id === selectedMunicipality);
  const selectedReportTypeData = reportTypes.find(r => r.id === selectedReportType);

  return (
    <Layout title="Exportar Relatório">
      <div className="export-report-container">

      <div className="export-content">
        <div className="export-form">
          {/* Municipality Selection */}
          <div className="form-section">
            <h2>Selecionar Município</h2>
            <div className="municipality-grid">
              {municipalities.map(municipality => (
                <button
                  key={municipality.id}
                  className={`municipality-card ${selectedMunicipality === municipality.id ? 'selected' : ''}`}
                  onClick={() => setSelectedMunicipality(municipality.id)}
                >
                  <MapPin size={20} />
                  <div className="municipality-info">
                    <h3>{municipality.name}</h3>
                    <p>{municipality.state} - {municipality.region}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Report Type Selection */}
          <div className="form-section">
            <h2>Tipo de Relatório</h2>
            <div className="report-types-grid">
              {reportTypes.map(reportType => (
                <button
                  key={reportType.id}
                  className={`report-type-card ${selectedReportType === reportType.id ? 'selected' : ''}`}
                  onClick={() => setSelectedReportType(reportType.id)}
                >
                  <div className="report-type-icon">
                    {reportType.icon}
                  </div>
                  <div className="report-type-info">
                    <h3>{reportType.name}</h3>
                    <p>{reportType.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="form-section">
            <h2>Período do Relatório</h2>
            <div className="date-range">
              <div className="date-input-group">
                <label htmlFor="start-date">Data Inicial:</label>
                <input
                  id="start-date"
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                  className="date-input"
                />
              </div>
              <div className="date-input-group">
                <label htmlFor="end-date">Data Final:</label>
                <input
                  id="end-date"
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                  className="date-input"
                />
              </div>
            </div>
          </div>

          {/* Format Selection */}
          <div className="form-section">
            <h2>Formato do Arquivo</h2>
            <div className="format-options">
              <label className="format-option">
                <input
                  type="radio"
                  name="format"
                  value="pdf"
                  checked={format === 'pdf'}
                  onChange={(e) => setFormat(e.target.value)}
                />
                <span>PDF</span>
              </label>
              <label className="format-option">
                <input
                  type="radio"
                  name="format"
                  value="excel"
                  checked={format === 'excel'}
                  onChange={(e) => setFormat(e.target.value)}
                />
                <span>Excel</span>
              </label>
              <label className="format-option">
                <input
                  type="radio"
                  name="format"
                  value="csv"
                  checked={format === 'csv'}
                  onChange={(e) => setFormat(e.target.value)}
                />
                <span>CSV</span>
              </label>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="export-summary">
          <h2>Resumo da Exportação</h2>
          <div className="summary-content">
            {selectedMunicipalityData && selectedReportTypeData ? (
              <>
                <div className="summary-item">
                  <strong>Município:</strong> {selectedMunicipalityData.name} - {selectedMunicipalityData.state}
                </div>
                <div className="summary-item">
                  <strong>Tipo de Relatório:</strong> {selectedReportTypeData.name}
                </div>
                <div className="summary-item">
                  <strong>Período:</strong> {
                    dateRange.startDate && dateRange.endDate 
                      ? `${dateRange.startDate} a ${dateRange.endDate}`
                      : 'Últimos 30 dias'
                  }
                </div>
                <div className="summary-item">
                  <strong>Formato:</strong> {format.toUpperCase()}
                </div>
              </>
            ) : (
              <p className="no-selection">Selecione um município e tipo de relatório para ver o resumo</p>
            )}
          </div>
          
          {/* Export Button inside summary */}
          <div className="export-button-container">
            <button 
              className="export-button"
              onClick={handleExport}
              disabled={!selectedMunicipality || !selectedReportType || isExporting}
            >
              <Download size={20} />
              {isExporting ? 'Exportando...' : 'Exportar'}
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* Success Message */}
      {exportSuccess && (
        <div className="success-overlay">
          <div className="success-message">
            <CheckCircle size={48} />
            <h3>Relatório exportado com sucesso!</h3>
            <p>O download será iniciado automaticamente</p>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default ExportReport;
