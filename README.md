# 温熱環境GPSマッピングWebApp

GPSログを必須入力とし，主観評価ログおよびKestrel 5500のWeatherログを任意入力として地図化するWebAppです．

## 表示できるマップ

### 主観評価

- 温冷感
- 温熱的快・不快
- 温熱選好

評価地点のマーカー表示を基本とし，任意で評価間のGPS経路を色分けできます．

### 環境評価（M1）

- 気温
- 相対湿度
- 風速
- 暑さ指数

Kestrelの測定時刻に最も近いGPS点へ値を割り当て，経路を色分けします．

## 入力ファイル

### GPS CSV【必須】

必要列：

```text
timestamp,latitude,longitude
```

`accuracy`，`heading`，`speed`は任意ですが，存在する場合は詳細表示と結合CSVに使用します．

### Subjective CSV【任意】

必要列：

```text
trigger_type,segment_id,evaluation_started_at,evaluation_submitted_at,response_duration_ms,thermal_sensation,thermal_comfort,thermal_preference
```

### Weather CSV【任意】

Kestrel 5500のエクスポート形式に対応しています．次の列を使用します．

```text
FORMATTED DATE_TIME,Temperature,Relative Humidity,Wind Speed,Heat Index
```

ファイル先頭の機器情報行と，ヘッダー直後の単位行は自動的に除外します．

## ファイル組合せ

| GPS | Subjective | Weather | 表示内容 |
|---|---|---|---|
| ○ | × | × | GPS軌跡のみ |
| ○ | ○ | × | 主観評価マップ |
| ○ | × | ○ | 環境評価マップ |
| ○ | ○ | ○ | 主観評価と環境評価の両方 |

## 時刻同期

- 主観評価は`evaluation_started_at`に最も近いGPS点へ対応付けます．
- Weatherは`FORMATTED DATE_TIME`に最も近いGPS点へ対応付けます．
- 時刻補正機能は設けていません．

対応時刻差は読み込み結果，ポップアップ，一覧，結合CSVで確認できます．

## 出力

- 表示中の地図をPNG保存
- 主観評価・GPS結合CSV
- Weather・GPS結合CSV

## 配置方法

LeafletとOpenStreetMapを使用するため，GitHub PagesまたはNetlifyなどのHTTPS環境へ配置してください．
`index.html`を直接開く場合も表示できますが，ブラウザのセキュリティ設定によって`config.json`を読み込めない場合は既定設定を使用します．


## 一括ファイル選択

1回のファイル選択で，GPS CSV，Subjective CSV，Weather CSVをまとめて選択できます．
アプリはCSV列名からファイル種別を自動判別します．

- GPS CSV：必須
- Subjective CSV：任意
- Weather CSV：任意

同じ種類のCSVを複数選択した場合は，誤対応を防ぐためエラーを表示します．
GPS CSVを確認できない場合は，マッピングを実行できません．
