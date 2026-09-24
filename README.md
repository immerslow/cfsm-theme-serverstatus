# CFSM ServerStatus

个人使用的 [CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor) 第三方主题，把经典 ServerStatus 紧凑表格接到 CFSM 公开接口上。由 vibe coding 构建，仅供自己使用，不提供支持。

## 主题说明从哪来

CFSM 主控**不会**读取本仓库源码里的说明文件。

- 主题商店卡片的名称、简介、封面、作者，来自 [CFSM-Theme-Store](https://github.com/huilang-me/CFSM-Theme-Store) 的 `themes.json`。主控只拉这份清单；要出现在商店里，需要往那个仓库提交条目，而不是在这里加文件。
- 自定义安装只认构建产物。后台「自定义主题 URL」填：

  ```text
  https://github.com/immerslow/cfsm-theme-serverstatus/tree/v1.0.6
  ```

  `main` 是源码，入口是 `/src/main.tsx`，装上去会空白。`v1.0.6` 只有构建后的 `index.html` 和 `assets/`。主控反代这两个路径，不解析 README。

## 参考

- 布局与交互：[monitor-theme-serverstatus](https://github.com/monitor-probe/monitor-theme-serverstatus)
- 数据接口：[CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor) 的 `theme-develop.md`
- 主题约定对照：[CFSM-Glassmorphism](https://github.com/allury/CFSM-Glassmorphism)

## 开发

```bash
npm install
# 代理到一个开着公开页的 CFSM。不设时指向 http://127.0.0.1:8787
CFSM_HUB=https://status.example.com npm run dev
```

纯静态部署在 `index.html` 加上：

```html
<meta name="apiBase" content="https://status.example.com">
```

## 构建

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run validate:dist
```

产物根目录只有 `index.html` 与 `assets/`。旗帜和系统图标使用 CFSM 默认皮肤的 `/flags/`、`/os-icons/`，不打进主题。

## 页面

- `/#/` 分组表格，点击行展开详情
- `/#/server/:id` 资源与延迟图表
- `/#/settings` 隐藏离线、默认分组；可存本机，登录后可存 `theme_options`
- 管理入口只跳到 `/admin#admin`
