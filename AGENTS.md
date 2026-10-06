# 注意

界面对照 `reference/monitor-theme-serverstatus`，接口对照 `reference/CF-Server-Monitor`。`reference/` 只读。

## 延迟图下方的区间条

延迟曲线下方有一条 22px 的 Brush，用来拖选时间区间。它占图表高度，必须算进容器。

- 展开行给 `tall`，高度 `h-[310px]`，窄屏 `h-[250px]`。
- 监控页延迟图不要放进 `Panel` 的 `h-40`，用 `h-[190px]`。
- 图例在曲线外面。不要把 Brush 拆成第二张图，否则拖动不会缩放曲线。
- 传给图表的 `data` 数组必须 memo 到只依赖 `rows`。recharts 见到新引用就重置选区，拖动过程中还会把 `isTravellerMoving` 清成 `false`，拖一下就断。别在每次渲染新建的数组上 `.filter` 再传给 `useMemo` 的依赖。
- `data` 要包含全部探测列，不只是显示中的。隐藏某个探测不能改变行数，否则 Brush 选中的索引会错位。
- 不要给 Brush 传 `startIndex` / `endIndex`。recharts 自己会把曲线切片到选区，受控只会把手柄吸附到最近的采样点。

## 展开行

用普通 `colSpan` 单元格，让内容自己占高度。不要绝对定位：会盖住下一行，或被表格裁切。

## 流量

- `net_rx` / `net_tx` 是累计字节。`net_in_speed` / `net_out_speed` 是 B/s。`net_rx_monthly` / `net_tx_monthly` 是本月字节。
- 行内进度条和分组标题都用本月用量，按 `traffic_calc_type`（`total` / `dl` / `ul` / `max`）计算。分组标题是「已用 / 配额」，不是累计上下行。
- `traffic_limit` 无单位时是 GB（×1024³）。`0`、`-1`、空值是不限额。内存和硬盘是 MB。
- `false` 不显示，`null` 是超时，不要补 0。

## 发布

可安装地址只能是只含 `index.html` 和 `assets/` 的标签，不能用 `main`。先跑 `npm run lint && npm run typecheck && npm test && npm run build && npm run validate:dist`。
