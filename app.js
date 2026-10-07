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
  environmentScales: {
    temperature: { min: 25, max: 40 },
    humidity: { min: 40, max: 80 }
  },
  switchbotStations: {
    '1': {
      label: '固定点1',
      positions: {
        A: [35.5676524, 139.4013726],
        B: [35.5663157, 139.4029614]
      }
    },
    '2': { label: '固定点2', position: [35.5677830, 139.4015053] },
    '3': { label: '固定点3', position: [35.5666651, 139.4013467] }
  },
  bioPalettes: {
    mlx_object: ['#2444a7', '#4aa8cf', '#d9e8b4', '#f2c14e', '#e36b4f', '#a92323'],
    ear_hr: ['#2b6cb0', '#63b3ed', '#68d391', '#f6e05e', '#ed8936', '#c53030']
  }
};

const GPS_REQUIRED_COLUMNS = ['timestamp', 'latitude', 'longitude'];
const SUBJECTIVE_REQUIRED_COLUMNS = [
  'experiment_id',
  'trigger_type',
  'segment_id',
  'evaluation_started_at',
  'evaluation_submitted_at',
  'response_duration_ms',
  'thermal_sensation',
  'thermal_comfort'
];
const LEGACY_SUBJECTIVE_REQUIRED_COLUMNS = [
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
const SWITCHBOT_REQUIRED_COLUMNS = ['Date', 'Temperature_Celsius(℃)', 'Relative_Humidity(%)'];
const MAX_TIME_SERIES_POINTS_PER_DATASET = 2500;

const SUBJECTIVE_METRIC_INFO = {
  thermal_sensation: {
    title: '主観評価―温冷感',
    description: '青色ほど寒い側，赤色ほど暑い側の評価を示します．',
    labels: {
      cold: '寒い', cool: '涼しい', slightly_cool: 'やや涼しい', neutral: 'どちらでもない',
      slightly_warm: 'やや暖かい', warm: '暖かい', hot: '暑い'
    }
  },
  thermal_comfort: {
    title: '主観評価―温熱的快・不快',
    description: '赤色ほど不快，緑色ほど快い評価を示します．',
    labels: {
      very_uncomfortable: '非常に不快', uncomfortable: '不快', slightly_uncomfortable: 'やや不快',
      neutral: 'どちらでもない', slightly_comfortable: 'やや快い', comfortable: '快い',
      very_comfortable: '非常に快い'
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
const SWITCHBOT_METRIC_INFO = {
  temperature: {
    title: '固定点環境（M0）―気温',
    description: 'SwitchBot温湿度計プラスで取得した固定観測点の気温を表示します．',
    column: 'temperature',
    unit: '℃',
    digits: 1
  },
  humidity: {
    title: '固定点環境（M0）―相対湿度',
    description: 'SwitchBot温湿度計プラスで取得した固定観測点の相対湿度を表示します．',
    column: 'humidity',
    unit: '%',
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

const EXPERIMENT_CHECKPOINTS = {
  trial: [
    ['SUN_START', '実験開始・日向開始時'],
    ['SHADE_START', '日陰開始時'],
    ['END', '実験終了時']
  ],
  experiment2: [
    ['SUN1_START', '実験開始・日向①開始時'],
    ['SUN1_5MIN', '日向①開始から5 min後'],
    ['SUN1_10MIN', '日向①開始から10 min後'],
    ['SHADE1_START', '日陰①開始時'],
    ['SHADE1_5MIN', '日陰①開始から5 min後'],
    ['SHADE1_10MIN', '日陰①開始から10 min後'],
    ['BREAK_START', '室内休憩開始時'],
    ['BREAK_10MIN', '室内休憩開始から10 min後'],
    ['SHADE2_START', '日陰②開始時'],
    ['SHADE2_5MIN', '日陰②開始から5 min後'],
    ['SHADE2_10MIN', '日陰②開始から10 min後'],
    ['SUN2_START', '日向②開始時'],
    ['SUN2_5MIN', '日向②開始から5 min後'],
    ['SUN2_10MIN_END', '日向②開始から10 min後・実験終了時']
  ],
  experiment3: [
    ['POINT1_START', '実験開始・ポイント①開始時'],
    ['POINT1_5MIN', 'ポイント①開始から5 min後'],
    ['POINT1_10MIN', 'ポイント①開始から10 min後'],
    ['POINT2_START', 'ポイント②開始時'],
    ['POINT2_5MIN', 'ポイント②開始から5 min後'],
    ['POINT2_10MIN_END', 'ポイント②開始から10 min後・実験終了時']
  ]
};

const SUBJECTIVE_SCORE_MAP = {
  thermal_sensation: {
    cold: -3, cool: -2, slightly_cool: -1, neutral: 0,
    slightly_warm: 1, warm: 2, hot: 3
  },
  thermal_comfort: {
    very_uncomfortable: -3, uncomfortable: -2, slightly_uncomfortable: -1,
    neutral: 0, slightly_comfortable: 1, comfortable: 2, very_comfortable: 3
  },
  thermal_preference: { cooler: -1, no_change: 0, warmer: 1 }
};

const SUBJECTIVE_SCORE_LABELS = {
  thermal_sensation: {
    '-3': '寒い', '-2': '涼しい', '-1': 'やや涼しい', '0': 'どちらでもない',
    '1': 'やや暖かい', '2': '暖かい', '3': '暑い'
  },
  thermal_comfort: {
    '-3': '非常に不快', '-2': '不快', '-1': 'やや不快', '0': 'どちらでもない',
    '1': 'やや快い', '2': '快い', '3': '非常に快い'
  }
};

let config = DEFAULT_CONFIG;
let selectedFiles = {
  gps: null, subjective: null, weather: null,
  switchbot: { '1': null, '2': null, '3': null },
  mlx: [], ppg: []
};
let subjectiveSchema = 'v2';
let gpsRecords = [];
let subjectiveRecords = [];
let weatherRecords = [];
let switchbotDatasets = [];
let switchbotTimeline = [];
let experimentTimeRange = null;
let joinedSubjectiveRecords = [];
let joinedWeatherRecords = [];
let bioDatasets = [];
let currentBioDatasetIndex = 0;
let sessionBaseName = 'thermal_map';
let activeCategory = 'gps';
let activeEnvironmentMode = 'm1';
let currentSubjectiveMetric = 'thermal_sensation';
let currentWeatherMetric = 'temperature';
let currentSwitchbotMetric = 'temperature';
let switchbotDisplayMode = 'time';
let currentSwitchbotTimeIndex = 0;
let station1Position = 'A';
let activeViewMode = 'map';
let timeSeriesStartEpochMs = null;
let timeSeriesEndEpochMs = null;
let timeSeriesViewStartEpochMs = null;
let timeSeriesViewEndEpochMs = null;
let temporalCharts = {};
let temporalChartDescriptors = [];

let map = null;
let tileLayer = null;
let trackLayer = null;
let subjectiveMarkerLayer = null;
let subjectiveRouteLayer = null;
let weatherPointLayer = null;
let weatherRouteLayer = null;
let switchbotPointLayer = null;
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
    'gpsFileName', 'subjectiveFileName', 'weatherFileName', 'switchbotFileNames', 'mlxFileNames', 'ppgFileNames',
    'loadButton', 'clearButton', 'resultSection',
    'gpsPointCount', 'evaluationCount', 'weatherPointCount', 'switchbotFileCount', 'switchbotPointCount', 'bioFileCount', 'bioPointCount',
    'subjectiveMaxTimeDifference', 'weatherMaxTimeDifference', 'bioMaxTimeDifference',
    'mapViewModeButton', 'timeSeriesViewModeButton', 'mapModeContainer', 'timeSeriesModeContainer',
    'timeSeriesSeriesPicker', 'timeSeriesChartsContainer', 'timeSeriesEmptyMessage',
    'selectAllTimeSeriesButton', 'clearTimeSeriesSelectionButton',
    'panTimeSeriesBackwardButton', 'zoomOutTimeSeriesButton', 'zoomInTimeSeriesButton',
    'panTimeSeriesForwardButton', 'resetTimeSeriesRangeButton', 'timeSeriesRangeLabel',
    'subjectiveEventTimeline',
    'subjectiveCategoryTab', 'environmentCategoryTab', 'bioCategoryTab',
    'subjectiveControlArea', 'environmentControlArea', 'bioControlArea', 'gpsOnlyNotice',
    'subjectiveShowTrackToggle', 'subjectiveColorRouteToggle',
    'checkpointToggle', 'selfChangeToggle', 'eventEvaluationToggle', 'routeColorNote',
    'environmentM1Tab', 'environmentM0Tab', 'environmentM1Controls', 'environmentM0Controls',
    'environmentShowTrackToggle', 'weatherColorRouteToggle', 'weatherPointToggle',
    'switchbotShowTrackToggle', 'station1PositionSelect', 'switchbotTimeControl',
    'switchbotTimeSlider', 'switchbotSelectedTime', 'switchbotTimeStart', 'switchbotTimeEnd',
    'bioFileSelect', 'bioShowTrackToggle', 'bioColorRouteToggle', 'bioPointToggle',
    'mapMetricDescription', 'captureTitle', 'captureSubtitle',
    'subjectiveShapeGuide', 'environmentShapeGuide', 'switchbotShapeGuide', 'bioShapeGuide',
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
    const dataFiles = Array.from(event.dataTransfer?.files || [])
      .filter(file => /\.(csv|zip)$/i.test(file.name));
    handleBatchFiles(dataFiles);
  });

  els.mapViewModeButton.addEventListener('click', () => switchViewMode('map'));
  els.timeSeriesViewModeButton.addEventListener('click', () => switchViewMode('timeseries'));
  els.selectAllTimeSeriesButton.addEventListener('click', () => setAllTimeSeriesSelection(true));
  els.clearTimeSeriesSelectionButton.addEventListener('click', () => setAllTimeSeriesSelection(false));
  els.timeSeriesSeriesPicker.addEventListener('change', event => {
    if (event.target.matches('[data-time-series-id]')) renderSelectedTimeSeriesCharts();
  });
  els.panTimeSeriesBackwardButton.addEventListener('click', () => shiftTimeSeriesRange(-0.5));
  els.panTimeSeriesForwardButton.addEventListener('click', () => shiftTimeSeriesRange(0.5));
  els.zoomInTimeSeriesButton.addEventListener('click', () => scaleTimeSeriesRange(0.5));
  els.zoomOutTimeSeriesButton.addEventListener('click', () => scaleTimeSeriesRange(2));
  els.resetTimeSeriesRangeButton.addEventListener('click', resetTimeSeriesRange);

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

  document.querySelectorAll('[data-environment-mode]').forEach(button => {
    button.addEventListener('click', () => {
      switchEnvironmentMode(button.dataset.environmentMode);
    });
  });

  document.querySelectorAll('[data-switchbot-metric]').forEach(button => {
    button.addEventListener('click', () => {
      currentSwitchbotMetric = button.dataset.switchbotMetric;
      setActiveMetricButton('[data-switchbot-metric]', button);
      renderMapLayers();
    });
  });

  document.querySelectorAll('input[name="switchbotDisplayMode"]').forEach(input => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      switchbotDisplayMode = input.value;
      updateSwitchbotTimeControl();
      renderMapLayers();
    });
  });

  els.station1PositionSelect.addEventListener('change', () => {
    station1Position = els.station1PositionSelect.value === 'B' ? 'B' : 'A';
    renderMapLayers();
  });

  els.switchbotTimeSlider.addEventListener('input', () => {
    currentSwitchbotTimeIndex = Number(els.switchbotTimeSlider.value) || 0;
    updateSwitchbotTimeLabel();
    renderMapLayers();
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
    els.eventEvaluationToggle,
    els.environmentShowTrackToggle,
    els.weatherColorRouteToggle,
    els.weatherPointToggle,
    els.switchbotShowTrackToggle,
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
    environmentScales: {
      ...base.environmentScales,
      ...(loaded.environmentScales || {})
    },
    switchbotStations: {
      ...base.switchbotStations,
      ...(loaded.switchbotStations || {})
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
  switchbotPointLayer = L.layerGroup().addTo(map);
  bioRouteLayer = L.layerGroup().addTo(map);
  bioPointLayer = L.layerGroup().addTo(map);
}

async function handleBatchFiles(files) {
  selectedFiles = { gps: null, subjective: null, weather: null, switchbot: { '1': null, '2': null, '3': null }, mlx: [], ppg: [] };
  subjectiveSchema = 'v2';
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
    const zipFiles = files.filter(file => file.name.toLowerCase().endsWith('.zip'));
    const standaloneCsvFiles = files.filter(file => file.name.toLowerCase().endsWith('.csv'));
    if (zipFiles.length > 1) throw new Error('一度に読み込めるVitBuds SliderのZIPは1つです．');

    const candidateFiles = [];
    if (zipFiles.length > 0) candidateFiles.push(...await extractSliderZip(zipFiles[0]));
    candidateFiles.push(...standaloneCsvFiles);

    for (const file of candidateFiles) {
      const text = await file.text();
      const type = detectCsvType(text);

      if (!type) {
        if (/_(subjective|gps)\.csv$/i.test(file.name)) {
          throw new Error(`${file.name}の列名が仕様と一致しません．SubjectiveまたはGPS CSVの形式を確認してください．`);
        }
        unknownFiles.push(file.name);
        continue;
      }

      if (type === 'switchbot') {
        const stationId = detectSwitchbotStationId(file.name);
        if (!stationId) {
          throw new Error(`${file.name}をSwitchBot CSVとして認識しましたが，ファイル名から固定点1～3を判別できませんでした．`);
        }
        if (selectedFiles.switchbot[stationId]) {
          throw new Error(`固定点${stationId}のSwitchBot CSVが複数選択されています．`);
        }
        selectedFiles.switchbot[stationId] = file;
        detectedNames.push(`固定点${stationId}：${file.name}`);
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
      throw new Error('GPS CSVを確認できませんでした．ZIPまたはtimestamp，latitude，longitude列を含むCSVを選択してください．');
    }

    const optionalMessage = unknownFiles.length > 0
      ? ` 判別できなかったファイル：${unknownFiles.join('，')}`
      : '';

    showMessage(`${detectedNames.join(' ／ ')} を自動判別しました．${optionalMessage}`,
      unknownFiles.length > 0 ? 'warning' : 'normal');
  } catch (error) {
    console.error(error);
    selectedFiles = { gps: null, subjective: null, weather: null, switchbot: { '1': null, '2': null, '3': null }, mlx: [], ppg: [] };
    updateFileSummary();
    showMessage(error.message || 'CSVファイルの判別に失敗しました．', 'error');
  } finally {
    els.loadButton.textContent = 'マッピングを作成する';
    els.loadButton.disabled = !selectedFiles.gps;
  }
}

async function extractSliderZip(zipFile) {
  if (typeof JSZip === 'undefined') {
    throw new Error('ZIP読込ライブラリを読み込めませんでした．インターネット接続を確認してください．');
  }

  let archive;
  try {
    archive = await JSZip.loadAsync(zipFile);
  } catch (error) {
    throw new Error(`${zipFile.name}をZIPとして読み込めませんでした．`);
  }

  const csvEntries = Object.values(archive.files)
    .filter(entry => !entry.dir && entry.name.toLowerCase().endsWith('.csv'));
  const subjectiveEntries = csvEntries.filter(entry => /_subjective\.csv$/i.test(entry.name));
  const gpsEntries = csvEntries.filter(entry => /_gps\.csv$/i.test(entry.name));
  if (csvEntries.length !== 2 || subjectiveEntries.length !== 1 || gpsEntries.length !== 1) {
    throw new Error('ZIPには「{session_id}_subjective.csv」と「{session_id}_gps.csv」を各1ファイル格納してください．');
  }

  const subjectiveName = subjectiveEntries[0].name.split('/').pop();
  const gpsName = gpsEntries[0].name.split('/').pop();
  const subjectiveSession = subjectiveName.replace(/_subjective\.csv$/i, '');
  const gpsSession = gpsName.replace(/_gps\.csv$/i, '');
  if (!subjectiveSession || subjectiveSession !== gpsSession) {
    throw new Error('ZIP内のSubjective CSVとGPS CSVのsession_idが一致しません．');
  }

  const extractedFiles = [];
  for (const entry of [subjectiveEntries[0], gpsEntries[0]]) {
    const name = entry.name.split('/').pop();
    const content = await entry.async('uint8array');
    extractedFiles.push(new File([content], name, { type: 'text/csv;charset=utf-8' }));
  }
  return extractedFiles;
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

  if (LEGACY_SUBJECTIVE_REQUIRED_COLUMNS.every(column => firstHeaders.includes(column))) {
    return 'subjective';
  }

  if (PPG_REQUIRED_COLUMNS.every(column => firstHeaders.includes(column))) {
    return 'ppg';
  }

  if (MLX_REQUIRED_COLUMNS.every(column => firstHeaders.includes(column))) {
    return 'mlx';
  }

  if (SWITCHBOT_REQUIRED_COLUMNS.every(column => firstHeaders.includes(column))) {
    return 'switchbot';
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
    switchbot: 'SwitchBot CSV',
    mlx: 'MLX CSV',
    ppg: 'PPG_ACC CSV'
  };
  return labels[type] || type;
}

function updateFileSummary() {
  els.gpsFileName.textContent = selectedFiles.gps ? selectedFiles.gps.name : '未選択';
  els.subjectiveFileName.textContent = selectedFiles.subjective ? selectedFiles.subjective.name : '未選択';
  els.weatherFileName.textContent = selectedFiles.weather ? selectedFiles.weather.name : '未選択';
  const switchbotNames = Object.entries(selectedFiles.switchbot)
    .filter(([, file]) => Boolean(file))
    .map(([stationId, file]) => `固定点${stationId}：${file.name}`);
  els.switchbotFileNames.textContent = switchbotNames.length > 0 ? switchbotNames.join(' ／ ') : '未選択';
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
    switchbotDatasets = [];
    switchbotTimeline = [];
    joinedSubjectiveRecords = [];
    joinedWeatherRecords = [];
    bioDatasets = [];
    currentBioDatasetIndex = 0;
    currentSwitchbotTimeIndex = 0;

    experimentTimeRange = {
      startEpochMs: gpsRecords[0].epoch_ms,
      endEpochMs: gpsRecords[gpsRecords.length - 1].epoch_ms
    };
    if (selectedFiles.subjective) {
      const subjectiveText = await selectedFiles.subjective.text();
      const headers = (parseCsv(subjectiveText)[0] || []).map(normalizeHeader);
      const requiredColumns = headers.includes('experiment_id')
        ? SUBJECTIVE_REQUIRED_COLUMNS
        : LEGACY_SUBJECTIVE_REQUIRED_COLUMNS;
      validateCsvHeaders(subjectiveText, requiredColumns, 'Subjective CSV');
      subjectiveRecords = parseSubjectiveRecords(subjectiveText);
      if (subjectiveRecords.length === 0) throw new Error('有効な主観評価データがありません．');
      configureSubjectiveMetricTabs();

      validateExperimentIdentity(gpsRecords, subjectiveRecords);
      if (subjectiveSchema === 'legacy') {
        experimentTimeRange = getExperimentTimeRange(subjectiveRecords);
      } else {
        const subjectiveEpochs = subjectiveRecords.flatMap(record => [
          record.started_epoch_ms,
          record.submitted_epoch_ms
        ]).filter(Number.isFinite);
        experimentTimeRange = {
          startEpochMs: Math.min(gpsRecords[0].epoch_ms, ...subjectiveEpochs),
          endEpochMs: Math.max(gpsRecords[gpsRecords.length - 1].epoch_ms, ...subjectiveEpochs)
        };
      }

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

      weatherRecords = filterRecordsByTimeRange(
        weatherRecords,
        experimentTimeRange.startEpochMs,
        experimentTimeRange.endEpochMs
      );
      if (weatherRecords.length === 0) {
        throw new Error('解析対象時間内のWeatherデータがありません．');
      }
      joinedWeatherRecords = joinRecordsToGps(weatherRecords, gpsRecords, 'epoch_ms');
    }

    for (const [stationId, file] of Object.entries(selectedFiles.switchbot)) {
      if (!file) continue;
      const allRecords = parseSwitchbotRecords(await file.text(), file.name, stationId);
      const records = filterRecordsByTimeRange(
        allRecords,
        experimentTimeRange.startEpochMs,
        experimentTimeRange.endEpochMs
      );
      switchbotDatasets.push({
        stationId,
        fileName: file.name,
        allRecords,
        records
      });
    }
    configureSwitchbotTimeline();

    for (const file of selectedFiles.mlx) {
      const records = parseMlxRecords(await file.text(), file.name);
      const filtered = filterRecordsByTimeRange(
        records, experimentTimeRange.startEpochMs, experimentTimeRange.endEpochMs
      );
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
      const filtered = filterRecordsByTimeRange(
        records, experimentTimeRange.startEpochMs, experimentTimeRange.endEpochMs
      );
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
    activeEnvironmentMode = joinedWeatherRecords.length > 0 ? 'm1' : 'm0';
    configureEnvironmentModeTabs();
    updateSwitchbotTimeControl();
    chooseInitialCategory();
    configureCategoryTabs();
    renderSummary();
    renderSubjectiveTable();
    renderWeatherTable();
    renderMapLayers();
    renderTimeSeriesCharts();
    els.timeSeriesViewModeButton.disabled = typeof Chart === 'undefined';

    els.resultSection.classList.remove('hidden');
    requestAnimationFrame(() => {
      map.invalidateSize();
      resizeTimeSeriesCharts();
      fitMapToData();
      els.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const loadedNames = ['GPS'];
    if (selectedFiles.subjective) loadedNames.push('Subjective');
    if (selectedFiles.weather) loadedNames.push('Weather');
    if (switchbotDatasets.length > 0) loadedNames.push(`固定点${switchbotDatasets.length}ファイル`);
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
  else if (joinedWeatherRecords.length > 0 || switchbotDatasets.some(dataset => dataset.records.length > 0)) activeCategory = 'environment';
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
  const hasEnvironment = joinedWeatherRecords.length > 0 || switchbotDatasets.some(dataset => dataset.records.length > 0);
  const hasBio = bioDatasets.length > 0;
  els.subjectiveCategoryTab.disabled = !hasSubjective;
  els.environmentCategoryTab.disabled = !hasEnvironment;
  els.bioCategoryTab.disabled = !hasBio;
  switchCategory(activeCategory, false);
}

function switchCategory(category, rerender = true) {
  if (category === 'subjective' && joinedSubjectiveRecords.length === 0) return;
  if (category === 'environment' && joinedWeatherRecords.length === 0 && !switchbotDatasets.some(dataset => dataset.records.length > 0)) return;
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
  els.weatherTablePanel.classList.toggle('hidden', category !== 'environment' || activeEnvironmentMode !== 'm1');
  const isM0 = category === 'environment' && activeEnvironmentMode === 'm0';
  els.saveJoinedCsvButton.disabled = category === 'gps' || isM0;
  els.saveJoinedCsvButton.textContent = category === 'environment'
    ? (activeEnvironmentMode === 'm1' ? 'Weather・GPS結合CSVを保存' : '固定点はGPS結合なし')
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

function configureEnvironmentModeTabs() {
  const hasM1 = joinedWeatherRecords.length > 0;
  const hasM0 = switchbotDatasets.some(dataset => dataset.records.length > 0);
  els.environmentM1Tab.disabled = !hasM1;
  els.environmentM0Tab.disabled = !hasM0;
  if (activeEnvironmentMode === 'm1' && !hasM1) activeEnvironmentMode = hasM0 ? 'm0' : 'm1';
  if (activeEnvironmentMode === 'm0' && !hasM0) activeEnvironmentMode = hasM1 ? 'm1' : 'm0';
  updateEnvironmentModeUi();
}

function switchEnvironmentMode(mode) {
  if (mode === 'm1' && joinedWeatherRecords.length === 0) return;
  if (mode === 'm0' && !switchbotDatasets.some(dataset => dataset.records.length > 0)) return;
  activeEnvironmentMode = mode;
  updateEnvironmentModeUi();
  if (activeCategory === 'environment') {
    switchCategory('environment', false);
    renderMapLayers();
  }
}

function updateEnvironmentModeUi() {
  els.environmentM1Tab.classList.toggle('active', activeEnvironmentMode === 'm1');
  els.environmentM0Tab.classList.toggle('active', activeEnvironmentMode === 'm0');
  els.environmentM1Controls.classList.toggle('hidden', activeEnvironmentMode !== 'm1');
  els.environmentM0Controls.classList.toggle('hidden', activeEnvironmentMode !== 'm0');
}

function detectSwitchbotStationId(fileName) {
  const match = String(fileName || '').match(/温湿度計プラス\s*([123])/);
  if (match) return match[1];
  const fallback = String(fileName || '').match(/(?:^|[_\s-])([123])(?:[_\s.-]|$)/);
  return fallback ? fallback[1] : null;
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
        experiment_id: normalizeHeader(row.experiment_id),
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
  subjectiveSchema = rows.some(row => Object.prototype.hasOwnProperty.call(row, 'experiment_id'))
    ? 'v2'
    : 'legacy';
  return rows
    .map((row, index) => ({
      record_index: index,
      experiment_id: normalizeHeader(row.experiment_id),
      trigger_type: normalizeHeader(row.trigger_type),
      segment_id: normalizeHeader(row.segment_id),
      evaluation_started_at: normalizeHeader(row.evaluation_started_at),
      evaluation_submitted_at: normalizeHeader(row.evaluation_submitted_at),
      started_epoch_ms: parseTimestamp(row.evaluation_started_at),
      response_duration_ms: toNullableNumber(row.response_duration_ms),
      thermal_sensation: normalizeHeader(row.thermal_sensation),
      thermal_comfort: normalizeHeader(row.thermal_comfort),
      thermal_preference: normalizeHeader(row.thermal_preference),
      submitted_epoch_ms: parseTimestamp(row.evaluation_submitted_at),
      epoch_ms: parseTimestamp(row.evaluation_submitted_at)
    }))
    .filter(record => Number.isFinite(record.epoch_ms))
    .sort((a, b) => a.epoch_ms - b.epoch_ms);
}

function configureSubjectiveMetricTabs() {
  const preferenceButton = document.querySelector('[data-subjective-metric="thermal_preference"]');
  if (!preferenceButton) return;

  const supportsPreference = subjectiveSchema === 'legacy';
  preferenceButton.classList.toggle('hidden', !supportsPreference);
  if (!supportsPreference && currentSubjectiveMetric === 'thermal_preference') {
    currentSubjectiveMetric = 'thermal_sensation';
    const sensationButton = document.querySelector('[data-subjective-metric="thermal_sensation"]');
    if (sensationButton) setActiveMetricButton('[data-subjective-metric]', sensationButton);
  }
}

function validateExperimentIdentity(gps, subjective) {
  if (subjectiveSchema !== 'v2') return;
  const gpsIds = new Set(gps.map(record => record.experiment_id));
  const subjectiveIds = new Set(subjective.map(record => record.experiment_id));
  if (gpsIds.size !== 1 || subjectiveIds.size !== 1 || ![...gpsIds][0]
      || [...gpsIds][0] !== [...subjectiveIds][0]) {
    throw new Error('新形式のSubjective CSVとGPS CSVでexperiment_idが一致しません．');
  }
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

function parseSwitchbotRecords(text, fileName, stationId) {
  validateCsvHeaders(text, SWITCHBOT_REQUIRED_COLUMNS, `SwitchBot CSV（${fileName}）`);
  const rows = csvToObjects(parseCsv(text));
  return rows
    .map((row, index) => {
      const timestamp = normalizeHeader(row.Date);
      return {
        record_index: index,
        station_id: stationId,
        source_file: fileName,
        timestamp,
        epoch_ms: parseTimestamp(timestamp),
        temperature: Number(row['Temperature_Celsius(℃)']),
        humidity: Number(row['Relative_Humidity(%)'])
      };
    })
    .filter(record => Number.isFinite(record.epoch_ms)
      && Number.isFinite(record.temperature)
      && Number.isFinite(record.humidity))
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
  els.switchbotFileCount.textContent = switchbotDatasets.length > 0 ? String(switchbotDatasets.length) : '―';
  els.switchbotPointCount.textContent = switchbotDatasets.length > 0
    ? String(switchbotDatasets.reduce((sum, dataset) => sum + dataset.records.length, 0))
    : '―';
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
    subjectiveMarkerLayer, weatherPointLayer, switchbotPointLayer, bioPointLayer]
    .forEach(layer => layer.clearLayers());
}

function switchViewMode(mode) {
  activeViewMode = mode === 'timeseries' ? 'timeseries' : 'map';
  const showTimeSeries = activeViewMode === 'timeseries';
  els.mapModeContainer.classList.toggle('hidden', showTimeSeries);
  els.timeSeriesModeContainer.classList.toggle('hidden', !showTimeSeries);
  els.mapViewModeButton.classList.toggle('active', !showTimeSeries);
  els.timeSeriesViewModeButton.classList.toggle('active', showTimeSeries);
  els.mapViewModeButton.setAttribute('aria-pressed', String(!showTimeSeries));
  els.timeSeriesViewModeButton.setAttribute('aria-pressed', String(showTimeSeries));

  requestAnimationFrame(() => {
    if (showTimeSeries) resizeTimeSeriesCharts();
    else map.invalidateSize();
  });
}

function legacyTemporalDataset(label, records, valueKey, color, yAxisID = 'y') {
  return {
    label,
    data: records.filter(record => record[valueKey] !== '' && record[valueKey] !== null && record[valueKey] !== undefined)
      .map(record => ({ x: record.epoch_ms, y: Number(record[valueKey]) }))
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y)),
    backgroundColor: color,
    borderColor: color,
    pointRadius: 3,
    pointHoverRadius: 5,
    showLine: false,
    yAxisID
  };
}

function legacyCreateOrUpdateTimeSeriesChart(key, canvas, datasets, yScales = {}) {
  if (typeof Chart === 'undefined' || !canvas) return;
  const min = timeSeriesStartEpochMs;
  const max = Math.max(timeSeriesEndEpochMs ?? min, min + 1);
  const scales = {
    x: {
      type: 'linear',
      min,
      max,
      title: { display: true, text: '時刻（端末のローカル時刻）' },
      ticks: {
        maxTicksLimit: 6,
        callback: value => formatTimeAxis(Number(value))
      }
    },
    ...yScales
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    parsing: false,
    plugins: {
      legend: { display: datasets.length > 0, position: 'bottom' },
      tooltip: {
        callbacks: {
          title: items => items.length ? formatLocalTimeWithMs(Number(items[0].parsed.x)) : ''
        }
      }
    },
    scales
  };

  if (!temporalCharts[key]) {
    temporalCharts[key] = new Chart(canvas.getContext('2d'), {
      type: 'scatter',
      data: { datasets },
      options
    });
    return;
  }

  temporalCharts[key].data.datasets = datasets;
  temporalCharts[key].options.scales = scales;
  temporalCharts[key].update('none');
}

function legacyRenderTimeSeriesCharts() {
  if (typeof Chart === 'undefined') {
    els.timeSeriesViewModeButton.disabled = true;
    showMessage('時系列表示ライブラリを読み込めませんでした．インターネット接続を確認してください．', 'warning');
    return;
  }

  timeSeriesStartEpochMs = experimentTimeRange?.startEpochMs ?? gpsRecords[0]?.epoch_ms ?? 0;
  timeSeriesEndEpochMs = experimentTimeRange?.endEpochMs ?? gpsRecords[gpsRecords.length - 1]?.epoch_ms ?? timeSeriesStartEpochMs;

  const gpsDatasets = [
    temporalDataset('緯度（degree）', gpsRecords, 'latitude', '#2563eb', 'y'),
    temporalDataset('経度（degree）', gpsRecords, 'longitude', '#dc5a45', 'y2')
  ];
  createOrUpdateTimeSeriesChart('gps', els.gpsTimeSeriesChart, gpsDatasets, {
    y: {
      type: 'linear', position: 'left', title: { display: true, text: '緯度（degree）' },
      ticks: { callback: value => Number(value).toFixed(5) }
    },
    y2: {
      type: 'linear', position: 'right', title: { display: true, text: '経度（degree）' },
      grid: { drawOnChartArea: false }, ticks: { callback: value => Number(value).toFixed(5) }
    }
  });

  const subjectiveMetrics = [
    ['thermal_sensation', '温冷感', '#2878bd'],
    ['thermal_comfort', '温熱的快・不快', '#41965d']
  ];
  if (subjectiveSchema === 'legacy' && subjectiveRecords.some(record => record.thermal_preference)) {
    subjectiveMetrics.push(['thermal_preference', '温熱選好', '#d58a2a']);
  }
  const subjectiveDatasets = subjectiveMetrics.map(([metric, label, color]) => ({
    label,
    data: subjectiveRecords.map(record => ({
      x: record.epoch_ms,
      y: subjectiveScore(record[metric], metric)
    })).filter(point => Number.isFinite(point.x) && point.y !== null),
    backgroundColor: color,
    borderColor: color,
    pointRadius: 5,
    pointHoverRadius: 7,
    showLine: false
  }));
  createOrUpdateTimeSeriesChart('subjective', els.subjectiveTimeSeriesChart, subjectiveDatasets, {
    y: {
      type: 'linear', min: -3.5, max: 3.5,
      title: { display: true, text: '回答カテゴリ（順序尺度）' },
      ticks: {
        stepSize: 1,
        callback: value => Number(value) > 0 ? `＋${value}` : (Number(value) < 0 ? `−${Math.abs(Number(value))}` : '0')
      }
    }
  });
  renderSubjectiveEventTimeline();

  const weatherDatasets = [
    temporalDataset('気温（℃）', weatherRecords, 'temperature', '#d94841', 'y'),
    temporalDataset('相対湿度（%）', weatherRecords, 'humidity', '#2878bd', 'yHumidity'),
    temporalDataset('風速（km/h）', weatherRecords, 'wind_speed', '#24937a', 'yWind'),
    temporalDataset('暑さ指数（℃）', weatherRecords, 'heat_index', '#a64ca6', 'y')
  ];
  createOrUpdateTimeSeriesChart('weather', els.weatherTimeSeriesChart, weatherDatasets, {
    y: { type: 'linear', position: 'left', title: { display: true, text: '温度（℃）' } },
    yHumidity: {
      type: 'linear', position: 'right', title: { display: true, text: '相対湿度（%）' },
      grid: { drawOnChartArea: false }
    },
    yWind: {
      type: 'linear', position: 'right', offset: true,
      title: { display: true, text: '風速（km/h）' }, grid: { drawOnChartArea: false }
    }
  });

  const stationColors = ['#315da8', '#d16d35', '#3d8c62'];
  const switchbotTemperatureDatasets = switchbotDatasets.map((dataset, index) =>
    temporalDataset(`固定点${dataset.stationId} 気温（℃）`, dataset.records, 'temperature', stationColors[index % stationColors.length])
  );
  const switchbotHumidityDatasets = switchbotDatasets.map((dataset, index) =>
    temporalDataset(`固定点${dataset.stationId} 相対湿度（%）`, dataset.records, 'humidity', stationColors[index % stationColors.length])
  );
  createOrUpdateTimeSeriesChart('switchbotTemperature', els.switchbotTemperatureTimeSeriesChart, switchbotTemperatureDatasets, {
    y: { type: 'linear', title: { display: true, text: '気温（℃）' } }
  });
  createOrUpdateTimeSeriesChart('switchbotHumidity', els.switchbotHumidityTimeSeriesChart, switchbotHumidityDatasets, {
    y: { type: 'linear', title: { display: true, text: '相対湿度（%）' } }
  });

  const mlxDatasets = bioDatasets.filter(dataset => dataset.type === 'mlx').map((dataset, index) =>
    temporalDataset(dataset.fileName, dataset.records, 'object_c', stationColors[index % stationColors.length])
  );
  const ppgDatasets = bioDatasets.filter(dataset => dataset.type === 'ppg').map((dataset, index) =>
    temporalDataset(dataset.fileName, dataset.records, 'ear_hr_bpm_window', stationColors[index % stationColors.length])
  );
  createOrUpdateTimeSeriesChart('mlx', els.mlxTimeSeriesChart, mlxDatasets, {
    y: { type: 'linear', title: { display: true, text: 'Object_C（℃）' } }
  });
  createOrUpdateTimeSeriesChart('ppg', els.ppgTimeSeriesChart, ppgDatasets, {
    y: { type: 'linear', title: { display: true, text: '心拍数（bpm）' } }
  });

  els.gpsTimeSeriesCard.classList.toggle('hidden', gpsRecords.length === 0);
  els.subjectiveTimeSeriesCard.classList.toggle('hidden', subjectiveRecords.length === 0);
  els.weatherTimeSeriesCard.classList.toggle('hidden', weatherRecords.length === 0);
  els.switchbotTemperatureTimeSeriesCard.classList.toggle('hidden', switchbotDatasets.length === 0);
  els.switchbotHumidityTimeSeriesCard.classList.toggle('hidden', switchbotDatasets.length === 0);
  els.mlxTimeSeriesCard.classList.toggle('hidden', mlxDatasets.length === 0);
  els.ppgTimeSeriesCard.classList.toggle('hidden', ppgDatasets.length === 0);
}

function renderTimeSeriesCharts() {
  if (typeof Chart === 'undefined') {
    els.timeSeriesViewModeButton.disabled = true;
    showMessage('時系列表示ライブラリを読み込めませんでした．', 'warning');
    return;
  }

  const records = [
    ...gpsRecords, ...subjectiveRecords, ...weatherRecords,
    ...switchbotDatasets.flatMap(dataset => dataset.records),
    ...bioDatasets.flatMap(dataset => dataset.records)
  ];
  const epochs = records.map(record => Number(record.epoch_ms)).filter(Number.isFinite);
  timeSeriesStartEpochMs = epochs.length ? epochs.reduce((minimum, epoch) => Math.min(minimum, epoch), Infinity) : 0;
  timeSeriesEndEpochMs = epochs.length ? epochs.reduce((maximum, epoch) => Math.max(maximum, epoch), -Infinity) : timeSeriesStartEpochMs + 1;
  if (timeSeriesEndEpochMs <= timeSeriesStartEpochMs) timeSeriesEndEpochMs = timeSeriesStartEpochMs + 1;
  timeSeriesViewStartEpochMs = timeSeriesStartEpochMs;
  timeSeriesViewEndEpochMs = timeSeriesEndEpochMs;
  temporalChartDescriptors = buildTimeSeriesDescriptors();

  els.timeSeriesSeriesPicker.replaceChildren();
  temporalChartDescriptors.forEach(descriptor => {
    const label = document.createElement('label');
    label.className = 'series-picker-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.dataset.timeSeriesId = descriptor.id;
    const text = document.createElement('span');
    text.textContent = descriptor.title;
    label.append(checkbox, text);
    els.timeSeriesSeriesPicker.append(label);
  });

  renderSubjectiveEventTimeline();
  els.subjectiveEventTimeline.classList.toggle('hidden', subjectiveRecords.length === 0);
  renderSelectedTimeSeriesCharts();
  updateTimeSeriesRangeLabel();
}

function buildTimeSeriesDescriptors() {
  const stationColors = ['#315da8', '#d16d35', '#3d8c62'];
  const descriptors = [];
  const add = descriptor => { if (descriptor.hasData) descriptors.push(descriptor); };
  const hasNumeric = (items, key) => items.some(record =>
    record[key] !== '' && record[key] !== null && record[key] !== undefined && Number.isFinite(Number(record[key]))
  );
  const gpsScales = {
    y: { type: 'linear', position: 'left', title: { display: true, text: '緯度（degree）' }, ticks: { callback: value => Number(value).toFixed(5) } },
    y2: { type: 'linear', position: 'right', title: { display: true, text: '経度（degree）' }, grid: { drawOnChartArea: false }, ticks: { callback: value => Number(value).toFixed(5) } }
  };
  const subjectiveScale = (lowerLabel, upperLabel) => ({
    y: {
      type: 'linear', min: -3.5, max: 3.5, title: { display: true, text: '評価カテゴリ' },
      ticks: {
        count: 2,
        autoSkip: false,
        callback: value => Number(value) < 0 ? lowerLabel : upperLabel
      }
    }
  });
  const subjectiveDataset = (metric, title, color) => temporalDataset(
    title, subjectiveRecords, record => subjectiveScore(record[metric], metric), color, 'y', 5
  );
  const subjectiveLabel = metric => value =>
    SUBJECTIVE_SCORE_LABELS[metric]?.[String(Math.round(value))] ?? String(value);

  add({
    id: 'gps', title: 'GPS位置', hasData: gpsRecords.length > 0,
    description: '緯度と経度を左右の軸に示します．', yScales: gpsScales,
    datasets: () => [
      temporalDataset('緯度（degree）', gpsRecords, 'latitude', '#2563eb'),
      temporalDataset('経度（degree）', gpsRecords, 'longitude', '#dc5a45', 'y2')
    ]
  });
  add({
    id: 'temperature', title: '気温',
    hasData: hasNumeric(weatherRecords, 'temperature') || switchbotDatasets.some(dataset => hasNumeric(dataset.records, 'temperature')),
    description: '移動環境（Kestrel）と各固定点（SwitchBot）を同じ軸で比較します．',
    yScales: { y: { type: 'linear', title: { display: true, text: '気温（℃）' } } },
    datasets: () => [
      ...(hasNumeric(weatherRecords, 'temperature') ? [temporalDataset('移動環境（Kestrel）', weatherRecords, 'temperature', '#d94841')] : []),
      ...switchbotDatasets.map((dataset, index) => temporalDataset(`固定点${dataset.stationId}（SwitchBot）`, dataset.records, 'temperature', stationColors[index % 3]))
    ]
  });
  add({
    id: 'humidity', title: '相対湿度',
    hasData: hasNumeric(weatherRecords, 'humidity') || switchbotDatasets.some(dataset => hasNumeric(dataset.records, 'humidity')),
    description: '移動環境（Kestrel）と各固定点（SwitchBot）を同じ軸で比較します．',
    yScales: { y: { type: 'linear', title: { display: true, text: '相対湿度（%）' } } },
    datasets: () => [
      ...(hasNumeric(weatherRecords, 'humidity') ? [temporalDataset('移動環境（Kestrel）', weatherRecords, 'humidity', '#2878bd')] : []),
      ...switchbotDatasets.map((dataset, index) => temporalDataset(`固定点${dataset.stationId}（SwitchBot）`, dataset.records, 'humidity', stationColors[index % 3]))
    ]
  });
  add({
    id: 'wind_speed', title: '風速（Kestrel）', hasData: hasNumeric(weatherRecords, 'wind_speed'),
    description: 'Kestrelで記録した風速を表示します．',
    yScales: { y: { type: 'linear', title: { display: true, text: '風速（km/h）' } } },
    datasets: () => [temporalDataset('移動環境（Kestrel）', weatherRecords, 'wind_speed', '#24937a')]
  });
  add({
    id: 'heat_index', title: '暑さ指数（Kestrel）', hasData: hasNumeric(weatherRecords, 'heat_index'),
    description: 'Kestrelが記録した暑さ指数を表示します．',
    yScales: { y: { type: 'linear', title: { display: true, text: '暑さ指数（℃）' } } },
    datasets: () => [temporalDataset('移動環境（Kestrel）', weatherRecords, 'heat_index', '#a64ca6')]
  });
  add({
    id: 'thermal_sensation', title: '主観評価―温冷感',
    hasData: subjectiveRecords.some(record => subjectiveScore(record.thermal_sensation, 'thermal_sensation') !== null),
    description: 'カテゴリの順序を数値化した表示です．連続量として測定した値ではありません．',
    formatTooltipValue: subjectiveLabel('thermal_sensation'),
    yScales: subjectiveScale('寒い', '暑い'),
    datasets: () => [subjectiveDataset('thermal_sensation', '温冷感', '#2878bd')]
  });
  add({
    id: 'thermal_comfort', title: '主観評価―温熱的快・不快',
    hasData: subjectiveRecords.some(record => subjectiveScore(record.thermal_comfort, 'thermal_comfort') !== null),
    description: 'カテゴリの順序を数値化した表示です．連続量として測定した値ではありません．',
    formatTooltipValue: subjectiveLabel('thermal_comfort'),
    yScales: subjectiveScale('非常に不快', '非常に快い'),
    datasets: () => [subjectiveDataset('thermal_comfort', '温熱的快・不快', '#41965d')]
  });

  const mlx = bioDatasets.filter(dataset => dataset.type === 'mlx' && hasNumeric(dataset.records, 'object_c'));
  add({
    id: 'mlx', title: '生体情報―鼓膜方向温度', hasData: mlx.length > 0,
    description: 'MLX CSVのObject_Cを表示します．',
    yScales: { y: { type: 'linear', title: { display: true, text: 'Object_C（℃）' } } },
    datasets: () => mlx.map((dataset, index) => temporalDataset(dataset.fileName, dataset.records, 'object_c', stationColors[index % 3]))
  });
  const ppg = bioDatasets.filter(dataset => dataset.type === 'ppg' && hasNumeric(dataset.records, 'ear_hr_bpm_window'));
  add({
    id: 'ppg', title: '生体情報―耳PPG心拍数', hasData: ppg.length > 0,
    description: '使用可能と判定された耳PPGの心拍数を表示します．',
    yScales: { y: { type: 'linear', title: { display: true, text: '心拍数（bpm）' } } },
    datasets: () => ppg.map((dataset, index) => temporalDataset(dataset.fileName, dataset.records, 'ear_hr_bpm_window', stationColors[index % 3]))
  });
  return descriptors;
}

function temporalDataset(label, records, valueKey, color, yAxisID = 'y', pointRadius = 3) {
  const points = [];
  records.forEach(record => {
    const epoch = Number(record.epoch_ms);
    const raw = typeof valueKey === 'function' ? valueKey(record) : record[valueKey];
    const value = raw === '' || raw === null || raw === undefined ? NaN : Number(raw);
    if (Number.isFinite(epoch) && epoch >= timeSeriesViewStartEpochMs && epoch <= timeSeriesViewEndEpochMs && Number.isFinite(value)) {
      points.push({ x: epoch, y: value });
    }
  });
  points.sort((left, right) => left.x - right.x);
  const data = sampleTimeSeriesPoints(points);
  const radius = points.length > 10000 ? 1.2 : points.length > 2500 ? 1.8 : pointRadius;
  return { label, data, backgroundColor: color, borderColor: color, pointRadius: radius, pointHoverRadius: Math.max(4, radius + 2), showLine: false, yAxisID };
}

function sampleTimeSeriesPoints(points) {
  if (points.length <= MAX_TIME_SERIES_POINTS_PER_DATASET) return points;
  const bucketSize = Math.ceil(points.length / (MAX_TIME_SERIES_POINTS_PER_DATASET / 2));
  const result = [];
  for (let index = 0; index < points.length; index += bucketSize) {
    const bucket = points.slice(index, index + bucketSize);
    let low = bucket[0];
    let high = bucket[0];
    bucket.forEach(point => {
      if (point.y < low.y) low = point;
      if (point.y > high.y) high = point;
    });
    result.push(low);
    if (high !== low) result.push(high);
  }
  return result;
}

function setAllTimeSeriesSelection(selected) {
  els.timeSeriesSeriesPicker.querySelectorAll('[data-time-series-id]').forEach(input => { input.checked = selected; });
  renderSelectedTimeSeriesCharts();
}

function renderSelectedTimeSeriesCharts() {
  if (typeof Chart === 'undefined') return;
  const ids = new Set(Array.from(els.timeSeriesSeriesPicker.querySelectorAll('[data-time-series-id]:checked'), input => input.dataset.timeSeriesId));
  const selected = temporalChartDescriptors.filter(descriptor => ids.has(descriptor.id));
  Object.values(temporalCharts).forEach(chart => chart.destroy());
  temporalCharts = {};
  els.timeSeriesChartsContainer.replaceChildren();
  selected.forEach(descriptor => {
    const card = document.createElement('article');
    card.className = 'time-series-card';
    const heading = document.createElement('h3');
    heading.textContent = descriptor.title;
    const description = document.createElement('p');
    description.className = 'tiny-muted';
    description.textContent = descriptor.description;
    const plot = document.createElement('div');
    plot.className = 'time-series-chart';
    const canvas = document.createElement('canvas');
    canvas.id = `timeSeriesChart_${descriptor.id}`;
    plot.append(canvas);
    card.append(heading, description, plot);
    els.timeSeriesChartsContainer.append(card);
    createOrUpdateTimeSeriesChart(descriptor, canvas);
  });
  els.timeSeriesEmptyMessage.classList.toggle('hidden', selected.length > 0);
}

function createOrUpdateTimeSeriesChart(descriptor, canvas) {
  const datasets = descriptor.datasets();
  const min = timeSeriesViewStartEpochMs;
  const max = Math.max(timeSeriesViewEndEpochMs, min + 1);
  const options = {
    responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
    plugins: {
      legend: { display: datasets.length > 0, position: 'bottom' },
      tooltip: {
        callbacks: {
          title: items => items.length ? formatLocalTimeWithMs(Number(items[0].parsed.x)) : '',
          label: context => {
            const value = descriptor.formatTooltipValue
              ? descriptor.formatTooltipValue(Number(context.parsed.y))
              : context.formattedValue;
            return `${context.dataset.label}: ${value}`;
          }
        }
      },
      zoom: {
        limits: { x: { min: timeSeriesStartEpochMs, max: timeSeriesEndEpochMs, minRange: Math.min(1000, timeSeriesEndEpochMs - timeSeriesStartEpochMs) } },
        pan: { enabled: true, mode: 'x', modifierKey: 'ctrl', onPanComplete: ({ chart }) => applyTimeSeriesRangeFromChart(chart) },
        zoom: {
          mode: 'x', wheel: { enabled: true, modifierKey: 'ctrl' }, pinch: { enabled: true },
          drag: { enabled: true, modifierKey: 'shift', backgroundColor: 'rgba(70, 161, 95, 0.18)' },
          onZoomComplete: ({ chart }) => applyTimeSeriesRangeFromChart(chart)
        }
      }
    },
    scales: {
      x: { type: 'linear', min, max, title: { display: true, text: '時刻（端末のローカル時刻）' }, ticks: { maxTicksLimit: 6, callback: value => formatTimeAxis(Number(value)) } },
      ...descriptor.yScales
    }
  };
  temporalCharts[descriptor.id] = new Chart(canvas.getContext('2d'), { type: 'scatter', data: { datasets }, options });
}

function applyTimeSeriesRangeFromChart(chart) {
  if (!chart?.scales?.x) return;
  setTimeSeriesRange(Number(chart.scales.x.min), Number(chart.scales.x.max));
}

function setTimeSeriesRange(start, end) {
  if (!Number.isFinite(timeSeriesStartEpochMs) || !Number.isFinite(timeSeriesEndEpochMs)) return;
  const fullStart = timeSeriesStartEpochMs;
  const fullEnd = Math.max(timeSeriesEndEpochMs, fullStart + 1);
  const fullSpan = fullEnd - fullStart;
  const minSpan = Math.min(1000, fullSpan);
  let span = Math.min(fullSpan, Math.max(minSpan, Number(end) - Number(start)));
  if (!Number.isFinite(span)) span = fullSpan;
  let rangeStart = Number(start);
  if (!Number.isFinite(rangeStart)) rangeStart = fullStart;
  rangeStart = Math.max(fullStart, Math.min(fullEnd - span, rangeStart));
  timeSeriesViewStartEpochMs = rangeStart;
  timeSeriesViewEndEpochMs = rangeStart + span;
  updateTimeSeriesRangeLabel();
  Object.entries(temporalCharts).forEach(([id, chart]) => {
    const descriptor = temporalChartDescriptors.find(item => item.id === id);
    if (!descriptor) return;
    chart.options.scales.x.min = rangeStart;
    chart.options.scales.x.max = timeSeriesViewEndEpochMs;
    chart.data.datasets = descriptor.datasets();
    chart.update('none');
  });
}

function updateTimeSeriesRangeLabel() {
  if (!els.timeSeriesRangeLabel || !Number.isFinite(timeSeriesViewStartEpochMs)) return;
  els.timeSeriesRangeLabel.textContent = `${formatLocalTimeWithMs(timeSeriesViewStartEpochMs)}　–　${formatLocalTimeWithMs(timeSeriesViewEndEpochMs)}`;
}

function shiftTimeSeriesRange(direction) {
  const span = timeSeriesViewEndEpochMs - timeSeriesViewStartEpochMs;
  setTimeSeriesRange(timeSeriesViewStartEpochMs + span * direction, timeSeriesViewEndEpochMs + span * direction);
}

function scaleTimeSeriesRange(factor) {
  const center = (timeSeriesViewStartEpochMs + timeSeriesViewEndEpochMs) / 2;
  const halfSpan = (timeSeriesViewEndEpochMs - timeSeriesViewStartEpochMs) * factor / 2;
  setTimeSeriesRange(center - halfSpan, center + halfSpan);
}

function resetTimeSeriesRange() {
  setTimeSeriesRange(timeSeriesStartEpochMs, timeSeriesEndEpochMs);
}

function renderSubjectiveEventTimeline() {
  const experimentId = subjectiveRecords.find(record => record.experiment_id)?.experiment_id || '';
  const expected = EXPERIMENT_CHECKPOINTS[experimentId] || [];
  const checkpointCount = subjectiveRecords.filter(record => record.trigger_type === 'checkpoint').length;
  const events = subjectiveRecords.filter(record => record.trigger_type !== 'checkpoint');
  const checkpointIds = new Set(subjectiveRecords
    .filter(record => record.trigger_type === 'checkpoint')
    .map(record => record.segment_id));
  const missingCheckpoints = expected.filter(([id]) => !checkpointIds.has(id)).map(([, label]) => label);
  const header = experimentId
    ? `<p class="event-timeline-summary">実験ID：${escapeHtml(experimentId)}　定期評価：${checkpointCount}${expected.length ? ` / ${expected.length} 件` : ' 件'}　追加イベント：${events.length} 件${missingCheckpoints.length ? `<br>未記録の定期評価：${escapeHtml(missingCheckpoints.join('，'))}` : ''}</p>`
    : '';
  const rows = events.map(record => `
    <div class="event-timeline-row">
      <time>${escapeHtml(formatLocalTimeWithMs(record.epoch_ms))}</time>
      <strong>${escapeHtml(triggerLabel(record.trigger_type))}</strong>
      <span>${escapeHtml(segmentLabel(record.experiment_id, record.segment_id))}</span>
      <span>${escapeHtml(subjectiveDisplayValue(record.thermal_sensation, 'thermal_sensation'))}／${escapeHtml(subjectiveDisplayValue(record.thermal_comfort, 'thermal_comfort'))}</span>
    </div>`).join('');
  els.subjectiveEventTimeline.innerHTML = `${header}${rows || '<p class="tiny-muted">追加イベントはありません．</p>'}`;
}

function formatTimeAxis(epochMs) {
  const date = new Date(epochMs);
  const pad = value => String(value).padStart(2, '0');
  const span = timeSeriesViewEndEpochMs - timeSeriesViewStartEpochMs;
  if (span >= 24 * 60 * 60 * 1000) return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (span >= 60 * 60 * 1000) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function resizeTimeSeriesCharts() {
  Object.values(temporalCharts).forEach(chart => chart.resize());
}

function drawBaseTrackIfNeeded() {
  const shouldShow = activeCategory === 'subjective'
    ? els.subjectiveShowTrackToggle.checked
    : activeCategory === 'environment'
      ? (activeEnvironmentMode === 'm0'
        ? els.switchbotShowTrackToggle.checked
        : els.environmentShowTrackToggle.checked)
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
  els.switchbotShapeGuide.classList.add('hidden');
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
  els.switchbotShapeGuide.classList.add('hidden');
  els.bioShapeGuide.classList.add('hidden');
  els.routeColorNote.classList.toggle('hidden', !els.subjectiveColorRouteToggle.checked);

  if (els.subjectiveColorRouteToggle.checked) drawSubjectiveColoredRoute();
  drawSubjectiveMarkers();
  renderSubjectiveLegend();
}

function drawSubjectiveMarkers() {
  joinedSubjectiveRecords.forEach(record => {
    if (record.trigger_type === 'checkpoint' && !els.checkpointToggle.checked) return;
    if (isSubjectiveChangeEvent(record.trigger_type) && !els.selfChangeToggle.checked) return;
    if (record.trigger_type === 'event_evaluation' && !els.eventEvaluationToggle.checked) return;

    const value = record[currentSubjectiveMetric];
    const eventColor = record.trigger_type === 'comfortable_change' ? '#32965a'
      : record.trigger_type === 'uncomfortable_change' ? '#c84343' : '#777';
    const color = isFiniteSubjectiveColor(value, currentSubjectiveMetric)
      ? subjectiveColor(value, currentSubjectiveMetric)
      : eventColor;
    const isSelfChange = isSubjectiveChangeEvent(record.trigger_type);
    const icon = L.divIcon({
      className: 'subjective-marker-wrapper',
      html: `<div class="subjective-marker ${isSelfChange ? 'self-change' : 'checkpoint'} event-${escapeHtml(record.trigger_type)}" style="background:${color}"></div>`,
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
  const ratedRecords = joinedSubjectiveRecords.filter(record =>
    subjectiveScore(record[currentSubjectiveMetric], currentSubjectiveMetric) !== null
  );
  if (ratedRecords.length < 2) return;

  for (let index = 0; index < ratedRecords.length - 1; index += 1) {
    const current = ratedRecords[index];
    const next = ratedRecords[index + 1];
    if (next.gps_index < current.gps_index) continue;

    const coordinates = gpsRecords
      .slice(current.gps_index, next.gps_index + 1)
      .map(record => [record.latitude, record.longitude]);

    if (coordinates.length < 2) continue;
    const color = subjectiveColor(current[currentSubjectiveMetric], currentSubjectiveMetric);
    L.polyline(coordinates, { color, weight: 7, opacity: 0.83 }).addTo(subjectiveRouteLayer);
  }
}

function renderSubjectiveLegend() {
  const info = SUBJECTIVE_METRIC_INFO[currentSubjectiveMetric];
  const palette = config.subjectivePalettes[currentSubjectiveMetric];
  els.legend.innerHTML = `<span class="legend-title">凡例</span>${Object.entries(info.labels)
    .map(([value, label]) => `
      <span class="legend-item">
        <i class="legend-color" style="background:${subjectiveColor(value, currentSubjectiveMetric)}"></i>
        ${escapeHtml(valueLabel(SUBJECTIVE_SCORE_MAP[currentSubjectiveMetric][value], currentSubjectiveMetric))} ${escapeHtml(label)}
      </span>`)
    .join('')}`;
}

function renderEnvironmentMap() {
  if (activeEnvironmentMode === 'm0') {
    renderSwitchbotMap();
    return;
  }

  const info = WEATHER_METRIC_INFO[currentWeatherMetric];
  els.mapMetricDescription.textContent = info.description;
  els.captureTitle.textContent = info.title;
  els.captureSubtitle.textContent = selectedFiles.weather ? selectedFiles.weather.name : '';
  els.subjectiveShapeGuide.classList.add('hidden');
  els.environmentShapeGuide.classList.toggle('hidden', !els.weatherPointToggle.checked);
  els.switchbotShapeGuide.classList.add('hidden');
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
  const fixed = config.environmentScales?.[metric];
  if (fixed && Number.isFinite(Number(fixed.min)) && Number.isFinite(Number(fixed.max)) && Number(fixed.min) < Number(fixed.max)) {
    return {
      min: Number(fixed.min),
      max: Number(fixed.max),
      colors: config.weatherPalettes[metric] || ['#2444a7', '#a92323']
    };
  }

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

function configureSwitchbotTimeline() {
  switchbotTimeline = [];
  const available = switchbotDatasets.filter(dataset => dataset.records.length > 0);
  if (available.length === 0) {
    currentSwitchbotTimeIndex = 0;
    return;
  }

  const commonStart = Math.max(...available.map(dataset => dataset.records[0].epoch_ms));
  const commonEnd = Math.min(...available.map(dataset => dataset.records[dataset.records.length - 1].epoch_ms));
  if (commonStart > commonEnd) return;

  const roundedStart = Math.ceil(commonStart / 60000) * 60000;
  const roundedEnd = Math.floor(commonEnd / 60000) * 60000;
  for (let epochMs = roundedStart; epochMs <= roundedEnd; epochMs += 60000) {
    switchbotTimeline.push(epochMs);
  }
  currentSwitchbotTimeIndex = clamp(currentSwitchbotTimeIndex, 0, Math.max(0, switchbotTimeline.length - 1));
}

function updateSwitchbotTimeControl() {
  const enabled = switchbotDisplayMode === 'time' && switchbotTimeline.length > 0;
  els.switchbotTimeControl.classList.toggle('hidden', switchbotDisplayMode !== 'time');
  els.switchbotTimeSlider.disabled = !enabled;
  els.switchbotTimeSlider.min = '0';
  els.switchbotTimeSlider.max = String(Math.max(0, switchbotTimeline.length - 1));
  els.switchbotTimeSlider.step = '1';
  els.switchbotTimeSlider.value = String(clamp(currentSwitchbotTimeIndex, 0, Math.max(0, switchbotTimeline.length - 1)));
  if (switchbotTimeline.length > 0) {
    els.switchbotTimeStart.textContent = formatMinuteTime(switchbotTimeline[0]);
    els.switchbotTimeEnd.textContent = formatMinuteTime(switchbotTimeline[switchbotTimeline.length - 1]);
  } else {
    els.switchbotTimeStart.textContent = '―';
    els.switchbotTimeEnd.textContent = '―';
  }
  updateSwitchbotTimeLabel();
}

function updateSwitchbotTimeLabel() {
  if (switchbotTimeline.length === 0) {
    els.switchbotSelectedTime.textContent = 'データなし';
    return;
  }
  const index = clamp(currentSwitchbotTimeIndex, 0, switchbotTimeline.length - 1);
  currentSwitchbotTimeIndex = index;
  els.switchbotSelectedTime.textContent = formatMinuteTime(switchbotTimeline[index]);
}

function getSwitchbotStationPosition(stationId) {
  const station = config.switchbotStations?.[stationId];
  if (!station) return null;
  if (stationId === '1') {
    const position = station.positions?.[station1Position] || station.positions?.A;
    return Array.isArray(position) ? position : null;
  }
  return Array.isArray(station.position) ? station.position : null;
}

function renderSwitchbotMap() {
  const info = SWITCHBOT_METRIC_INFO[currentSwitchbotMetric];
  els.mapMetricDescription.textContent = `${info.description} 固定点間の空間補間は行いません．`;
  els.captureTitle.textContent = info.title;
  els.captureSubtitle.textContent = switchbotDisplayMode === 'time'
    ? `時刻指定：${switchbotTimeline.length > 0 ? formatMinuteTime(switchbotTimeline[currentSwitchbotTimeIndex]) : 'データなし'}`
    : `実験区間平均：${formatExperimentRange()}`;
  els.subjectiveShapeGuide.classList.add('hidden');
  els.environmentShapeGuide.classList.add('hidden');
  els.switchbotShapeGuide.classList.remove('hidden');
  els.bioShapeGuide.classList.add('hidden');

  const scale = getSwitchbotScale(currentSwitchbotMetric);
  drawSwitchbotPoints(scale);
  renderSwitchbotLegend(scale);
}

function getSwitchbotScale(metric) {
  const fixed = config.environmentScales?.[metric];
  const fallback = metric === 'temperature' ? { min: 25, max: 40 } : { min: 40, max: 80 };
  return {
    min: Number.isFinite(Number(fixed?.min)) ? Number(fixed.min) : fallback.min,
    max: Number.isFinite(Number(fixed?.max)) ? Number(fixed.max) : fallback.max,
    colors: config.weatherPalettes[metric] || ['#2444a7', '#a92323']
  };
}

function drawSwitchbotPoints(scale) {
  switchbotDatasets.forEach(dataset => {
    const position = getSwitchbotStationPosition(dataset.stationId);
    if (!position) return;
    const display = getSwitchbotDisplayRecord(dataset);
    if (!display || !Number.isFinite(Number(display.value))) return;

    const color = colorForContinuousValue(Number(display.value), scale);
    const marker = L.circleMarker(position, {
      radius: 9,
      color: '#ffffff',
      weight: 2,
      fillColor: color,
      fillOpacity: 0.96
    }).addTo(switchbotPointLayer);

    marker.bindTooltip(
      `${escapeHtml(config.switchbotStations?.[dataset.stationId]?.label || `固定点${dataset.stationId}`)}　${escapeHtml(formatSwitchbotMetric(display.value, currentSwitchbotMetric))}`,
      { permanent: true, direction: 'top', offset: [0, -8], className: 'switchbot-value-tooltip' }
    );
    marker.bindPopup(buildSwitchbotPopup(dataset, display));
  });
}

function getSwitchbotDisplayRecord(dataset) {
  const info = SWITCHBOT_METRIC_INFO[currentSwitchbotMetric];
  if (switchbotDisplayMode === 'average') {
    const values = dataset.records.map(record => Number(record[info.column])).filter(Number.isFinite);
    if (values.length === 0) return null;
    return {
      mode: 'average',
      value: values.reduce((sum, value) => sum + value, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length
    };
  }

  if (switchbotTimeline.length === 0 || dataset.records.length === 0) return null;
  const targetEpochMs = switchbotTimeline[currentSwitchbotTimeIndex];
  const nearestIndex = findNearestRecordIndex(dataset.records, targetEpochMs);
  const record = dataset.records[nearestIndex];
  if (!record || Math.abs(record.epoch_ms - targetEpochMs) > 90000) return null;
  return {
    mode: 'time',
    record,
    value: record[info.column],
    targetEpochMs,
    timeDifferenceMs: Math.abs(record.epoch_ms - targetEpochMs)
  };
}

function findNearestRecordIndex(records, targetEpochMs) {
  if (records.length === 0) return -1;
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
  return Math.abs(records[low - 1].epoch_ms - targetEpochMs) <= Math.abs(records[low].epoch_ms - targetEpochMs)
    ? low - 1 : low;
}

function buildSwitchbotPopup(dataset, display) {
  const label = config.switchbotStations?.[dataset.stationId]?.label || `固定点${dataset.stationId}`;
  if (display.mode === 'average') {
    return `
      <dl class="popup-grid">
        <dt>固定点</dt><dd>${escapeHtml(label)}</dd>
        <dt>ファイル</dt><dd>${escapeHtml(dataset.fileName)}</dd>
        <dt>対象時間</dt><dd>${escapeHtml(formatExperimentRange())}</dd>
        <dt>平均気温</dt><dd>${escapeHtml(formatAverageMetric(dataset.records, 'temperature', '℃', 1))}</dd>
        <dt>気温範囲</dt><dd>${escapeHtml(formatRangeMetric(dataset.records, 'temperature', '℃', 1))}</dd>
        <dt>平均相対湿度</dt><dd>${escapeHtml(formatAverageMetric(dataset.records, 'humidity', '%', 1))}</dd>
        <dt>湿度範囲</dt><dd>${escapeHtml(formatRangeMetric(dataset.records, 'humidity', '%', 1))}</dd>
        <dt>データ数</dt><dd>${dataset.records.length}</dd>
      </dl>`;
  }
  const record = display.record;
  return `
    <dl class="popup-grid">
      <dt>固定点</dt><dd>${escapeHtml(label)}</dd>
      <dt>ファイル</dt><dd>${escapeHtml(dataset.fileName)}</dd>
      <dt>測定時刻</dt><dd>${escapeHtml(record.timestamp)}</dd>
      <dt>気温</dt><dd>${escapeHtml(formatOptionalMetric(record.temperature, '℃'))}</dd>
      <dt>相対湿度</dt><dd>${escapeHtml(formatOptionalMetric(record.humidity, '%'))}</dd>
    </dl>`;
}

function renderSwitchbotLegend(scale) {
  const info = SWITCHBOT_METRIC_INFO[currentSwitchbotMetric];
  const gradient = `linear-gradient(to right, ${scale.colors.join(', ')})`;
  const middle = (scale.min + scale.max) / 2;
  els.legend.innerHTML = `
    <span class="legend-title">凡例</span>
    <div class="legend-gradient">
      <div class="gradient-bar" style="background:${gradient}"></div>
      <div class="gradient-labels">
        <span>${formatSwitchbotMetric(scale.min, currentSwitchbotMetric)}</span>
        <span>${formatSwitchbotMetric(middle, currentSwitchbotMetric)}</span>
        <span>${formatSwitchbotMetric(scale.max, currentSwitchbotMetric)}</span>
      </div>
    </div>`;
}

function formatSwitchbotMetric(value, metric) {
  const info = SWITCHBOT_METRIC_INFO[metric];
  return `${Number(value).toFixed(info.digits)} ${info.unit}`;
}

function formatAverageMetric(records, column, unit, digits) {
  const values = records.map(record => Number(record[column])).filter(Number.isFinite);
  if (values.length === 0) return '―';
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return `${average.toFixed(digits)} ${unit}`;
}

function formatRangeMetric(records, column, unit, digits) {
  const values = records.map(record => Number(record[column])).filter(Number.isFinite);
  if (values.length === 0) return '―';
  return `${Math.min(...values).toFixed(digits)}～${Math.max(...values).toFixed(digits)} ${unit}`;
}

function formatExperimentRange() {
  if (!experimentTimeRange) return '―';
  return `${formatLocalTimeMinute(experimentTimeRange.startEpochMs)}～${formatLocalTimeMinute(experimentTimeRange.endEpochMs)}`;
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
  els.switchbotShapeGuide.classList.add('hidden');
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
      ${record.experiment_id ? `<dt>実験ID</dt><dd>${escapeHtml(record.experiment_id)}</dd>` : ''}
      <dt>評価時刻</dt><dd>${escapeHtml(record.evaluation_started_at)}</dd>
      <dt>保存時刻</dt><dd>${escapeHtml(record.evaluation_submitted_at)}</dd>
      <dt>評価種別</dt><dd>${escapeHtml(triggerLabel(record.trigger_type))}</dd>
      <dt>区間</dt><dd>${escapeHtml(segmentLabel(record.experiment_id, record.segment_id))}</dd>
      <dt>温冷感</dt><dd>${escapeHtml(subjectiveDisplayValue(record.thermal_sensation, 'thermal_sensation'))}</dd>
      <dt>快・不快</dt><dd>${escapeHtml(subjectiveDisplayValue(record.thermal_comfort, 'thermal_comfort'))}</dd>
      ${record.thermal_preference ? `<dt>温熱選好</dt><dd>${escapeHtml(subjectiveDisplayValue(record.thermal_preference, 'thermal_preference'))}</dd>` : ''}
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
  const thead = els.subjectiveTable.querySelector('thead');
  thead.innerHTML = `<tr>
    <th>No.</th><th>評価時刻</th><th>種類</th><th>区間</th><th>温冷感</th><th>快・不快</th>
    ${subjectiveSchema === 'legacy' ? '<th>温熱選好</th>' : '<th>実験ID</th>'}
    <th>緯度</th><th>経度</th><th>GPS精度</th><th>時刻差</th>
  </tr>`;
  const tbody = els.subjectiveTable.querySelector('tbody');
  tbody.innerHTML = joinedSubjectiveRecords.map((record, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(record.evaluation_started_at)}</td>
      <td>${escapeHtml(triggerLabel(record.trigger_type))}</td>
      <td>${escapeHtml(segmentLabel(record.experiment_id, record.segment_id))}</td>
      <td>${escapeHtml(subjectiveDisplayValue(record.thermal_sensation, 'thermal_sensation'))}</td>
      <td>${escapeHtml(subjectiveDisplayValue(record.thermal_comfort, 'thermal_comfort'))}</td>
      ${subjectiveSchema === 'legacy'
        ? `<td>${escapeHtml(subjectiveDisplayValue(record.thermal_preference, 'thermal_preference'))}</td>`
        : `<td>${escapeHtml(record.experiment_id || '―')}</td>`}
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
  const points = gpsRecords.map(record => [record.latitude, record.longitude]);
  if (activeCategory === 'environment' && activeEnvironmentMode === 'm0') {
    switchbotDatasets.forEach(dataset => {
      const position = getSwitchbotStationPosition(dataset.stationId);
      if (position) points.push(position);
    });
  }
  if (points.length === 0) {
    fullBounds = null;
    return;
  }
  fullBounds = L.latLngBounds(points);
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
  if (activeCategory === 'environment') {
    return activeEnvironmentMode === 'm0'
      ? `fixedpoint_${currentSwitchbotMetric}_${switchbotDisplayMode}`
      : `weather_${currentWeatherMetric}`;
  }
  if (activeCategory === 'bio') {
    const dataset = getCurrentBioDataset();
    return dataset ? `bio_${dataset.type}_${sanitizeFileName(dataset.fileName.replace(/\.csv$/i, ''))}` : 'bio';
  }
  return 'gps_track';
}

function saveActiveJoinedCsv() {
  if (activeCategory === 'subjective') saveSubjectiveJoinedCsv();
  else if (activeCategory === 'environment' && activeEnvironmentMode === 'm1') saveWeatherJoinedCsv();
  else if (activeCategory === 'bio') saveBioJoinedCsv();
}

function saveSubjectiveJoinedCsv() {
  const columns = subjectiveSchema === 'v2'
    ? [
      'experiment_id', 'trigger_type', 'segment_id', 'evaluation_started_at', 'evaluation_submitted_at',
      'response_duration_ms', 'thermal_sensation', 'thermal_comfort',
      'gps_timestamp', 'time_difference_ms', 'latitude', 'longitude', 'accuracy', 'heading', 'speed'
    ]
    : [
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
  Object.values(temporalCharts).forEach(chart => chart.destroy());
  temporalCharts = {};
  selectedFiles = { gps: null, subjective: null, weather: null, switchbot: { '1': null, '2': null, '3': null }, mlx: [], ppg: [] };
  subjectiveSchema = 'v2';
  gpsRecords = [];
  subjectiveRecords = [];
  weatherRecords = [];
  switchbotDatasets = [];
  switchbotTimeline = [];
  experimentTimeRange = null;
  joinedSubjectiveRecords = [];
  joinedWeatherRecords = [];
  bioDatasets = [];
  currentBioDatasetIndex = 0;
  activeCategory = 'gps';
  activeEnvironmentMode = 'm1';
  currentSubjectiveMetric = 'thermal_sensation';
  configureSubjectiveMetricTabs();
  currentWeatherMetric = 'temperature';
  currentSwitchbotMetric = 'temperature';
  switchbotDisplayMode = 'time';
  currentSwitchbotTimeIndex = 0;
  station1Position = 'A';
  activeViewMode = 'map';
  timeSeriesStartEpochMs = null;
  timeSeriesEndEpochMs = null;
  timeSeriesViewStartEpochMs = null;
  timeSeriesViewEndEpochMs = null;
  temporalChartDescriptors = [];
  els.timeSeriesViewModeButton.disabled = true;
  els.timeSeriesRangeLabel.textContent = '―';
  els.timeSeriesSeriesPicker.replaceChildren();
  els.timeSeriesChartsContainer.replaceChildren();
  els.timeSeriesEmptyMessage.classList.add('hidden');
  els.subjectiveEventTimeline.innerHTML = '';
  switchViewMode('map');
  els.station1PositionSelect.value = 'A';
  const timeRadio = document.querySelector('input[name="switchbotDisplayMode"][value="time"]');
  if (timeRadio) timeRadio.checked = true;

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

  const switchbotMatch = text.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
  if (switchbotMatch) {
    const [, year, month, day, hour, minute, second = '0'] = switchbotMatch;
    return new Date(
      Number(year), Number(month) - 1, Number(day),
      Number(hour), Number(minute), Number(second), 0
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

function formatMinuteTime(epochMs) {
  const d = new Date(epochMs);
  const pad = number => String(number).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatLocalTimeMinute(epochMs) {
  const d = new Date(epochMs);
  const pad = number => String(number).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  if (value === '' || value === null || value === undefined) return '―';
  const number = Number(value);
  if (!Number.isFinite(number)) return '―';
  return `${number.toFixed(info.digits)} ${info.unit}`;
}

function isSubjectiveChangeEvent(triggerType) {
  return ['self_change', 'comfortable_change', 'uncomfortable_change'].includes(triggerType);
}

function subjectiveScore(value, metric) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric;
  const mapped = SUBJECTIVE_SCORE_MAP[metric]?.[text.toLowerCase()];
  return Number.isFinite(mapped) ? mapped : null;
}

function isFiniteSubjectiveColor(value, metric) {
  if (metric === 'thermal_preference') {
    return Boolean(config.subjectivePalettes[metric]?.[String(value ?? '').trim()]);
  }
  return subjectiveScore(value, metric) !== null;
}

function subjectiveColor(value, metric) {
  if (metric === 'thermal_preference') {
    return config.subjectivePalettes[metric]?.[String(value ?? '').trim()] || '#777';
  }
  const score = subjectiveScore(value, metric);
  return score === null ? '#777' : (config.subjectivePalettes[metric]?.[String(score)] || '#777');
}

function segmentLabel(experimentId, segmentId) {
  const checkpoint = EXPERIMENT_CHECKPOINTS[experimentId]
    ?.find(([id]) => id === segmentId);
  return checkpoint ? `${checkpoint[1]}（${segmentId}）` : segmentId || '―';
}

function triggerLabel(value) {
  if (value === 'checkpoint') return '定期評価';
  if (value === 'self_change') return '変動による評価';
  if (value === 'comfortable_change') return '快適方向への変化';
  if (value === 'uncomfortable_change') return '不快方向への変化';
  if (value === 'event_evaluation') return '任意評価';
  return value || '―';
}

function subjectiveDisplayValue(value, metric) {
  const key = String(value ?? '').trim();
  if (!key) return '―';
  if (metric === 'thermal_preference') {
    const label = SUBJECTIVE_METRIC_INFO[metric].labels[key] || key;
    return label;
  }

  const score = subjectiveScore(key, metric);
  if (score === null) return key;
  const categoryCode = Object.entries(SUBJECTIVE_SCORE_MAP[metric] || {})
    .find(([, ordinal]) => ordinal === score)?.[0];
  const label = SUBJECTIVE_METRIC_INFO[metric].labels[categoryCode] || key;
  const prefix = score > 0 ? '＋' : score < 0 ? '−' : '';
  const displayNumber = score < 0 ? Math.abs(score) : score;
  return /^-?\d+(\.\d+)?$/.test(key) ? `${prefix}${displayNumber}：${label}` : label;
}

function valueLabel(value, metric) {
  if (metric === 'thermal_preference' || !Number.isFinite(Number(value))) return '';
  const number = Number(value);
  if (number > 0) return `＋${number}`;
  if (number < 0) return `−${Math.abs(number)}`;
  return '0';
}

function formatWeatherValue(value, info) {
  return `${Number(value).toFixed(info.digits)} ${info.unit}`;
}

function formatOptionalMetric(value, unit) {
  if (value === '' || value === null || value === undefined) return '―';
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} ${unit}` : '―';
}

function formatAccuracy(value) {
  if (value === '' || value === null || value === undefined) return '―';
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
