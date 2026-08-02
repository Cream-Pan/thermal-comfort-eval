# 主観評価GPSマッピングWebApp

GPS CSVと主観評価CSVを読み込み，3種類の主観評価をOpenStreetMap上へ表示するWebAppです．

## 主な機能

- GPS軌跡を地図上へ表示
- 主観評価時刻に最も近いGPS点を自動対応付け
- 温冷感，温熱的快・不快，温熱選好の表示切替
- 定期地点評価を丸形，変動による評価をひし形で表示
- 評価地点を色付きマーカーで表示
- 任意で，前回の評価値を次の評価まで維持したものとして経路を色分け
- GPSとの時刻差が10秒を超える評価へ警告表示
- 評価マーカーの詳細ポップアップ
- 主観評価とGPSを結合したCSVの保存
- 地図画面のPNG保存
- 評価一覧表の表示

## 必要なCSV

### GPS CSV

```text
timestamp,latitude,longitude,accuracy,heading,speed
```

時刻形式は次を想定しています．

```text
2026/08/02 10:30:15.320
```

### 主観評価CSV

```text
trigger_type,segment_id,evaluation_started_at,evaluation_submitted_at,response_duration_ms,thermal_sensation,thermal_comfort,thermal_preference
```

## 使用方法

1．GitHub PagesなどのHTTPS環境へフォルダ内のファイルを配置します．
2．WebAppを開き，GPS CSVと主観評価CSVを同時に選択します．
3．「マッピングを作成する」を押します．
4．温冷感，温熱的快・不快，温熱選好を切り替えて確認します．
5．必要に応じて「評価間の経路を色分け」をONにします．
6．PNGまたは結合CSVを保存します．

## 対応付け方法

主観評価CSVの`evaluation_started_at`に最も近いGPS時刻を検索し，その座標へ評価マーカーを配置します．
GPSとの時刻差が`config.json`の`timeWarningThresholdMs`を超えた場合，警告として赤枠を表示します．

## 経路色分けについて

経路色分けは，前回の評価値が次の評価時点まで維持されたと仮定した補助表示です．
実際に回答した地点を示すマーカー表示が基本です．

## 設定変更

`config.json`で次を変更できます．

- GPSとの時刻差警告値
- OpenStreetMapの初期位置
- 各主観評価の配色
