'use strict';

const DEFAULT_CONFIG = {
  appName: '主観評価GPSマッピング',
  timeWarningThresholdMs: 10000,
  map: {
    defaultCenter: [35.681236, 139.767125],
    defaultZoom: 16,
    maxZoom: 19,
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  },
  palettes: {
    thermal_sensation: {
      '-3': '#2444a7', '-2': '#3979c3', '-1': '#7db7dc', '0': '#d9d9d9',
      '1': '#f1b37b', '2': '#e36b4f', '3': '#a92323'
    },
    thermal_comfort: {
      '-3': '#9d1f1f', '-2': '#d14b3f', '-1': '#e8947e', '0': '#d9d9d9',
      '1': '#9dcc9d', '2': '#58a96b', '3': '#26733e'
    },
    thermal_preference: {
      cooler: '#2c74b3', no_change: '#4f9f62', warmer: '#dd8b2f'
    }
  }
};

const GPS_REQUIRED_COLUMNS = ['timestamp', 'latitude', 'longitude'];
const SUBJECTIVE_REQUIRED_COLUMNS = [
  'trigger_type',
  'segment_id',
  'evaluation_started_at',
  'evaluation_submitted_at',
  'response_duration_ms',
  'thermal_sensation',
  'thermal_comfort',
  'thermal_preference'
];

const METRIC_INFO = {
  thermal_sensation: {
    title: '温冷感マップ',
    description: '青色ほど寒い側，赤色ほど暑い側の評価を示します．',
    labels: {
      '-3': '寒い', '-2': '涼しい', '-1': 'やや涼しい', '0': 'どちらでもない',
      '1': 'やや暖かい', '2': '暖かい', '3': '暑い'
    }
  },
  thermal_comfort: {
    title: '温熱的快・不快マップ',
    description: '赤色ほど不快，緑色ほど快い評価を示します．',
    labels: {
      '-3': '非常に不快', '-2': '不快', '-1': 'やや不快', '0': 'どちらでもない',
      '1': 'やや快い', '2': '快い', '3': '非常に快い'
    }
  },
  thermal_preference: {
    title: '温熱選好マップ',
    description: '青色はもっと涼しく，緑色はこのまま，橙色はもっと暖かくを示します．',
    labels: {
      cooler: 'もっと涼しく', no_change: 'このままでよい', warmer: 'もっと暖かく'
    }
  }
};

let config = DEFAULT_CONFIG;
let selectedFiles = { gps: null, subjective: null };
let gpsRecords = [];
let subjectiveRecords = [];
let joinedRecords = [];
let sessionBaseName = 'subjective_map';
let currentMetric = 'thermal_sensation';

let map = null;
let tileLayer = null;
let trackLayer = null;
let markerLayer = null;
let coloredRouteLayer = null;
let fullBounds = null;

const els = {};

window.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
  cacheElements();
  bindEvents();
  config = await loadConfig();
  document.title = config.appName;

  if (typeof L === 'undefined') {
    showMessage('地図ライブラリを読み込めませんでした．インターネット接続を確認してください．', 'error');
    return;
  }

  initializeMap();
  updateFileSummary();
}

