import { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Coins,
  AlertTriangle,
  List,
  Search,
  RotateCcw,
  Filter
} from 'lucide-react';
import './PerformancePanel.css';
import { supabase } from '../utils/supabaseClient';

// RFC-compliant CSV Parser
function parseCSV(text) {
  const lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"') {
        if (next === '"') {
          row[row.length - 1] += '"';
          i++; // Skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        row[row.length - 1] += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push('');
      } else if (c === '\r' || c === '\n') {
        if (c === '\r' && next === '\n') {
          i++;
        }
        lines.push(row);
        row = [''];
      } else {
        row[row.length - 1] += c;
      }
    }
  }

  if (row.length > 1 || row[0] !== '') {
    lines.push(row);
  }

  return lines;
}

// Helpers for calculations
function parseDurationToSeconds(durationStr) {
  if (!durationStr || !durationStr.includes(':')) return 0;
  const parts = durationStr.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}


function parseCurrencyToNumber(valStr, currencyType) {
  if (!valStr) return 0;
  // Clean all characters except digits and comma/dot
  if (currencyType === 'ar') {
    return parseFloat(valStr.replace(/[^\d]/g, '')) || 0;
  } else if (currencyType === 'eur') {
    return parseFloat(valStr.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  }
  return 0;
}



export default function PerformancePanel() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [datasource, setDatasource] = useState('live'); // 'live' or 'fallback'

  // Filter States
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterCollaborator, setFilterCollaborator] = useState('all');
  const [filterClient, setFilterClient] = useState('all');
  const [filterTask, setFilterTask] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Chart Metric Selection
  const [collabMetric, setCollabMetric] = useState('hours'); // 'hours' or 'cost'
  const [clientMetric, setClientMetric] = useState('hours'); // 'hours' or 'cost'

  const processCsvText = (text) => {
    const rawRows = parseCSV(text);
    if (rawRows.length < 2) {
      setData([]);
      return;
    }

    // Identify header index
    // Expected header: Horodateur,Mois,Collaborateur,Client,Tâche,Durée Calculée,Notes / Déductions,Durée Finale,Coût Ar,Coût €
    const headers = rawRows[0].map(h => h.trim());

    const parsedData = rawRows.slice(1).map((row, index) => {
      // Map columns defensively in case column order changes or misses
      const getVal = (colName) => {
        const idx = headers.indexOf(colName);
        return idx !== -1 ? row[idx] || '' : '';
      };

      const durationStr = getVal('Durée Finale') || getVal('Durée Calculée');
      const durationSeconds = parseDurationToSeconds(durationStr);
      const costAr = parseCurrencyToNumber(getVal('Coût Ar'), 'ar');
      const costEur = parseCurrencyToNumber(getVal('Coût €'), 'eur');
      const notes = getVal('Notes / Déductions');
      const dateStr = getVal('Horodateur');

      // Exception check
      const hasAlert = notes.includes('🔴') || notes.includes('⚠️') ||
        /retard|oubli/i.test(notes);

      return {
        id: index,
        date: dateStr,
        month: getVal('Mois'),
        collaborator: getVal('Collaborateur'),
        client: getVal('Client') || '-',
        task: getVal('Tâche'),
        durationStr,
        durationSeconds,
        notes,
        costAr,
        costEur,
        costArStr: getVal('Coût Ar'),
        costEurStr: getVal('Coût €'),
        hasAlert
      };
    }).filter(item => item.date && item.collaborator); // filter out empty entries

    setData(parsedData);
  };

  // Load CSV data
  useEffect(() => {
    const liveUrl = 'https://docs.google.com/spreadsheets/d/1yt1xjv8eFcasWs2rwJm8OZa_dyKQNUKdrSKsSs8MBq0/export?format=csv&gid=0';
    const fallbackUrl = '/performance_sheet.csv';

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Try live spreadsheet fetch via Supabase Edge Function first
        console.log('Fetching live Google Sheet via Supabase Edge Function...');
        const { data: csvText, error: invokeErr } = await supabase.functions.invoke('fetch-performance-sheet');
        if (invokeErr) throw invokeErr;
        if (!csvText) throw new Error("Aucune donnée reçue de la fonction Edge");

        processCsvText(csvText);
        setDatasource('live');
      } catch (liveErr) {
        console.warn('Failed to fetch live Google Sheet via Edge Function, falling back to local file. Error:', liveErr.message);

        try {
          // Fetch fallback local file
          const response = await fetch(fallbackUrl);
          if (!response.ok) throw new Error(`Status ${response.status}`, { cause: liveErr });
          const text = await response.text();

          processCsvText(text);
          setDatasource('fallback');
        } catch (fallbackErr) {
          console.error('Failed to load fallback CSV. Error:', fallbackErr.message);
          setError('Impossible de charger les données de performance. Veuillez vérifier votre connexion ou réessayez.');
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Get dynamic unique lists for filters
  const uniqueMonths = useMemo(() => {
    const set = new Set(data.map(item => item.month));
    return Array.from(set).filter(Boolean).sort();
  }, [data]);

  const uniqueCollaborators = useMemo(() => {
    const set = new Set(data.map(item => item.collaborator));
    return Array.from(set).filter(Boolean).sort();
  }, [data]);

  const uniqueClients = useMemo(() => {
    const set = new Set(data.map(item => item.client));
    return Array.from(set).filter(Boolean).sort();
  }, [data]);

  const uniqueTasks = useMemo(() => {
    const set = new Set(data.map(item => item.task));
    return Array.from(set).filter(Boolean).sort();
  }, [data]);

  // Apply filters
  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchMonth = filterMonth === 'all' || item.month === filterMonth;
      const matchCollab = filterCollaborator === 'all' || item.collaborator === filterCollaborator;
      const matchClient = filterClient === 'all' || item.client === filterClient;
      const matchTask = filterTask === 'all' || item.task === filterTask;

      const q = searchQuery.toLowerCase();
      const matchQuery = !searchQuery ||
        item.collaborator.toLowerCase().includes(q) ||
        item.client.toLowerCase().includes(q) ||
        item.task.toLowerCase().includes(q) ||
        item.notes.toLowerCase().includes(q);

      return matchMonth && matchCollab && matchClient && matchTask && matchQuery;
    });
  }, [data, filterMonth, filterCollaborator, filterClient, filterTask, searchQuery]);

  // Calculate stats based on filtered data
  const stats = useMemo(() => {
    let totalSeconds = 0;
    let totalAr = 0;
    let totalEur = 0;
    let alertsCount = 0;

    filteredData.forEach(item => {
      totalSeconds += item.durationSeconds;
      totalAr += item.costAr;
      totalEur += item.costEur;
      if (item.hasAlert) {
        alertsCount++;
      }
    });

    return {
      totalSeconds,
      hours: Math.floor(totalSeconds / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      totalAr,
      totalEur,
      alertsCount,
      totalEntries: filteredData.length
    };
  }, [filteredData]);

  // Collaborator breakdown for charts
  const collaboratorBreakdown = useMemo(() => {
    const map = {};
    filteredData.forEach(item => {
      const name = item.collaborator;
      if (!map[name]) {
        map[name] = { seconds: 0, costAr: 0, costEur: 0, count: 0 };
      }
      map[name].seconds += item.durationSeconds;
      map[name].costAr += item.costAr;
      map[name].costEur += item.costEur;
      map[name].count += 1;
    });

    return Object.entries(map).map(([name, val]) => ({
      name,
      hours: parseFloat((val.seconds / 3600).toFixed(1)),
      costAr: Math.round(val.costAr),
      costEur: parseFloat(val.costEur.toFixed(2)),
      count: val.count
    })).sort((a, b) => {
      const metric = collabMetric === 'hours' ? 'hours' : 'costEur';
      return b[metric] - a[metric];
    }).slice(0, 10); // Top 10
  }, [filteredData, collabMetric]);

  // Client breakdown for charts
  const clientBreakdown = useMemo(() => {
    const map = {};
    filteredData.forEach(item => {
      const client = item.client;
      if (!map[client]) {
        map[client] = { seconds: 0, costAr: 0, costEur: 0, count: 0 };
      }
      map[client].seconds += item.durationSeconds;
      map[client].costAr += item.costAr;
      map[client].costEur += item.costEur;
      map[client].count += 1;
    });

    return Object.entries(map).map(([name, val]) => ({
      name,
      hours: parseFloat((val.seconds / 3600).toFixed(1)),
      costAr: Math.round(val.costAr),
      costEur: parseFloat(val.costEur.toFixed(2)),
      count: val.count
    })).sort((a, b) => {
      const metric = clientMetric === 'hours' ? 'hours' : 'costEur';
      return b[metric] - a[metric];
    }).slice(0, 10); // Top 10
  }, [filteredData, clientMetric]);

  // Reset all filters
  const resetFilters = () => {
    setFilterMonth('all');
    setFilterCollaborator('all');
    setFilterClient('all');
    setFilterTask('all');
    setSearchQuery('');
  };



  // Format currency display helper
  const formatAriary = (num) => {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(num) + ' Ar';
  };

  const formatEuro = (num) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  };

  // Render SVG Horizontal Bar Chart
  const renderBarChart = (chartData, metric, setMetric, title, colorClass, filterSetter) => {
    const width = 500;
    const paddingLeft = 140;
    const paddingRight = 60;
    const chartWidth = width - paddingLeft - paddingRight;
    const barHeight = 22;
    const barGap = 6;
    const height = chartData.length * (barHeight + barGap) + 30;

    const maxVal = Math.max(...chartData.map(d => metric === 'hours' ? d.hours : d.costEur), 0.1);

    return (
      <div className="perf-chart-card glass-panel animate-fade-in">
        <div className="perf-chart-title">
          <div>
            <h3>{title}</h3>
            <span className="perf-chart-subtitle">Top 10 contributeurs</span>
          </div>

          <div className="perf-chart-toggle">
            <button
              className={`perf-toggle-btn ${metric === 'hours' ? 'active' : ''}`}
              onClick={() => setMetric('hours')}
            >
              Heures
            </button>
            <button
              className={`perf-toggle-btn ${metric === 'cost' ? 'active' : ''}`}
              onClick={() => setMetric('cost')}
            >
              Coût (€)
            </button>
          </div>
        </div>

        <div className="perf-chart-container">
          {chartData.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Aucune donnée à afficher.
            </div>
          ) : (
            <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
              {/* Grid Lines */}
              {[0.25, 0.5, 0.75, 1].map((ratio, i) => {
                const x = paddingLeft + ratio * chartWidth;
                return (
                  <g key={i}>
                    <line x1={x} y1={10} x2={x} y2={height - 20} className="svg-grid-line" />
                    <text x={x} y={height - 5} textAnchor="middle" className="svg-axis-label">
                      {metric === 'hours'
                        ? `${Math.round(ratio * maxVal)}h`
                        : `${Math.round(ratio * maxVal)}€`
                      }
                    </text>
                  </g>
                );
              })}

              {/* Data Bars */}
              {chartData.map((d, index) => {
                const val = metric === 'hours' ? d.hours : d.costEur;
                const barWidth = (val / maxVal) * chartWidth;
                const y = index * (barHeight + barGap) + 15;

                return (
                  <g key={d.name} onClick={() => filterSetter(d.name)} style={{ cursor: 'pointer' }}>
                    <title>{`${d.name}: ${val} ${metric === 'hours' ? 'heures' : '€'} (${formatAriary(d.costAr)} / ${d.count} tâches)`}</title>
                    {/* Collaborator / Client Name */}
                    <text
                      x={paddingLeft - 10}
                      y={y + barHeight / 2 + 4}
                      textAnchor="end"
                      className="svg-label"
                      style={{ fontSize: '10px' }}
                    >
                      {d.name.length > 20 ? `${d.name.slice(0, 18)}...` : d.name}
                    </text>

                    {/* Progress Bar background */}
                    <rect
                      x={paddingLeft}
                      y={y}
                      width={chartWidth}
                      height={barHeight}
                      rx="3"
                      fill="rgba(255,255,255,0.02)"
                    />

                    {/* Progress Bar fill */}
                    <rect
                      x={paddingLeft}
                      y={y}
                      width={Math.max(barWidth, 2)}
                      height={barHeight}
                      rx="3"
                      className="svg-bar"
                      fill={colorClass}
                    />

                    {/* Value label */}
                    <text
                      x={paddingLeft + barWidth + 8}
                      y={y + barHeight / 2 + 4}
                      className="svg-value"
                    >
                      {metric === 'hours' ? `${val}h` : `${val} €`}
                    </text>
                  </g>
                );
              })}

              {/* Y Axis line */}
              <line x1={paddingLeft} y1={10} x2={paddingLeft} y2={height - 20} className="svg-axis-line" />
            </svg>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="performance-container">
        <div className="perf-loading-overlay glass-panel">
          <div className="perf-spinner"></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 500 }}>
            Chargement et calcul des indicateurs de performance...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="performance-container">
        <div className="perf-error-box glass-panel">
          <AlertTriangle size={48} />
          <h3>Une erreur est survenue</h3>
          <p>{error}</p>
          <button className="perf-btn perf-btn-primary" onClick={() => window.location.reload()}>
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="performance-container">
      {/* Header Info */}
      <div className="perf-header-row">
        <div className="perf-title-area">
          <h2>📊 Rendement et valorisation du temps de travail</h2>
          <p>
            Analyse et coûts du temps passé par collaborateur et par client (Source : Google Sheets{' '}
            <span style={{
              background: datasource === 'live' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
              color: datasource === 'live' ? '#34d399' : '#fbbf24',
              padding: '0.15rem 0.45rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 600
            }}>
              {datasource === 'live' ? 'Synchronisé' : 'Données locales'}
            </span>)
          </p>
        </div>
        <div className="perf-header-actions">
          <button className="perf-btn" onClick={resetFilters}>
            <RotateCcw size={15} /> Réinitialiser
          </button>
        </div>
      </div>

      {/* Interactive Filters Panel */}
      <div className="perf-filters-panel glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--surface-border)', paddingBottom: '0.5rem' }}>
          <Filter size={16} style={{ color: 'var(--primary-color)' }} />
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Filtres de Données</h3>
        </div>

        <div className="perf-filters-grid">
          {/* Search query */}
          <div className="perf-filter-group">
            <label>Recherche textuelle</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Rechercher collab, client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="perf-input"
                style={{ paddingLeft: '2rem' }}
              />
              <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
          </div>

          {/* Month filter */}
          <div className="perf-filter-group">
            <label>Période (Mois)</label>
            <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="perf-select">
              <option value="all">Tous les mois</option>
              {uniqueMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Collaborator filter */}
          <div className="perf-filter-group">
            <label>Collaborateur</label>
            <select value={filterCollaborator} onChange={(e) => setFilterCollaborator(e.target.value)} className="perf-select">
              <option value="all">Tous les collaborateurs</option>
              {uniqueCollaborators.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Client filter */}
          <div className="perf-filter-group">
            <label>Client</label>
            <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} className="perf-select">
              <option value="all">Tous les clients</option>
              {uniqueClients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Task type filter */}
          <div className="perf-filter-group">
            <label>Type de tâche</label>
            <select value={filterTask} onChange={(e) => setFilterTask(e.target.value)} className="perf-select">
              <option value="all">Toutes les tâches</option>
              {uniqueTasks.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="perf-filters-footer">
          <div className="perf-active-filters-info">
            Affichage de <strong>{filteredData.length}</strong> lignes sur un total de <strong>{data.length}</strong> données de performance.
          </div>
          {(filterMonth !== 'all' || filterCollaborator !== 'all' || filterClient !== 'all' || filterTask !== 'all' || searchQuery !== '') && (
            <button className="perf-btn" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }} onClick={resetFilters}>
              Effacer les filtres
            </button>
          )}
        </div>
      </div>

      {/* KPI stats section */}
      <div className="perf-kpi-grid">
        {/* KPI 1 : Total Hours */}
        <div className="perf-kpi-card glass-panel" style={{ '--kpi-border': 'var(--primary-color)' }}>
          <div className="perf-kpi-content">
            <span className="perf-kpi-label">Volume de travail</span>
            <span className="perf-kpi-value">{stats.hours}h {stats.minutes}m</span>
            <span className="perf-kpi-subtext">Total heures passées calculées</span>
          </div>
          <div className="perf-kpi-icon-wrapper">
            <Clock size={40} />
          </div>
        </div>

        {/* KPI 2 : Valuation in Ariary */}
        <div className="perf-kpi-card glass-panel" style={{ '--kpi-border': '#10b981' }}>
          <div className="perf-kpi-content">
            <span className="perf-kpi-label">Coût Global (Ariary)</span>
            <span className="perf-kpi-value">{formatAriary(stats.totalAr)}</span>
            <span className="perf-kpi-subtext">Taux horaire converti en monnaie locale</span>
          </div>
          <div className="perf-kpi-icon-wrapper">
            <Coins size={40} />
          </div>
        </div>

        {/* KPI 3 : Valuation in Euros */}
        <div className="perf-kpi-card glass-panel" style={{ '--kpi-border': '#8b5cf6' }}>
          <div className="perf-kpi-content">
            <span className="perf-kpi-label">Coût Global (Euros)</span>
            <span className="perf-kpi-value">{formatEuro(stats.totalEur)}</span>
            <span className="perf-kpi-subtext">Équivalent en devise étrangère (€)</span>
          </div>
          <div className="perf-kpi-icon-wrapper">
            <Coins size={40} />
          </div>
        </div>

        {/* KPI 4 : Delays & checkout issues */}
        <div className="perf-kpi-card glass-panel" style={{ '--kpi-border': '#f59e0b' }}>
          <div className="perf-kpi-content">
            <span className="perf-kpi-label">Dépassements & Anomalies</span>
            <span className="perf-kpi-value" style={{ color: stats.alertsCount > 0 ? 'var(--danger-color)' : 'var(--text-main)' }}>
              {stats.alertsCount}
            </span>
            <span className="perf-kpi-subtext">Retards ou BYE non renseignés</span>
          </div>
          <div className="perf-kpi-icon-wrapper">
            <AlertTriangle size={40} />
          </div>
        </div>

        {/* KPI 5 : Total Entries */}
        <div className="perf-kpi-card glass-panel" style={{ '--kpi-border': '#64748b' }}>
          <div className="perf-kpi-content">
            <span className="perf-kpi-label">Tâches Saisies</span>
            <span className="perf-kpi-value">{stats.totalEntries}</span>
            <span className="perf-kpi-subtext">Nombre total de saisies individuelles</span>
          </div>
          <div className="perf-kpi-icon-wrapper">
            <List size={40} />
          </div>
        </div>
      </div>

      {/* Visual Analytics Charts Section */}
      <div className="perf-charts-grid">
        {/* Collaborators horizontal chart */}
        {renderBarChart(
          collaboratorBreakdown,
          collabMetric,
          setCollabMetric,
          'Rendement Collaborateurs',
          'var(--primary-color)',
          setFilterCollaborator
        )}

        {/* Clients horizontal chart */}
        {renderBarChart(
          clientBreakdown,
          clientMetric,
          setClientMetric,
          'Investissement Client',
          '#10b981',
          setFilterClient
        )}
      </div>
    </div>
  );
}
