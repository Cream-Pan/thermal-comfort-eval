'use strict';

const DEFAULT_CONFIG = {
  appName: '温熱環境GPSマッピング',
  map: {
    defaultCenter: [35.681236, 139.767125],
    defaultZoom: 16,
    maxZoom: 19,
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  },
  subjectivePalettes: {
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
  },
  weatherPalettes: {
    temperature: ['#2444a7', '#4aa8cf', '#d9e8b4', '#f2c14e', '#e36b4f', '#a92323'],
    humidity: ['#f4e7c5', '#c9e5dd', '#7fc7c9', '#3a91b3', '#24528c'],
    wind_speed: ['#edf4f7', '#b8d9e5', '#70b5d1', '#2d84b5', '#14527c'],
    heat_index: ['#c8e6a0', '#f1dc72', '#f2a65a', '#d95745', '#8b1e5a']
  },
  bioPalettes: {
    mlx_object: ['#2444a7', '#4aa8cf', '#d9e8b4', '#f2c14e', '#e36b4f', '#a92323'],
    ear_hr: ['#2b6cb0', '#63b3ed', '#68d391', '#f6e05e', '#ed8936', '#c53030']
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
const WEATHER_REQUIRED_COLUMNS = [
  'FORMATTED DATE_TIME',
  'Temperature',
  'Relative Humidity',
  'Wind Speed',
  'Heat Index'
];
const MLX_REQUIRED_COLUMNS = ['Object_C', 'RecvJST', 'SensorElapsed_ms'];
const PPG_REQUIRED_COLUMNS = ['Window_Center', 'Ear_HR_BPM_Window', 'Ear_HR_Usable'];

const SUBJECTIVE_METRIC_INFO = {
  thermal_sensation: {
    title: '主観評価―温冷感',
    description: '青色ほど寒い側，赤色ほど暑い側の評価を示します．',
    labels: {
      '-3': '寒い', '-2': '涼しい', '-1': 'やや涼しい', '0': 'どちらでもない',
      '1': 'やや暖かい', '2': '暖かい', '3': '暑い'
    }
  },
  thermal_comfort: {
    title: '主観評価―温熱的快・不快',
    description: '赤色ほど不快，緑色ほど快い評価を示します．',
    labels: {
      '-3': '非常に不快', '-2': '不快', '-1': 'やや不快', '0': 'どちらでもない',
      '1': 'やや快い', '2': '快い', '3': '非常に快い'
    }
  },
  thermal_preference: {
    title: '主観評価―温熱選好',
    description: '青色はもっと涼しく，緑色はこのまま，橙色はもっと暖かくを示します．',
    labels: {
      cooler: 'もっと涼しく', no_change: 'このままでよい', warmer: 'もっと暖かく'
    }
  }
};

const WEATHER_METRIC_INFO = {
  temperature: {
    title: '環境評価（M1）―気温',
    description: 'Kestrelで取得した歩行者近傍の気温を，GPS経路上へ表示します．',
    column: 'temperature',
    unit: '℃',
    digits: 1
  },
  humidity: {
    title: '環境評価（M1）―相対湿度',
    description: 'Kestrelで取得した歩行者近傍の相対湿度を，GPS経路上へ表示します．',
    column: 'humidity',
    unit: '%',
    digits: 1
  },
  wind_speed: {
    title: '環境評価（M1）―風速',
    description: 'Kestrelで取得した歩行者近傍の実効風速を，GPS経路上へ表示します．',
    column: 'wind_speed',
    unit: 'km/h',
    digits: 1
  },
  heat_index: {
    title: '環境評価（M1）―暑さ指数',
    description: 'Kestrelが気温と湿度から算出した暑さ指数を，GPS経路上へ表示します．',
    column: 'heat_index',
    unit: '℃',
    digits: 1
  }
};
const BIO_TYPE_INFO = {
  mlx: {
    title: '生体情報―鼓膜方向温度（Object_C）',
    description: 'MLX CSVのObject_Cを，再構築したセンサ時間軸に基づいてGPS経路上へ表示します．',
    unit: '℃',
    digits: 2,
    paletteKey: 'mlx_object'
  },
  ppg: {
    title: '生体情報―耳PPG心拍数',
    description: 'Ear_HR_UsableがTRUEの窓について，Ear_HR_BPM_WindowをWindow_Center時刻でGPS経路上へ表示します．',
    unit: 'bpm',
    digits: 1,
    paletteKey: 'ear_hr'
  }
};

let config = DEFAULT_CONFIG;
let selectedFiles = { gps: null, subjective: null, weather: null, mlx: [], ppg: [] };
let gpsRecords = [];
let subjectiveRecords = [];
let weatherRecords = [];
let joinedSubjectiveRecords = [];
let joinedWeatherRecords = [];
let bioDatasets = [];
let currentBioDatasetIndex = 0;
let sessionBaseName = 'thermal_map';
let activeCategory = 'gps';
let currentSubjectiveMetric = 'thermal_sensation';
let currentWeatherMetric = 'temperature';

let map = null;
let tileLayer = null;
let trackLayer = null;
let subjectiveMarkerLayer = null;
let subjectiveRouteLayer = null;
let weatherPointLayer = null;
let weatherRouteLayer = null;
let bioPointLayer = null;
let bioRouteLayer = null;
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
    'messageArea',
    'batchFileInput', 'batchFilePicker',
    'gpsFileName', 'subjectiveFileName', 'weatherFileName', 'mlxFileNames', 'ppgFileNames',
    'loadButton', 'clearButton', 'resultSection',
    'gpsPointCount', 'evaluationCount', 'weatherPointCount', 'bioFileCount', 'bioPointCount',
    'subjectiveMaxTimeDifference', 'weatherMaxTimeDifference', 'bioMaxTimeDifference',
    'subjectiveCategoryTab', 'environmentCategoryTab', 'bioCategoryTab',
    'subjectiveControlArea', 'environmentControlArea', 'bioControlArea', 'gpsOnlyNotice',
    'subjectiveShowTrackToggle', 'subjectiveColorRouteToggle',
    'checkpointToggle', 'selfChangeToggle', 'routeColorNote',
    'environmentShowTrackToggle', 'weatherColorRouteToggle', 'weatherPointToggle',
    'bioFileSelect', 'bioShowTrackToggle', 'bioColorRouteToggle', 'bioPointToggle',
    'mapMetricDescription', 'captureTitle', 'captureSubtitle',
    'subjectiveShapeGuide', 'environmentShapeGuide', 'bioShapeGuide',
    'mapCaptureArea', 'legend', 'savePngButton', 'saveJoinedCsvButton', 'fitMapButton',
    'subjectiveTablePanel', 'weatherTablePanel', 'subjectiveTable', 'weatherTable'
  ];

  ids.forEach(id => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.batchFileInput.addEventListener('change', event => {
    handleBatchFiles(Array.from(event.target.files || []));
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    els.batchFilePicker.addEventListener(eventName, event => {
      event.preventDefault();
      els.batchFilePicker.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    els.batchFilePicker.addEventListener(eventName, event => {
      event.preventDefault();
      els.batchFilePicker.classList.remove('drag-over');
    });
  });

  els.batchFilePicker.addEventListener('drop', event => {
    const csvFiles = Array.from(event.dataTransfer?.files || [])
      .filter(file => file.name.toLowerCase().endsWith('.csv'));
    handleBatchFiles(csvFiles);
  });

  els.loadButton.addEventListener('click', loadAndRender);
  els.clearButton.addEventListener('click', clearAll);

  document.querySelectorAll('.category-tab').forEach(button => {
    button.addEventListener('click', () => switchCategory(button.dataset.category));
  });

  document.querySelectorAll('[data-subjective-metric]').forEach(button => {
    button.addEventListener('click', () => {
      currentSubjectiveMetric = button.dataset.subjectiveMetric;
      setActiveMetricButton('[data-subjective-metric]', button);
      renderMapLayers();
    });
  });

  document.querySelectorAll('[data-weather-metric]').forEach(button => {
    button.addEventListener('click', () => {
      currentWeatherMetric = button.dataset.weatherMetric;
      setActiveMetricButton('[data-weather-metric]', button);
      renderMapLayers();
    });
  });

  els.bioFileSelect.addEventListener('change', () => {
    const index = Number(els.bioFileSelect.value);
    currentBioDatasetIndex = Number.isInteger(index) ? index : 0;
    renderMapLayers();
  });

  [
    els.subjectiveShowTrackToggle,
    els.subjectiveColorRouteToggle,
    els.checkpointToggle,
    els.selfChangeToggle,
    els.environmentShowTrackToggle,
    els.weatherColorRouteToggle,
    els.weatherPointToggle,
    els.bioShowTrackToggle,
    els.bioColorRouteToggle,
    els.bioPointToggle
  ].forEach(input => input.addEventListener('change', renderMapLayers));

  els.savePngButton.addEventListener('click', saveMapAsPng);
  els.saveJoinedCsvButton.addEventListener('click', saveActiveJoinedCsv);
  els.fitMapButton.addEventListener('click', fitMapToData);
}

function setActiveMetricButton(selector, activeButton) {
  document.querySelectorAll(selector).forEach(button => {
    button.classList.toggle('active', button === activeButton);
  });
}

async function loadConfig() {
  try {
    const response = await fetch('config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`config.json: ${response.status}`);
    const loaded = await response.json();
    return mergeConfig(DEFAULT_CONFIG, loaded);
  } catch (error) {
    console.warn('config.jsonを読み込めなかったため，既定値を使用します．', error);
    return DEFAULT_CONFIG;
  }
}

function mergeConfig(base, loaded) {
  return {
    ...base,
    ...loaded,
    map: { ...base.map, ...(loaded.map || {}) },
    subjectivePalettes: {
      thermal_sensation: {
        ...base.subjectivePalettes.thermal_sensation,
        ...((loaded.subjectivePalettes || {}).thermal_sensation || {})
      },
      thermal_comfort: {
        ...base.subjectivePalettes.thermal_comfort,
        ...((loaded.subjectivePalettes || {}).thermal_comfort || {})
      },
      thermal_preference: {
        ...base.subjectivePalettes.thermal_preference,
        ...((loaded.subjectivePalettes || {}).thermal_preference || {})
      }
    },
    weatherPalettes: {
      ...base.weatherPalettes,
      ...(loaded.weatherPalettes || {})
    },
    bioPalettes: {
      ...base.bioPalettes,
      ...(loaded.bioPalettes || {})
    }
  };
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
  subjectiveRouteLayer = L.layerGroup().addTo(map);
  weatherRouteLayer = L.layerGroup().addTo(map);
  subjectiveMarkerLayer = L.layerGroup().addTo(map);
  weatherPointLayer = L.layerGroup().addTo(map);
  bioRouteLayer = L.layerGroup().addTo(map);
  bioPointLayer = L.layerGroup().addTo(map);
}

async function handleBatchFiles(files) {
  selectedFiles = { gps: null, subjective: null, weather: null, mlx: [], ppg: [] };
  updateFileSummary();

  if (files.length === 0) {
    showMessage('CSVファイルが選択されていません．', 'warning');
    return;
  }

  els.loadButton.disabled = true;
  els.loadButton.textContent = 'ファイル判別中…';

  try {
    const unknownFiles = [];
    const detectedNames = [];

    for (const file of files) {
      const text = await file.text();
      const type = detectCsvType(text);

      if (!type) {
        unknownFiles.push(file.name);
        continue;
      }

      if (type === 'mlx' || type === 'ppg') {
        if (selectedFiles[type].length >= 2) {
          throw new Error(`${fileTypeLabel(type)}は最大2ファイルまで選択できます．`);
        }
        selectedFiles[type].push(file);
        detectedNames.push(`${fileTypeLabel(type)}：${file.name}`);
        continue;
      }

      if (selectedFiles[type]) {
        throw new Error(`${fileTypeLabel(type)}が複数選択されています：${selectedFiles[type].name}，${file.name}`);
      }
      selectedFiles[type] = file;
      detectedNames.push(`${fileTypeLabel(type)}：${file.name}`);
    }

    updateFileSummary();

    if (!selectedFiles.gps) {
      throw new Error('GPS CSVを確認できませんでした．timestamp，latitude，longitude列を含むCSVを選択してください．');
    }

    const optionalMessage = unknownFiles.length > 0
      ? ` 判別できなかったファイル：${unknownFiles.join('，')}`
      : '';

    showMessage(`${detectedNames.join(' ／ ')} を自動判別しました．${optionalMessage}`,
      unknownFiles.length > 0 ? 'warning' : 'normal');
  } catch (error) {
    console.error(error);
    selectedFiles = { gps: null, subjective: null, weather: null, mlx: [], ppg: [] };
    updateFileSummary();
    showMessage(error.message || 'CSVファイルの判別に失敗しました．', 'error');
  } finally {
    els.loadButton.textContent = 'マッピングを作成する';
    els.loadButton.disabled = !selectedFiles.gps;
  }
}

function detectCsvType(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return null;

  const firstHeaders = (rows[0] || []).map(normalizeHeader);
  if (GPS_REQUIRED_COLUMNS.every(column => firstHeaders.includes(column))) {
    return 'gps';
  }

  if (SUBJECTIVE_REQUIRED_COLUMNS.every(column => firstHeaders.includes(column))) {
    return 'subjective';
  }

  if (PPG_REQUIRED_COLUMNS.every(column => firstHeaders.includes(column))) {
    return 'ppg';
  }

  if (MLX_REQUIRED_COLUMNS.every(column => firstHeaders.includes(column))) {
    return 'mlx';
  }

  const weatherHeader = rows.find(row =>
    normalizeHeader(row[0]).toUpperCase() === 'FORMATTED DATE_TIME'
  );
  if (weatherHeader) {
    const headers = weatherHeader.map(normalizeHeader);
    if (WEATHER_REQUIRED_COLUMNS.every(column => headers.includes(column))) {
      return 'weather';
    }
  }

  return null;
}

function fileTypeLabel(type) {
  const labels = {
    gps: 'GPS CSV',
    subjective: 'Subjective CSV',
    weather: 'Weather CSV',
    mlx: 'MLX CSV',
    ppg: 'PPG_ACC CSV'
  };
  return labels[type] || type;
}

function updateFileSummary() {
  els.gpsFileName.textContent = selectedFiles.gps ? selectedFiles.gps.name : '未選択';
  els.subjectiveFileName.textContent = selectedFiles.subjective ? selectedFiles.subjective.name : '未選択';
  els.weatherFileName.textContent = selectedFiles.weather ? selectedFiles.weather.name : '未選択';
  els.mlxFileNames.textContent = selectedFiles.mlx.length > 0
    ? selectedFiles.mlx.map(file => file.name).join(' ／ ')
    : '未選択';
  els.ppgFileNames.textContent = selectedFiles.ppg.length > 0
    ? selectedFiles.ppg.map(file => file.name).join(' ／ ')
    : '未選択';
  els.loadButton.disabled = !selectedFiles.gps;
}

async function loadAndRender() {
  if (!selectedFiles.gps) return;
  setLoadingState(true);

  try {
    const gpsText = await selectedFiles.gps.text();
    validateCsvHeaders(gpsText, GPS_REQUIRED_COLUMNS, 'GPS CSV');
    gpsRecords = parseGpsRecords(gpsText);
    if (gpsRecords.length === 0) throw new Error('有効なGPSデータがありません．');

    subjectiveRecords = [];
    weatherRecords = [];
    joinedSubjectiveRecords = [];
    joinedWeatherRecords = [];
    bioDatasets = [];
    currentBioDatasetIndex = 0;

    let experimentTimeRange = null;
    if (selectedFiles.subjective) {
      const subjectiveText = await selectedFiles.subjective.text();
      validateCsvHeaders(subjectiveText, SUBJECTIVE_REQUIRED_COLUMNS, 'Subjective CSV');
      subjectiveRecords = parseSubjectiveRecords(subjectiveText);
      if (subjectiveRecords.length === 0) throw new Error('有効な主観評価データがありません．');

      experimentTimeRange = getExperimentTimeRange(subjectiveRecords);
      gpsRecords = filterRecordsByTimeRange(
        gpsRecords,
        experimentTimeRange.startEpochMs,
        experimentTimeRange.endEpochMs
      ).map((record, index) => ({ ...record, gps_index: index }));

      if (gpsRecords.length === 0) {
        throw new Error('START SubmitからRECOVERY_END SubmitまでのGPSデータがありません．');
      }

      subjectiveRecords = filterRecordsByTimeRange(
        subjectiveRecords,
        experimentTimeRange.startEpochMs,
        experimentTimeRange.endEpochMs
      );
      joinedSubjectiveRecords = joinRecordsToGps(subjectiveRecords, gpsRecords, 'epoch_ms');
    }

    if (selectedFiles.weather) {
      const weatherText = await selectedFiles.weather.text();
      weatherRecords = parseWeatherRecords(weatherText);
      if (weatherRecords.length === 0) throw new Error('有効なWeatherデータがありません．');

      if (experimentTimeRange) {
        weatherRecords = filterRecordsByTimeRange(
          weatherRecords,
          experimentTimeRange.startEpochMs,
          experimentTimeRange.endEpochMs
        );
      }
      if (weatherRecords.length === 0) {
        throw new Error('START SubmitからRECOVERY_END SubmitまでのWeatherデータがありません．');
      }
      joinedWeatherRecords = joinRecordsToGps(weatherRecords, gpsRecords, 'epoch_ms');
    }

    for (const file of selectedFiles.mlx) {
      const records = parseMlxRecords(await file.text(), file.name);
      const filtered = experimentTimeRange
        ? filterRecordsByTimeRange(records, experimentTimeRange.startEpochMs, experimentTimeRange.endEpochMs)
        : records;
      if (filtered.length === 0) {
        throw new Error(`${file.name}に解析対象時間内のMLXデータがありません．`);
      }
      bioDatasets.push({
        type: 'mlx',
        fileName: file.name,
        records: filtered,
        joinedRecords: joinRecordsToGps(filtered, gpsRecords, 'epoch_ms')
      });
    }

    for (const file of selectedFiles.ppg) {
      const records = parsePpgRecords(await file.text(), file.name);
      const filtered = experimentTimeRange
        ? filterRecordsByTimeRange(records, experimentTimeRange.startEpochMs, experimentTimeRange.endEpochMs)
        : records;
      if (filtered.length === 0) {
        throw new Error(`${file.name}に解析対象時間内の使用可能な耳PPG心拍データがありません．`);
      }
      bioDatasets.push({
        type: 'ppg',
        fileName: file.name,
        records: filtered,
        joinedRecords: joinRecordsToGps(filtered, gpsRecords, 'epoch_ms')
      });
    }

    sessionBaseName = determineSessionBaseName();
    configureBioFileSelect();
    chooseInitialCategory();
    configureCategoryTabs();
    renderSummary();
    renderSubjectiveTable();
    renderWeatherTable();
    renderMapLayers();

    els.resultSection.classList.remove('hidden');
    requestAnimationFrame(() => {
      map.invalidateSize();
      fitMapToData();
      els.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const loadedNames = ['GPS'];
    if (selectedFiles.subjective) loadedNames.push('Subjective');
    if (selectedFiles.weather) loadedNames.push('Weather');
    if (bioDatasets.length > 0) loadedNames.push(`生体情報${bioDatasets.length}ファイル`);
    showMessage(`${loadedNames.join('，')} CSVを読み込み，マッピングを作成しました．`);
  } catch (error) {
    console.error(error);
    showMessage(error.message || 'CSVの読み込みに失敗しました．', 'error');
  } finally {
    setLoadingState(false);
  }
}

function setLoadingState(isLoading) {
  els.loadButton.disabled = isLoading || !selectedFiles.gps;
  els.loadButton.textContent = isLoading ? '読み込み中…' : 'マッピングを作成する';
}

function validateCsvHeaders(text, requiredColumns, label) {
  const rows = parseCsv(text);
  const headers = (rows[0] || []).map(normalizeHeader);
  const missing = requiredColumns.filter(column => !headers.includes(column));
  if (missing.length > 0) {
    throw new Error(`${label}に必要な列がありません：${missing.join('，')}`);
  }
}

function chooseInitialCategory() {
  if (joinedSubjectiveRecords.length > 0) activeCategory = 'subjective';
  else if (joinedWeatherRecords.length > 0) activeCategory = 'environment';
  else if (bioDatasets.length > 0) activeCategory = 'bio';
  else activeCategory = 'gps';
}

function configureBioFileSelect() {
  els.bioFileSelect.innerHTML = '';
  bioDatasets.forEach((dataset, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${dataset.type === 'mlx' ? 'MLX' : 'PPG'}：${dataset.fileName}`;
    els.bioFileSelect.appendChild(option);
  });
  currentBioDatasetIndex = Math.min(currentBioDatasetIndex, Math.max(0, bioDatasets.length - 1));
  els.bioFileSelect.value = String(currentBioDatasetIndex);
  els.bioFileSelect.disabled = bioDatasets.length === 0;
}

function configureCategoryTabs() {
  const hasSubjective = joinedSubjectiveRecords.length > 0;
  const hasWeather = joinedWeatherRecords.length > 0;
  const hasBio = bioDatasets.length > 0;
  els.subjectiveCategoryTab.disabled = !hasSubjective;
  els.environmentCategoryTab.disabled = !hasWeather;
  els.bioCategoryTab.disabled = !hasBio;
  switchCategory(activeCategory, false);
}

function switchCategory(category, rerender = true) {
  if (category === 'subjective' && joinedSubjectiveRecords.length === 0) return;
  if (category === 'environment' && joinedWeatherRecords.length === 0) return;
  if (category === 'bio' && bioDatasets.length === 0) return;

  activeCategory = category;
  els.subjectiveCategoryTab.classList.toggle('active', category === 'subjective');
  els.environmentCategoryTab.classList.toggle('active', category === 'environment');
  els.bioCategoryTab.classList.toggle('active', category === 'bio');
  els.subjectiveControlArea.classList.toggle('hidden', category !== 'subjective');
  els.environmentControlArea.classList.toggle('hidden', category !== 'environment');
  els.bioControlArea.classList.toggle('hidden', category !== 'bio');
  els.gpsOnlyNotice.classList.toggle('hidden', category !== 'gps');
  els.subjectiveTablePanel.classList.toggle('hidden', category !== 'subjective');
  els.weatherTablePanel.classList.toggle('hidden', category !== 'environment');
  els.saveJoinedCsvButton.disabled = category === 'gps';
  els.saveJoinedCsvButton.textContent = category === 'environment'
    ? 'Weather・GPS結合CSVを保存'
    : category === 'subjective'
      ? '主観評価・GPS結合CSVを保存'
      : category === 'bio'
        ? '生体情報・GPS結合CSVを保存'
        : '結合CSVを保存';

  if (rerender) {
    renderMapLayers();
    requestAnimationFrame(() => map.invalidateSize());
  }
}

function parseGpsRecords(text) {
  const rows = csvToObjects(parseCsv(text));
  return rows
    .map((row, originalIndex) => {
      const epochMs = parseTimestamp(row.timestamp);
      const latitude = Number(row.latitude);
      const longitude = Number(row.longitude);
      return {
        original_index: originalIndex,
        timestamp: row.timestamp,
        epoch_ms: epochMs,
        latitude,
        longitude,
        accuracy: toNullableNumber(row.accuracy),
        heading: toNullableNumber(row.heading),
        speed: toNullableNumber(row.speed)
      };
    })
    .filter(record => Number.isFinite(record.epoch_ms)
      && Number.isFinite(record.latitude)
      && Number.isFinite(record.longitude))
    .sort((a, b) => a.epoch_ms - b.epoch_ms)
    .map((record, sortedIndex) => ({ ...record, gps_index: sortedIndex }));
}

function parseSubjectiveRecords(text) {
  const rows = csvToObjects(parseCsv(text));
  return rows
    .map((row, index) => ({
      record_index: index,
      trigger_type: normalizeHeader(row.trigger_type),
      segment_id: normalizeHeader(row.segment_id),
      evaluation_started_at: normalizeHeader(row.evaluation_started_at),
      evaluation_submitted_at: normalizeHeader(row.evaluation_submitted_at),
      response_duration_ms: toNullableNumber(row.response_duration_ms),
      thermal_sensation: toNullableNumber(row.thermal_sensation),
      thermal_comfort: toNullableNumber(row.thermal_comfort),
      thermal_preference: normalizeHeader(row.thermal_preference),
      submitted_epoch_ms: parseTimestamp(row.evaluation_submitted_at),
      epoch_ms: parseTimestamp(row.evaluation_submitted_at)
    }))
    .filter(record => Number.isFinite(record.epoch_ms))
    .sort((a, b) => a.epoch_ms - b.epoch_ms);
}

function getExperimentTimeRange(records) {
  const startRecord = records.find(record => record.segment_id.toUpperCase() === 'START');
  const endRecords = records.filter(record => record.segment_id.toUpperCase() === 'RECOVERY_END');
  const endRecord = endRecords.length > 0 ? endRecords[endRecords.length - 1] : null;

  if (!startRecord) throw new Error('Subjective CSVにsegment_idがSTARTの評価を確認できませんでした．');
  if (!endRecord) throw new Error('Subjective CSVにsegment_idがRECOVERY_ENDの評価を確認できませんでした．');

  const startEpochMs = startRecord.submitted_epoch_ms;
  const endEpochMs = endRecord.submitted_epoch_ms;
  if (!Number.isFinite(startEpochMs) || !Number.isFinite(endEpochMs)) {
    throw new Error('STARTまたはRECOVERY_ENDのevaluation_submitted_atを読み取れませんでした．');
  }
  if (startEpochMs >= endEpochMs) throw new Error('STARTとRECOVERY_ENDの時刻関係が正しくありません．');
  return { startEpochMs, endEpochMs };
}

function filterRecordsByTimeRange(records, startEpochMs, endEpochMs, epochKey = 'epoch_ms') {
  return records.filter(record => {
    const epochMs = record[epochKey];
    return Number.isFinite(epochMs) && epochMs >= startEpochMs && epochMs <= endEpochMs;
  });
}

function parseWeatherRecords(text) {
  const rows = parseCsv(text);
  const headerIndex = rows.findIndex(row => normalizeHeader(row[0]).toUpperCase() === 'FORMATTED DATE_TIME');
  if (headerIndex < 0) {
    throw new Error('Weather CSVのヘッダー行「FORMATTED DATE_TIME」を確認できませんでした．');
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const missing = WEATHER_REQUIRED_COLUMNS.filter(column => !headers.includes(column));
  if (missing.length > 0) {
    throw new Error(`Weather CSVに必要な列がありません：${missing.join('，')}`);
  }

  const headerMap = new Map(headers.map((header, index) => [header, index]));
  const dataRows = rows.slice(headerIndex + 1);

  return dataRows
    .map((row, index) => {
      const dateTimeText = normalizeHeader(row[headerMap.get('FORMATTED DATE_TIME')]);
      return {
        record_index: index,
        weather_timestamp: dateTimeText,
        epoch_ms: parseTimestamp(dateTimeText),
        temperature: toNullableNumber(row[headerMap.get('Temperature')]),
        humidity: toNullableNumber(row[headerMap.get('Relative Humidity')]),
        wind_speed: toNullableNumber(row[headerMap.get('Wind Speed')]),
        heat_index: toNullableNumber(row[headerMap.get('Heat Index')])
      };
    })
    .filter(record => Number.isFinite(record.epoch_ms)
      && [record.temperature, record.humidity, record.wind_speed, record.heat_index]
        .some(value => Number.isFinite(Number(value))))
    .sort((a, b) => a.epoch_ms - b.epoch_ms);
}

function parseMlxRecords(text, fileName) {
  validateCsvHeaders(text, MLX_REQUIRED_COLUMNS, `MLX CSV（${fileName}）`);
  const rows = csvToObjects(parseCsv(text));
  const rawRecords = rows
    .map((row, index) => ({
      record_index: index,
      recv_jst: normalizeHeader(row.RecvJST),
      recv_epoch_ms: parseTimestamp(row.RecvJST),
      sensor_elapsed_ms: Number(row.SensorElapsed_ms),
      object_c: Number(row.Object_C)
    }))
    .filter(record => Number.isFinite(record.recv_epoch_ms)
      && Number.isFinite(record.sensor_elapsed_ms)
      && Number.isFinite(record.object_c));

  if (rawRecords.length === 0) {
    throw new Error(`${fileName}に有効なObject_C，RecvJST，SensorElapsed_msを確認できませんでした．`);
  }

  const baseRecvEpochMs = rawRecords[0].recv_epoch_ms;
  const baseSensorElapsedMs = rawRecords[0].sensor_elapsed_ms;

  return rawRecords
    .map(record => {
      // SensorElapsed_msはファイル先頭を0 msとして正規化し，最初のRecvJSTへ加算する．
      const epochMs = baseRecvEpochMs + (record.sensor_elapsed_ms - baseSensorElapsedMs);
      return {
        ...record,
        source_file: fileName,
        bio_type: 'mlx',
        bio_timestamp: formatLocalTimeWithMs(epochMs),
        epoch_ms: epochMs,
        bio_value: record.object_c
      };
    })
    .sort((a, b) => a.epoch_ms - b.epoch_ms);
}

function parsePpgRecords(text, fileName) {
  validateCsvHeaders(text, PPG_REQUIRED_COLUMNS, `PPG_ACC CSV（${fileName}）`);
  const rows = csvToObjects(parseCsv(text));
  return rows
    .map((row, index) => {
      const usable = parseBoolean(row.Ear_HR_Usable);
      const bpm = Number(row.Ear_HR_BPM_Window);
      const windowCenter = normalizeHeader(row.Window_Center);
      return {
        record_index: index,
        source_file: fileName,
        bio_type: 'ppg',
        window_center: windowCenter,
        bio_timestamp: windowCenter,
        epoch_ms: parseTimestamp(windowCenter),
        ear_hr_usable: usable,
        ear_hr_bpm_window: bpm,
        bio_value: bpm
      };
    })
    .filter(record => record.ear_hr_usable === true
      && Number.isFinite(record.epoch_ms)
      && Number.isFinite(record.bio_value))
    .sort((a, b) => a.epoch_ms - b.epoch_ms);
}

function joinRecordsToGps(sourceRecords, sortedGpsRecords, epochKey) {
  if (sortedGpsRecords.length === 0) return [];
  return sourceRecords.map(record => {
    const gpsIndex = findNearestGpsIndex(sortedGpsRecords, record[epochKey]);
    const gps = sortedGpsRecords[gpsIndex];
    return {
      ...record,
      gps_index: gpsIndex,
      gps_timestamp: gps.timestamp,
      gps_epoch_ms: gps.epoch_ms,
      time_difference_ms: Math.abs(record[epochKey] - gps.epoch_ms),
      latitude: gps.latitude,
      longitude: gps.longitude,
      accuracy: gps.accuracy,
      heading: gps.heading,
      speed: gps.speed
    };
  });
}

function findNearestGpsIndex(records, targetEpochMs) {
  let low = 0;
  let high = records.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const value = records[middle].epoch_ms;
    if (value < targetEpochMs) low = middle + 1;
    else if (value > targetEpochMs) high = middle - 1;
    else return middle;
  }

  if (low <= 0) return 0;
  if (low >= records.length) return records.length - 1;

  const previousDifference = Math.abs(records[low - 1].epoch_ms - targetEpochMs);
  const nextDifference = Math.abs(records[low].epoch_ms - targetEpochMs);
  return previousDifference <= nextDifference ? low - 1 : low;
}

function renderSummary() {
  const joinedBioRecords = bioDatasets.flatMap(dataset => dataset.joinedRecords);
  els.gpsPointCount.textContent = String(gpsRecords.length);
  els.evaluationCount.textContent = selectedFiles.subjective ? String(joinedSubjectiveRecords.length) : '―';
  els.weatherPointCount.textContent = selectedFiles.weather ? String(joinedWeatherRecords.length) : '―';
  els.bioFileCount.textContent = bioDatasets.length > 0 ? String(bioDatasets.length) : '―';
  els.bioPointCount.textContent = bioDatasets.length > 0 ? String(joinedBioRecords.length) : '―';
  els.subjectiveMaxTimeDifference.textContent = joinedSubjectiveRecords.length > 0
    ? formatSeconds(Math.max(...joinedSubjectiveRecords.map(record => record.time_difference_ms)))
    : '―';
  els.weatherMaxTimeDifference.textContent = joinedWeatherRecords.length > 0
    ? formatSeconds(Math.max(...joinedWeatherRecords.map(record => record.time_difference_ms)))
    : '―';
  els.bioMaxTimeDifference.textContent = joinedBioRecords.length > 0
    ? formatSeconds(Math.max(...joinedBioRecords.map(record => record.time_difference_ms)))
    : '―';
}

function renderMapLayers() {
  clearMapLayers();
  drawBaseTrackIfNeeded();

  if (activeCategory === 'subjective') {
    renderSubjectiveMap();
  } else if (activeCategory === 'environment') {
    renderEnvironmentMap();
  } else if (activeCategory === 'bio') {
    renderBioMap();
  } else {
    renderGpsOnlyMap();
  }

  updateFullBounds();
}

function clearMapLayers() {
  [trackLayer, subjectiveRouteLayer, weatherRouteLayer, bioRouteLayer,
    subjectiveMarkerLayer, weatherPointLayer, bioPointLayer]
    .forEach(layer => layer.clearLayers());
}

function drawBaseTrackIfNeeded() {
  const shouldShow = activeCategory === 'subjective'
    ? els.subjectiveShowTrackToggle.checked
    : activeCategory === 'environment'
      ? els.environmentShowTrackToggle.checked
      : activeCategory === 'bio'
        ? els.bioShowTrackToggle.checked
        : true;

  if (!shouldShow || gpsRecords.length < 2) return;

  L.polyline(
    gpsRecords.map(record => [record.latitude, record.longitude]),
    { color: '#6f7880', weight: 3, opacity: 0.68 }
  ).addTo(trackLayer);
}

function renderGpsOnlyMap() {
  els.mapMetricDescription.textContent = 'GPS CSVの軌跡を表示しています．';
  els.captureTitle.textContent = 'GPS軌跡';
  els.captureSubtitle.textContent = selectedFiles.gps ? selectedFiles.gps.name : '';
  els.subjectiveShapeGuide.classList.add('hidden');
  els.environmentShapeGuide.classList.add('hidden');
  els.bioShapeGuide.classList.add('hidden');
  els.legend.innerHTML = '';
}

function renderSubjectiveMap() {
  const info = SUBJECTIVE_METRIC_INFO[currentSubjectiveMetric];
  els.mapMetricDescription.textContent = info.description;
  els.captureTitle.textContent = info.title;
  els.captureSubtitle.textContent = selectedFiles.subjective ? selectedFiles.subjective.name : '';
  els.subjectiveShapeGuide.classList.remove('hidden');
  els.environmentShapeGuide.classList.add('hidden');
  els.bioShapeGuide.classList.add('hidden');
  els.routeColorNote.classList.toggle('hidden', !els.subjectiveColorRouteToggle.checked);

  if (els.subjectiveColorRouteToggle.checked) drawSubjectiveColoredRoute();
  drawSubjectiveMarkers();
  renderSubjectiveLegend();
}

function drawSubjectiveMarkers() {
  joinedSubjectiveRecords.forEach(record => {
    if (record.trigger_type === 'checkpoint' && !els.checkpointToggle.checked) return;
    if (record.trigger_type === 'self_change' && !els.selfChangeToggle.checked) return;

    const value = record[currentSubjectiveMetric];
    const color = config.subjectivePalettes[currentSubjectiveMetric][String(value)] || '#777';
    const isSelfChange = record.trigger_type === 'self_change';
    const icon = L.divIcon({
      className: 'subjective-marker-wrapper',
      html: `<div class="subjective-marker ${isSelfChange ? 'self-change' : 'checkpoint'}" style="background:${color}"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      popupAnchor: [0, -10]
    });

    L.marker([record.latitude, record.longitude], { icon })
      .bindPopup(buildSubjectivePopup(record))
      .addTo(subjectiveMarkerLayer);
  });
}

function drawSubjectiveColoredRoute() {
  if (joinedSubjectiveRecords.length < 2) return;

  for (let index = 0; index < joinedSubjectiveRecords.length - 1; index += 1) {
    const current = joinedSubjectiveRecords[index];
    const next = joinedSubjectiveRecords[index + 1];
    if (next.gps_index < current.gps_index) continue;

    const coordinates = gpsRecords
      .slice(current.gps_index, next.gps_index + 1)
      .map(record => [record.latitude, record.longitude]);

    if (coordinates.length < 2) continue;
    const value = current[currentSubjectiveMetric];
    const color = config.subjectivePalettes[currentSubjectiveMetric][String(value)] || '#777';
    L.polyline(coordinates, { color, weight: 7, opacity: 0.83 }).addTo(subjectiveRouteLayer);
  }
}

function renderSubjectiveLegend() {
  const info = SUBJECTIVE_METRIC_INFO[currentSubjectiveMetric];
  const palette = config.subjectivePalettes[currentSubjectiveMetric];
  els.legend.innerHTML = `<span class="legend-title">凡例</span>${Object.entries(info.labels)
    .map(([value, label]) => `
      <span class="legend-item">
        <i class="legend-color" style="background:${palette[value] || '#777'}"></i>
        ${escapeHtml(valueLabel(value, currentSubjectiveMetric))} ${escapeHtml(label)}
      </span>`)
    .join('')}`;
}

function renderEnvironmentMap() {
  const info = WEATHER_METRIC_INFO[currentWeatherMetric];
  els.mapMetricDescription.textContent = info.description;
  els.captureTitle.textContent = info.title;
  els.captureSubtitle.textContent = selectedFiles.weather ? selectedFiles.weather.name : '';
  els.subjectiveShapeGuide.classList.add('hidden');
  els.environmentShapeGuide.classList.toggle('hidden', !els.weatherPointToggle.checked);
  els.bioShapeGuide.classList.add('hidden');

  const scale = getWeatherScale(currentWeatherMetric);
  if (els.weatherColorRouteToggle.checked) drawWeatherColoredRoute(scale);
  if (els.weatherPointToggle.checked) drawWeatherPoints(scale);
  renderWeatherLegend(scale);
}

function drawWeatherColoredRoute(scale) {
  if (joinedWeatherRecords.length < 2) return;

  for (let index = 0; index < joinedWeatherRecords.length - 1; index += 1) {
    const current = joinedWeatherRecords[index];
    const next = joinedWeatherRecords[index + 1];
    if (next.gps_index < current.gps_index) continue;

    const coordinates = gpsRecords
      .slice(current.gps_index, next.gps_index + 1)
      .map(record => [record.latitude, record.longitude]);

    if (coordinates.length < 2) continue;
    const valueA = Number(current[WEATHER_METRIC_INFO[currentWeatherMetric].column]);
    const valueB = Number(next[WEATHER_METRIC_INFO[currentWeatherMetric].column]);
    const value = Number.isFinite(valueA) && Number.isFinite(valueB) ? (valueA + valueB) / 2 : valueA;
    const color = colorForContinuousValue(value, scale);

    L.polyline(coordinates, { color, weight: 7, opacity: 0.88 }).addTo(weatherRouteLayer);
  }
}

function drawWeatherPoints(scale) {
  joinedWeatherRecords.forEach(record => {
    const value = Number(record[WEATHER_METRIC_INFO[currentWeatherMetric].column]);
    const color = colorForContinuousValue(value, scale);
    const icon = L.divIcon({
      className: 'weather-marker-wrapper',
      html: `<div class="weather-marker" style="background:${color}"></div>`,
      iconSize: [11, 11],
      iconAnchor: [5.5, 5.5],
      popupAnchor: [0, -7]
    });

    L.marker([record.latitude, record.longitude], { icon })
      .bindPopup(buildWeatherPopup(record))
      .addTo(weatherPointLayer);
  });
}

function getWeatherScale(metric) {
  const info = WEATHER_METRIC_INFO[metric];
  const values = joinedWeatherRecords
    .map(record => Number(record[info.column]))
    .filter(Number.isFinite);

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }

  return {
    min,
    max,
    colors: config.weatherPalettes[metric] || ['#2444a7', '#a92323']
  };
}

function colorForContinuousValue(value, scale) {
  if (!Number.isFinite(Number(value))) return '#777';
  const normalized = clamp((Number(value) - scale.min) / (scale.max - scale.min), 0, 1);
  const colors = scale.colors;
  if (colors.length === 1) return colors[0];

  const scaled = normalized * (colors.length - 1);
  const lowerIndex = Math.floor(scaled);
  const upperIndex = Math.min(colors.length - 1, lowerIndex + 1);
  const fraction = scaled - lowerIndex;
  return interpolateHexColor(colors[lowerIndex], colors[upperIndex], fraction);
}

function interpolateHexColor(colorA, colorB, fraction) {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const mix = channel => Math.round(a[channel] + (b[channel] - a[channel]) * fraction);
  return rgbToHex(mix('r'), mix('g'), mix('b'));
}

function hexToRgb(hex) {
  const normalized = String(hex).replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map(char => char + char).join('')
    : normalized;
  const number = Number.parseInt(value, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function renderWeatherLegend(scale) {
  const info = WEATHER_METRIC_INFO[currentWeatherMetric];
  const gradient = `linear-gradient(to right, ${scale.colors.join(', ')})`;
  const middle = (scale.min + scale.max) / 2;
  els.legend.innerHTML = `
    <span class="legend-title">凡例</span>
    <div class="legend-gradient">
      <div class="gradient-bar" style="background:${gradient}"></div>
      <div class="gradient-labels">
        <span>${formatWeatherValue(scale.min, info)}</span>
        <span>${formatWeatherValue(middle, info)}</span>
        <span>${formatWeatherValue(scale.max, info)}</span>
      </div>
    </div>`;
}

function getCurrentBioDataset() {
  return bioDatasets[currentBioDatasetIndex] || null;
}

function renderBioMap() {
  const dataset = getCurrentBioDataset();
  if (!dataset) return;
  const info = BIO_TYPE_INFO[dataset.type];
  els.mapMetricDescription.textContent = `${info.description} 対象：${dataset.fileName}`;
  els.captureTitle.textContent = info.title;
  els.captureSubtitle.textContent = dataset.fileName;
  els.subjectiveShapeGuide.classList.add('hidden');
  els.environmentShapeGuide.classList.add('hidden');
  els.bioShapeGuide.classList.toggle('hidden', !els.bioPointToggle.checked);

  const scale = getBioScale(dataset);
  if (els.bioColorRouteToggle.checked) drawBioColoredRoute(dataset, scale);
  if (els.bioPointToggle.checked) drawBioPoints(dataset, scale);
  renderBioLegend(dataset, scale);
}

function getBioScale(dataset) {
  const values = dataset.joinedRecords.map(record => Number(record.bio_value)).filter(Number.isFinite);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }
  const info = BIO_TYPE_INFO[dataset.type];
  return {
    min,
    max,
    colors: config.bioPalettes[info.paletteKey] || ['#2444a7', '#a92323']
  };
}

function drawBioColoredRoute(dataset, scale) {
  const records = dataset.joinedRecords;
  if (records.length < 2) return;
  for (let index = 0; index < records.length - 1; index += 1) {
    const current = records[index];
    const next = records[index + 1];
    if (next.gps_index < current.gps_index) continue;
    const coordinates = gpsRecords
      .slice(current.gps_index, next.gps_index + 1)
      .map(record => [record.latitude, record.longitude]);
    if (coordinates.length < 2) continue;
    const valueA = Number(current.bio_value);
    const valueB = Number(next.bio_value);
    const value = Number.isFinite(valueA) && Number.isFinite(valueB) ? (valueA + valueB) / 2 : valueA;
    L.polyline(coordinates, {
      color: colorForContinuousValue(value, scale),
      weight: 7,
      opacity: 0.88
    }).addTo(bioRouteLayer);
  }
}

function drawBioPoints(dataset, scale) {
  dataset.joinedRecords.forEach(record => {
    const color = colorForContinuousValue(Number(record.bio_value), scale);
    const icon = L.divIcon({
      className: 'bio-marker-wrapper',
      html: `<div class="bio-marker" style="background:${color}"></div>`,
      iconSize: [11, 11],
      iconAnchor: [5.5, 5.5],
      popupAnchor: [0, -7]
    });
    L.marker([record.latitude, record.longitude], { icon })
      .bindPopup(buildBioPopup(dataset, record))
      .addTo(bioPointLayer);
  });
}

function renderBioLegend(dataset, scale) {
  const info = BIO_TYPE_INFO[dataset.type];
  const gradient = `linear-gradient(to right, ${scale.colors.join(', ')})`;
  const middle = (scale.min + scale.max) / 2;
  els.legend.innerHTML = `
    <span class="legend-title">凡例</span>
    <div class="legend-gradient">
      <div class="gradient-bar" style="background:${gradient}"></div>
      <div class="gradient-labels">
        <span>${formatBioValue(scale.min, info)}</span>
        <span>${formatBioValue(middle, info)}</span>
        <span>${formatBioValue(scale.max, info)}</span>
      </div>
    </div>`;
}

function buildBioPopup(dataset, record) {
  const info = BIO_TYPE_INFO[dataset.type];
  return `
    <dl class="popup-grid">
      <dt>ファイル</dt><dd>${escapeHtml(dataset.fileName)}</dd>
      <dt>時刻</dt><dd>${escapeHtml(record.bio_timestamp)}</dd>
      <dt>${dataset.type === 'mlx' ? 'Object_C' : 'Ear_HR_BPM_Window'}</dt><dd>${escapeHtml(formatBioValue(record.bio_value, info))}</dd>
      <dt>GPS時刻</dt><dd>${escapeHtml(record.gps_timestamp)}</dd>
      <dt>GPS精度</dt><dd>${escapeHtml(formatAccuracy(record.accuracy))}</dd>
      <dt>GPS時刻差</dt><dd>${escapeHtml(formatSeconds(record.time_difference_ms))}</dd>
    </dl>`;
}

function buildSubjectivePopup(record) {
  return `
    <dl class="popup-grid">
      <dt>評価時刻</dt><dd>${escapeHtml(record.evaluation_started_at)}</dd>
      <dt>評価種別</dt><dd>${escapeHtml(triggerLabel(record.trigger_type))}</dd>
      <dt>区間</dt><dd>${escapeHtml(record.segment_id)}</dd>
      <dt>温冷感</dt><dd>${escapeHtml(subjectiveDisplayValue(record.thermal_sensation, 'thermal_sensation'))}</dd>
      <dt>快・不快</dt><dd>${escapeHtml(subjectiveDisplayValue(record.thermal_comfort, 'thermal_comfort'))}</dd>
      <dt>温熱選好</dt><dd>${escapeHtml(subjectiveDisplayValue(record.thermal_preference, 'thermal_preference'))}</dd>
      <dt>GPS時刻</dt><dd>${escapeHtml(record.gps_timestamp)}</dd>
      <dt>GPS精度</dt><dd>${escapeHtml(formatAccuracy(record.accuracy))}</dd>
      <dt>GPS時刻差</dt><dd>${escapeHtml(formatSeconds(record.time_difference_ms))}</dd>
    </dl>`;
}

function buildWeatherPopup(record) {
  return `
    <dl class="popup-grid">
      <dt>Weather時刻</dt><dd>${escapeHtml(record.weather_timestamp)}</dd>
      <dt>気温</dt><dd>${escapeHtml(formatOptionalMetric(record.temperature, '℃'))}</dd>
      <dt>相対湿度</dt><dd>${escapeHtml(formatOptionalMetric(record.humidity, '%'))}</dd>
      <dt>風速</dt><dd>${escapeHtml(formatOptionalMetric(record.wind_speed, 'km/h'))}</dd>
      <dt>暑さ指数</dt><dd>${escapeHtml(formatOptionalMetric(record.heat_index, '℃'))}</dd>
      <dt>GPS時刻</dt><dd>${escapeHtml(record.gps_timestamp)}</dd>
      <dt>GPS精度</dt><dd>${escapeHtml(formatAccuracy(record.accuracy))}</dd>
      <dt>GPS時刻差</dt><dd>${escapeHtml(formatSeconds(record.time_difference_ms))}</dd>
    </dl>`;
}

function renderSubjectiveTable() {
  const tbody = els.subjectiveTable.querySelector('tbody');
  tbody.innerHTML = joinedSubjectiveRecords.map((record, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(record.evaluation_started_at)}</td>
      <td>${escapeHtml(triggerLabel(record.trigger_type))}</td>
      <td>${escapeHtml(record.segment_id)}</td>
      <td>${escapeHtml(subjectiveDisplayValue(record.thermal_sensation, 'thermal_sensation'))}</td>
      <td>${escapeHtml(subjectiveDisplayValue(record.thermal_comfort, 'thermal_comfort'))}</td>
      <td>${escapeHtml(subjectiveDisplayValue(record.thermal_preference, 'thermal_preference'))}</td>
      <td>${record.latitude.toFixed(7)}</td>
      <td>${record.longitude.toFixed(7)}</td>
      <td>${escapeHtml(formatAccuracy(record.accuracy))}</td>
      <td>${escapeHtml(formatSeconds(record.time_difference_ms))}</td>
    </tr>`).join('');
}

function renderWeatherTable() {
  const tbody = els.weatherTable.querySelector('tbody');
  tbody.innerHTML = joinedWeatherRecords.map((record, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(record.weather_timestamp)}</td>
      <td>${escapeHtml(formatOptionalMetric(record.temperature, '℃'))}</td>
      <td>${escapeHtml(formatOptionalMetric(record.humidity, '%'))}</td>
      <td>${escapeHtml(formatOptionalMetric(record.wind_speed, 'km/h'))}</td>
      <td>${escapeHtml(formatOptionalMetric(record.heat_index, '℃'))}</td>
      <td>${record.latitude.toFixed(7)}</td>
      <td>${record.longitude.toFixed(7)}</td>
      <td>${escapeHtml(formatAccuracy(record.accuracy))}</td>
      <td>${escapeHtml(formatSeconds(record.time_difference_ms))}</td>
    </tr>`).join('');
}

function updateFullBounds() {
  if (gpsRecords.length === 0) {
    fullBounds = null;
    return;
  }
  fullBounds = L.latLngBounds(gpsRecords.map(record => [record.latitude, record.longitude]));
}

function fitMapToData() {
  if (!map || !fullBounds || !fullBounds.isValid()) return;
  map.fitBounds(fullBounds.pad(0.08), { maxZoom: config.map.maxZoom });
}

async function saveMapAsPng() {
  if (typeof html2canvas === 'undefined') {
    showMessage('PNG保存用ライブラリを読み込めませんでした．', 'error');
    return;
  }

  try {
    map.closePopup();
    await wait(250);
    const canvas = await html2canvas(els.mapCaptureArea, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      scale: Math.min(2, window.devicePixelRatio || 1)
    });
    canvas.toBlob(blob => {
      if (!blob) throw new Error('PNGを生成できませんでした．');
      downloadBlob(blob, `${sessionBaseName}_${activeMapFileSuffix()}.png`);
    }, 'image/png');
  } catch (error) {
    console.error(error);
    showMessage('地図のPNG保存に失敗しました．地図タイルの読込完了後に再度試してください．', 'error');
  }
}

function activeMapFileSuffix() {
  if (activeCategory === 'subjective') return currentSubjectiveMetric;
  if (activeCategory === 'environment') return `weather_${currentWeatherMetric}`;
  if (activeCategory === 'bio') {
    const dataset = getCurrentBioDataset();
    return dataset ? `bio_${dataset.type}_${sanitizeFileName(dataset.fileName.replace(/\.csv$/i, ''))}` : 'bio';
  }
  return 'gps_track';
}

function saveActiveJoinedCsv() {
  if (activeCategory === 'subjective') saveSubjectiveJoinedCsv();
  else if (activeCategory === 'environment') saveWeatherJoinedCsv();
  else if (activeCategory === 'bio') saveBioJoinedCsv();
}

function saveSubjectiveJoinedCsv() {
  const columns = [
    'trigger_type', 'segment_id', 'evaluation_started_at', 'evaluation_submitted_at',
    'response_duration_ms', 'thermal_sensation', 'thermal_comfort', 'thermal_preference',
    'gps_timestamp', 'time_difference_ms', 'latitude', 'longitude', 'accuracy', 'heading', 'speed'
  ];
  downloadRecordsCsv(`${sessionBaseName}_subjective_gps_joined.csv`, columns, joinedSubjectiveRecords);
}

function saveWeatherJoinedCsv() {
  const columns = [
    'weather_timestamp', 'temperature', 'humidity', 'wind_speed', 'heat_index',
    'gps_timestamp', 'time_difference_ms', 'latitude', 'longitude', 'accuracy', 'heading', 'speed'
  ];
  downloadRecordsCsv(`${sessionBaseName}_weather_gps_joined.csv`, columns, joinedWeatherRecords);
}

function saveBioJoinedCsv() {
  const dataset = getCurrentBioDataset();
  if (!dataset) return;
  const columns = dataset.type === 'mlx'
    ? ['source_file', 'bio_type', 'bio_timestamp', 'object_c', 'sensor_elapsed_ms', 'recv_jst',
      'gps_timestamp', 'time_difference_ms', 'latitude', 'longitude', 'accuracy', 'heading', 'speed']
    : ['source_file', 'bio_type', 'bio_timestamp', 'window_center', 'ear_hr_bpm_window', 'ear_hr_usable',
      'gps_timestamp', 'time_difference_ms', 'latitude', 'longitude', 'accuracy', 'heading', 'speed'];
  const stem = sanitizeFileName(dataset.fileName.replace(/\.csv$/i, ''));
  downloadRecordsCsv(`${sessionBaseName}_${stem}_gps_joined.csv`, columns, dataset.joinedRecords);
}

function downloadRecordsCsv(filename, columns, records) {
  const lines = [columns.join(',')];
  records.forEach(record => {
    lines.push(columns.map(column => escapeCsv(record[column])).join(','));
  });
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, filename);
}

function determineSessionBaseName() {
  if (selectedFiles.gps) {
    return sanitizeFileName(selectedFiles.gps.name.replace(/_gps\.csv$/i, '').replace(/\.csv$/i, ''));
  }
  return 'thermal_map';
}

function clearAll() {
  selectedFiles = { gps: null, subjective: null, weather: null, mlx: [], ppg: [] };
  gpsRecords = [];
  subjectiveRecords = [];
  weatherRecords = [];
  joinedSubjectiveRecords = [];
  joinedWeatherRecords = [];
  bioDatasets = [];
  currentBioDatasetIndex = 0;
  activeCategory = 'gps';
  currentSubjectiveMetric = 'thermal_sensation';
  currentWeatherMetric = 'temperature';

  els.batchFileInput.value = '';
  els.resultSection.classList.add('hidden');
  clearMapLayers();
  els.legend.innerHTML = '';
  updateFileSummary();
  map.setView(config.map.defaultCenter, config.map.defaultZoom);
  showMessage('読み込みを解除しました．');
}

function csvToObjects(rows) {
  if (rows.length === 0) return [];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1)
    .filter(row => row.some(value => String(value || '').trim() !== ''))
    .map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
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

  const kestrelMatch = text.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i
  );
  if (kestrelMatch) {
    const [, year, month, day, rawHour, minute, second, meridiem] = kestrelMatch;
    let hour = Number(rawHour) % 12;
    if (meridiem.toUpperCase() === 'PM') hour += 12;
    return new Date(
      Number(year), Number(month) - 1, Number(day), hour,
      Number(minute), Number(second), 0
    ).getTime();
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeHeader(value) {
  return String(value || '').replace(/^\uFEFF/, '').trim();
}

function toNullableNumber(value) {
  const text = String(value ?? '').trim();
  if (text === '' || text === '--') return '';
  const number = Number(text);
  return Number.isFinite(number) ? number : '';
}

function parseBoolean(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return false;
}

function formatLocalTimeWithMs(epochMs) {
  const d = new Date(epochMs);
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function formatBioValue(value, info) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '―';
  return `${number.toFixed(info.digits)} ${info.unit}`;
}

function triggerLabel(value) {
  if (value === 'checkpoint') return '定期地点評価';
  if (value === 'self_change') return '変動による評価';
  return value || '―';
}

function subjectiveDisplayValue(value, metric) {
  const key = String(value);
  const label = SUBJECTIVE_METRIC_INFO[metric].labels[key] || key || '―';
  if (metric === 'thermal_preference') return label;
  const number = Number(value);
  const prefix = number > 0 ? '＋' : number < 0 ? '−' : '';
  const displayNumber = number < 0 ? Math.abs(number) : number;
  return `${prefix}${displayNumber}：${label}`;
}

function valueLabel(value, metric) {
  if (metric === 'thermal_preference') return '';
  const number = Number(value);
  if (number > 0) return `＋${number}`;
  if (number < 0) return `−${Math.abs(number)}`;
  return '0';
}

function formatWeatherValue(value, info) {
  return `${Number(value).toFixed(info.digits)} ${info.unit}`;
}

function formatOptionalMetric(value, unit) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} ${unit}` : '―';
}

function formatAccuracy(value) {
  return Number.isFinite(Number(value)) ? `±${Number(value).toFixed(1)} m` : '―';
}

function formatSeconds(milliseconds) {
  return `${(Number(milliseconds) / 1000).toFixed(3)} s`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  return String(value || 'thermal_map').replace(/[\\/:*?"<>|]/g, '_');
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

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function showMessage(message, type = 'normal') {
  els.messageArea.textContent = message;
  els.messageArea.className = `message-area${type === 'normal' ? '' : ` ${type}`}`;
}