function cacheElements() {
  const ids = [
    'messageArea', 'csvFiles', 'dropZone', 'gpsFileName', 'subjectiveFileName',
    'loadButton', 'clearButton', 'resultSection', 'gpsPointCount', 'evaluationCount',
    'maxTimeDifference', 'warningCount', 'mapMetricDescription', 'showTrackToggle',
    'colorRouteToggle', 'checkpointToggle', 'selfChangeToggle', 'routeColorNote',
    'captureTitle', 'captureSubtitle', 'mapCaptureArea', 'legend', 'savePngButton',
    'saveCombinedCsvButton', 'fitMapButton', 'evaluationTable'
  ];
  ids.forEach(id => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.csvFiles.addEventListener('change', event => handleFiles(event.target.files));

  ['dragenter', 'dragover'].forEach(type => {
    els.dropZone.addEventListener(type, event => {
      event.preventDefault();
      els.dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(type => {
    els.dropZone.addEventListener(type, event => {
      event.preventDefault();
      els.dropZone.classList.remove('dragover');
    });
  });

  els.dropZone.addEventListener('drop', event => handleFiles(event.dataTransfer.files));
  els.loadButton.addEventListener('click', loadAndRender);
  els.clearButton.addEventListener('click', clearAll);

  document.querySelectorAll('.metric-tab').forEach(button => {
    button.addEventListener('click', () => {
      currentMetric = button.dataset.metric;
      document.querySelectorAll('.metric-tab').forEach(item => {
        item.classList.toggle('active', item === button);
      });
      renderMapLayers();
    });
  });

  [els.showTrackToggle, els.colorRouteToggle, els.checkpointToggle, els.selfChangeToggle]
    .forEach(input => input.addEventListener('change', renderMapLayers));

  els.savePngButton.addEventListener('click', saveMapAsPng);
  els.saveCombinedCsvButton.addEventListener('click', saveCombinedCsv);
  els.fitMapButton.addEventListener('click', fitMapToData);
}

async function loadConfig() {
  try {
    const response = await fetch('config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`config.json: ${response.status}`);
    const loaded = await response.json();
    return {
      ...DEFAULT_CONFIG,
      ...loaded,
      map: { ...DEFAULT_CONFIG.map, ...(loaded.map || {}) },
      palettes: {
        thermal_sensation: {
          ...DEFAULT_CONFIG.palettes.thermal_sensation,
          ...((loaded.palettes || {}).thermal_sensation || {})
        },
        thermal_comfort: {
          ...DEFAULT_CONFIG.palettes.thermal_comfort,
          ...((loaded.palettes || {}).thermal_comfort || {})
        },
        thermal_preference: {
          ...DEFAULT_CONFIG.palettes.thermal_preference,
          ...((loaded.palettes || {}).thermal_preference || {})
        }
      }
    };
  } catch (error) {
    console.warn('config.jsonを読み込めなかったため，既定値を使用します．', error);
    return DEFAULT_CONFIG;
  }
}

function initializeMap() {
  map = L.map('map', {
    preferCanvas: true,
    zoomControl: true
  }).setView(config.map.defaultCenter, config.map.defaultZoom);

  tileLayer = L.tileLayer(config.map.tileUrl, {
    maxZoom: config.map.maxZoom,
    attribution: config.map.attribution,
    crossOrigin: true
  }).addTo(map);

  trackLayer = L.layerGroup().addTo(map);
  coloredRouteLayer = L.layerGroup().addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

async function handleFiles(fileList) {
  const files = Array.from(fileList || []).filter(file => file.name.toLowerCase().endsWith('.csv'));
  if (files.length === 0) return;

  const detected = { gps: null, subjective: null };
  const errors = [];

  for (const file of files) {
    try {
      const headText = await readFileHead(file, 8192);
      const rows = parseCsv(headText);
      const headers = rows[0] || [];
      const type = detectCsvType(headers);

      if (type === 'gps' && !detected.gps) detected.gps = file;
      else if (type === 'subjective' && !detected.subjective) detected.subjective = file;
      else if (!type) errors.push(`${file.name}：列名からファイル種別を判定できませんでした．`);
    } catch (error) {
      console.error(error);
      errors.push(`${file.name}：ファイルを確認できませんでした．`);
    }
  }

  if (detected.gps) selectedFiles.gps = detected.gps;
  if (detected.subjective) selectedFiles.subjective = detected.subjective;
  updateFileSummary();

  if (errors.length > 0) {
    showMessage(errors.join(' '), 'warning');
  } else if (selectedFiles.gps && selectedFiles.subjective) {
    const mismatch = checkSessionNameMismatch(selectedFiles.gps.name, selectedFiles.subjective.name);
    showMessage(
      mismatch
        ? '2つのCSVを認識しました．ただし，ファイル名の実験識別部分が一致しないため，組合せを確認してください．'
        : 'GPS CSVと主観評価CSVを認識しました．「マッピングを作成する」を押してください．',
      mismatch ? 'warning' : 'normal'
    );
  }
}

function updateFileSummary() {
  els.gpsFileName.textContent = selectedFiles.gps ? selectedFiles.gps.name : '未選択';
  els.subjectiveFileName.textContent = selectedFiles.subjective ? selectedFiles.subjective.name : '未選択';
  els.loadButton.disabled = !(selectedFiles.gps && selectedFiles.subjective);
}

function detectCsvType(headers) {
  const normalized = headers.map(value => normalizeHeader(value));
  const hasGps = GPS_REQUIRED_COLUMNS.every(column => normalized.includes(column));
  const hasSubjective = SUBJECTIVE_REQUIRED_COLUMNS.every(column => normalized.includes(column));
  if (hasGps) return 'gps';
  if (hasSubjective) return 'subjective';
  return null;
}

function normalizeHeader(value) {
  return String(value || '').replace(/^\uFEFF/, '').trim();
}

function checkSessionNameMismatch(gpsName, subjectiveName) {
  return baseNameFromFile(gpsName, '_gps.csv') !== baseNameFromFile(subjectiveName, '_subjective.csv');
}

function baseNameFromFile(name, suffix) {
  const lower = name.toLowerCase();
  return lower.endsWith(suffix) ? name.slice(0, -suffix.length) : name.replace(/\.csv$/i, '');
}

async function loadAndRender() {
  if (!(selectedFiles.gps && selectedFiles.subjective)) return;
  setLoadingState(true);

  try {
    const [gpsText, subjectiveText] = await Promise.all([
      selectedFiles.gps.text(),
      selectedFiles.subjective.text()
    ]);

    gpsRecords = parseGpsRecords(gpsText);
    subjectiveRecords = parseSubjectiveRecords(subjectiveText);

    if (gpsRecords.length === 0) throw new Error('有効なGPSデータがありません．');
    if (subjectiveRecords.length === 0) throw new Error('有効な主観評価データがありません．');

    joinedRecords = joinSubjectiveToGps(subjectiveRecords, gpsRecords);
    sessionBaseName = determineSessionBaseName();

    renderSummary();
    renderMapLayers();
    renderEvaluationTable();

    els.resultSection.classList.remove('hidden');
    requestAnimationFrame(() => {
      map.invalidateSize();
      fitMapToData();
      els.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const warningCount = joinedRecords.filter(record => record.time_difference_ms > config.timeWarningThresholdMs).length;
    showMessage(
      warningCount > 0
        ? `マッピングを作成しました．GPSとの時刻差が ${formatSeconds(config.timeWarningThresholdMs)} を超える評価が ${warningCount} 件あります．`
        : 'マッピングを作成しました．すべての主観評価をGPSへ対応付けました．',
      warningCount > 0 ? 'warning' : 'normal'
    );
  } catch (error) {
    console.error(error);
    showMessage(error.message || 'CSVの読み込み中にエラーが発生しました．', 'error');
  } finally {
    setLoadingState(false);
  }
}

function setLoadingState(isLoading) {
  els.loadButton.disabled = isLoading || !(selectedFiles.gps && selectedFiles.subjective);
  els.loadButton.textContent = isLoading ? '読み込み中…' : 'マッピングを作成する';
}

function parseGpsRecords(text) {
  const objects = csvTextToObjects(text);
  const parsed = [];

  objects.forEach((row, index) => {
    const epochMs = parseTimestamp(row.timestamp);
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);

    if (!Number.isFinite(epochMs) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      console.warn(`GPS CSV ${index + 2}行目を除外しました．`, row);
      return;
    }

    parsed.push({
      source_row: index + 2,
      timestamp: row.timestamp,
      epoch_ms: epochMs,
      latitude,
      longitude,
      accuracy: toNullableNumber(row.accuracy),
      heading: toNullableNumber(row.heading),
      speed: toNullableNumber(row.speed)
    });
  });

  parsed.sort((a, b) => a.epoch_ms - b.epoch_ms);
  parsed.forEach((record, index) => { record.gps_index = index; });
  return parsed;
}

function parseSubjectiveRecords(text) {
  const objects = csvTextToObjects(text);
  const parsed = [];

  objects.forEach((row, index) => {
    const epochMs = parseTimestamp(row.evaluation_started_at);
    const sensation = Number(row.thermal_sensation);
    const comfort = Number(row.thermal_comfort);
    const preference = String(row.thermal_preference || '').trim();

    if (
      !Number.isFinite(epochMs) ||
      !Number.isInteger(sensation) || sensation < -3 || sensation > 3 ||
      !Number.isInteger(comfort) || comfort < -3 || comfort > 3 ||
      !['cooler', 'no_change', 'warmer'].includes(preference)
    ) {
      console.warn(`主観評価CSV ${index + 2}行目を除外しました．`, row);
      return;
    }

    parsed.push({
      source_row: index + 2,
      trigger_type: String(row.trigger_type || '').trim(),
      segment_id: String(row.segment_id || '').trim(),
      evaluation_started_at: row.evaluation_started_at,
      evaluation_submitted_at: row.evaluation_submitted_at,
      response_duration_ms: toNullableNumber(row.response_duration_ms),
      evaluation_epoch_ms: epochMs,
      thermal_sensation: sensation,
      thermal_comfort: comfort,
      thermal_preference: preference
    });
  });

  parsed.sort((a, b) => a.evaluation_epoch_ms - b.evaluation_epoch_ms);
  return parsed;
}

function joinSubjectiveToGps(subjective, gps) {
  return subjective.map((record, index) => {
    const nearest = findNearestGps(record.evaluation_epoch_ms, gps);
    if (!nearest) throw new Error('主観評価に対応するGPS点を見つけられませんでした．');

    return {
      evaluation_no: index + 1,
      ...record,
      gps_timestamp: nearest.timestamp,
      gps_epoch_ms: nearest.epoch_ms,
      latitude: nearest.latitude,
      longitude: nearest.longitude,
      accuracy: nearest.accuracy,
      heading: nearest.heading,
      speed: nearest.speed,
      matched_gps_index: nearest.gps_index,
      time_difference_ms: Math.abs(record.evaluation_epoch_ms - nearest.epoch_ms)
    };
  });
}

function findNearestGps(targetMs, records) {
  if (records.length === 0) return null;
  let low = 0;
  let high = records.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (records[mid].epoch_ms < targetMs) low = mid + 1;
    else high = mid - 1;
  }

  const candidates = [];
  if (low < records.length) candidates.push(records[low]);
  if (low - 1 >= 0) candidates.push(records[low - 1]);

  return candidates.reduce((best, current) => {
    if (!best) return current;
    return Math.abs(current.epoch_ms - targetMs) < Math.abs(best.epoch_ms - targetMs)
      ? current
      : best;
  }, null);
}

function renderSummary() {
  const differences = joinedRecords.map(record => record.time_difference_ms);
  const maxDifference = differences.length ? Math.max(...differences) : 0;
  const warningCount = differences.filter(value => value > config.timeWarningThresholdMs).length;

  els.gpsPointCount.textContent = gpsRecords.length.toLocaleString('ja-JP');
  els.evaluationCount.textContent = joinedRecords.length.toLocaleString('ja-JP');
  els.maxTimeDifference.textContent = formatSeconds(maxDifference);
  els.warningCount.textContent = warningCount.toLocaleString('ja-JP');
}

function renderMapLayers() {
  if (!map) return;

  trackLayer.clearLayers();
  coloredRouteLayer.clearLayers();
  markerLayer.clearLayers();

  const coordinates = gpsRecords.map(record => [record.latitude, record.longitude]);
  fullBounds = coordinates.length > 0 ? L.latLngBounds(coordinates) : null;

  if (els.showTrackToggle.checked && coordinates.length > 1) {
    L.polyline(coordinates, {
      color: '#6d7378',
      weight: 4,
      opacity: 0.72,
      lineJoin: 'round'
    }).addTo(trackLayer);
  }

  if (els.colorRouteToggle.checked) {
    renderColoredRoutes();
    els.routeColorNote.classList.remove('hidden');
  } else {
    els.routeColorNote.classList.add('hidden');
  }

  joinedRecords.forEach(record => {
    if (record.trigger_type === 'checkpoint' && !els.checkpointToggle.checked) return;
    if (record.trigger_type === 'self_change' && !els.selfChangeToggle.checked) return;

    const color = getMetricColor(currentMetric, record[currentMetric]);
    const marker = L.marker([record.latitude, record.longitude], {
      icon: makeEvaluationIcon(record, color),
      zIndexOffset: record.trigger_type === 'self_change' ? 200 : 100
    });

    marker.bindPopup(makePopupHtml(record), { maxWidth: 390 });
    marker.addTo(markerLayer);
  });

  updateMapLabelsAndLegend();
}

function renderColoredRoutes() {
  if (joinedRecords.length < 2 || gpsRecords.length < 2) return;

  for (let index = 0; index < joinedRecords.length - 1; index += 1) {
    const current = joinedRecords[index];
    const next = joinedRecords[index + 1];
    const start = Math.min(current.matched_gps_index, next.matched_gps_index);
    const end = Math.max(current.matched_gps_index, next.matched_gps_index);
    const points = gpsRecords.slice(start, end + 1).map(record => [record.latitude, record.longitude]);
    if (points.length < 2) continue;

    L.polyline(points, {
      color: getMetricColor(currentMetric, current[currentMetric]),
      weight: 8,
      opacity: 0.78,
      lineJoin: 'round'
    }).bindTooltip(
      `${METRIC_INFO[currentMetric].title.replace('マップ', '')}：${getMetricDisplay(currentMetric, current[currentMetric])}`,
      { sticky: true }
    ).addTo(coloredRouteLayer);
  }
}

function makeEvaluationIcon(record, color) {
  const isCheckpoint = record.trigger_type === 'checkpoint';
  const warning = record.time_difference_ms > config.timeWarningThresholdMs;
  const shapeClass = isCheckpoint ? 'checkpoint' : 'self-change';
  const warningClass = warning ? ' time-warning' : '';
  const html = `<div class="map-evaluation-marker ${shapeClass}${warningClass}" style="background:${escapeHtml(color)}"><span>${record.evaluation_no}</span></div>`;

  return L.divIcon({
    className: '',
    html,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18]
  });
}

function makePopupHtml(record) {
  const warning = record.time_difference_ms > config.timeWarningThresholdMs;
  return `
    <dl class="popup-grid">
      <dt>評価時刻</dt><dd>${escapeHtml(record.evaluation_started_at)}</dd>
      <dt>評価種別</dt><dd>${escapeHtml(triggerDisplayName(record.trigger_type))}</dd>
      <dt>区間</dt><dd>${escapeHtml(record.segment_id || '―')}</dd>
      <dt>温冷感</dt><dd>${escapeHtml(getMetricDisplay('thermal_sensation', record.thermal_sensation))}</dd>
      <dt>快・不快</dt><dd>${escapeHtml(getMetricDisplay('thermal_comfort', record.thermal_comfort))}</dd>
      <dt>温熱選好</dt><dd>${escapeHtml(getMetricDisplay('thermal_preference', record.thermal_preference))}</dd>
      <dt>GPS時刻</dt><dd>${escapeHtml(record.gps_timestamp)}</dd>
      <dt>GPS精度</dt><dd>${formatAccuracy(record.accuracy)}</dd>
      <dt>時刻差</dt><dd>${formatSeconds(record.time_difference_ms)}</dd>
    </dl>
    ${warning ? `<div class="popup-warning">GPSとの時刻差が ${formatSeconds(config.timeWarningThresholdMs)} を超えています．</div>` : ''}
  `;
}

function updateMapLabelsAndLegend() {
  const info = METRIC_INFO[currentMetric];
  els.mapMetricDescription.textContent = info.description;
  els.captureTitle.textContent = info.title;
  els.captureSubtitle.textContent = `${selectedFiles.subjective ? selectedFiles.subjective.name : ''}`;
  renderLegend();
}

function renderLegend() {
  const info = METRIC_INFO[currentMetric];
  const palette = config.palettes[currentMetric];
  const entries = Object.entries(info.labels);

  els.legend.innerHTML = `
    <span class="legend-title">凡例</span>
    ${entries.map(([value, label]) => `
      <span class="legend-item">
        <i class="legend-color" style="background:${escapeHtml(palette[value])}"></i>
        ${escapeHtml(formatLegendValue(currentMetric, value, label))}
      </span>
    `).join('')}
  `;
}

function renderEvaluationTable() {
  const tbody = els.evaluationTable.querySelector('tbody');
  tbody.innerHTML = joinedRecords.map(record => {
    const warningClass = record.time_difference_ms > config.timeWarningThresholdMs ? ' class="time-warning"' : '';
    return `
      <tr${warningClass}>
        <td>${record.evaluation_no}</td>
        <td>${escapeHtml(record.evaluation_started_at)}</td>
        <td>${escapeHtml(triggerDisplayName(record.trigger_type))}</td>
        <td>${escapeHtml(record.segment_id || '―')}</td>
        <td>${escapeHtml(getMetricDisplay('thermal_sensation', record.thermal_sensation))}</td>
        <td>${escapeHtml(getMetricDisplay('thermal_comfort', record.thermal_comfort))}</td>
        <td>${escapeHtml(getMetricDisplay('thermal_preference', record.thermal_preference))}</td>
        <td>${record.latitude.toFixed(7)}</td>
        <td>${record.longitude.toFixed(7)}</td>
        <td>${formatAccuracy(record.accuracy)}</td>
        <td>${formatSeconds(record.time_difference_ms)}</td>
      </tr>
    `;
  }).join('');
}

function getMetricColor(metric, value) {
  return config.palettes[metric][String(value)] || '#777777';
}

function getMetricDisplay(metric, value) {
  const label = METRIC_INFO[metric].labels[String(value)] || String(value);
  if (metric === 'thermal_preference') return label;
  return `${formatSignedValue(Number(value))} ${label}`;
}

function formatLegendValue(metric, value, label) {
  if (metric === 'thermal_preference') return label;
  return `${formatSignedValue(Number(value))}：${label}`;
}

function formatSignedValue(value) {
  if (value > 0) return `＋${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return '0';
}

function triggerDisplayName(value) {
  if (value === 'checkpoint') return '定期地点評価';
  if (value === 'self_change') return '変動による評価';
  return value || '不明';
}

function fitMapToData() {
  if (!map || !fullBounds || !fullBounds.isValid()) return;
  map.fitBounds(fullBounds, { padding: [28, 28], maxZoom: 18 });
}

async function saveMapAsPng() {
  if (typeof html2canvas === 'undefined') {
    showMessage('画像保存ライブラリを読み込めませんでした．インターネット接続を確認してください．', 'error');
    return;
  }

  els.savePngButton.disabled = true;
  els.savePngButton.textContent = '画像を作成中…';

  try {
    map.closePopup();
    await wait(250);

    const canvas = await html2canvas(els.mapCaptureArea, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false
    });

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNGを生成できませんでした．');
    downloadBlob(blob, `${sessionBaseName}_${currentMetric}_map.png`);
    showMessage('地図画像をPNGで保存しました．');
  } catch (error) {
    console.error(error);
    showMessage('地図画像を保存できませんでした．地図タイルの読み込み完了後に再度お試しください．', 'error');
  } finally {
    els.savePngButton.disabled = false;
    els.savePngButton.textContent = '地図をPNG保存';
  }
}

function saveCombinedCsv() {
  const columns = [
    'evaluation_started_at',
    'trigger_type',
    'segment_id',
    'thermal_sensation',
    'thermal_comfort',
    'thermal_preference',
    'gps_timestamp',
    'latitude',
    'longitude',
    'accuracy',
    'heading',
    'speed',
    'time_difference_ms'
  ];

  const lines = [columns.join(',')];
  joinedRecords.forEach(record => {
    lines.push(columns.map(column => escapeCsv(record[column])).join(','));
  });

  const content = `\uFEFF${lines.join('\r\n')}`;
  downloadBlob(
    new Blob([content], { type: 'text/csv;charset=utf-8' }),
    `${sessionBaseName}_subjective_gps_joined.csv`
  );
  showMessage('主観評価とGPSを結合したCSVを保存しました．');
}

function determineSessionBaseName() {
  const gpsBase = baseNameFromFile(selectedFiles.gps.name, '_gps.csv');
  const subjectiveBase = baseNameFromFile(selectedFiles.subjective.name, '_subjective.csv');
  return gpsBase === subjectiveBase ? sanitizeFileName(gpsBase) : sanitizeFileName(`${gpsBase}_${subjectiveBase}`);
}

function clearAll() {
  selectedFiles = { gps: null, subjective: null };
  gpsRecords = [];
  subjectiveRecords = [];
  joinedRecords = [];
  sessionBaseName = 'subjective_map';
  els.csvFiles.value = '';
  els.resultSection.classList.add('hidden');
  updateFileSummary();

  if (map) {
    trackLayer.clearLayers();
    coloredRouteLayer.clearLayers();
    markerLayer.clearLayers();
    map.setView(config.map.defaultCenter, config.map.defaultZoom);
  }

  showMessage('読み込んだファイルを解除しました．');
}

function csvTextToObjects(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1)
    .filter(row => row.some(value => String(value || '').trim() !== ''))
    .map(row => {
      const object = {};
      headers.forEach((header, index) => {
        object[header] = row[index] !== undefined ? String(row[index]).trim() : '';
      });
      return object;
    });
}

function parseCsv(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }

  return rows;
}

function parseTimestamp(value) {
  const text = String(value || '').trim();
  const localMatch = text.match(
    /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/
  );

  if (localMatch) {
    const [, year, month, day, hour, minute, second, millisecond] = localMatch;
    return new Date(
      Number(year), Number(month) - 1, Number(day),
      Number(hour), Number(minute), Number(second), Number(millisecond)
    ).getTime();
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function toNullableNumber(value) {
  const text = String(value ?? '').trim();
  if (text === '') return '';
  const number = Number(text);
  return Number.isFinite(number) ? number : '';
}

function formatAccuracy(value) {
  return Number.isFinite(Number(value)) ? `±${Number(value).toFixed(1)} m` : '―';
}

function formatSeconds(milliseconds) {
  return `${(Number(milliseconds) / 1000).toFixed(3)} s`;
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeFileName(value) {
  return String(value || 'subjective_map').replace(/[\\/:*?"<>|]/g, '_');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readFileHead(file, byteCount) {
  return file.slice(0, byteCount).text();
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function showMessage(message, type = 'normal') {
  els.messageArea.textContent = message;
  els.messageArea.className = `message-area${type === 'normal' ? '' : ` ${type}`}`;
}
