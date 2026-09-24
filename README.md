# CFSM ServerStatus

[CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor) 的第三方主题，沿用经典 ServerStatus 紧凑表格。数据只走 CFSM 公开主题接口。

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
