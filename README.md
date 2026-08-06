# GG Bookmark

一个现代风格的 Firefox 书签起始页扩展：深色磨砂玻璃 UI、分类网格卡片、可自定义背景与搜索引擎，以及一个独立的书签整理器。

## 功能

- **起始页（新标签页）**
  - 顶部居中搜索框，可切换搜索引擎（Bing / 百度 / Google / DuckDuckGo / 搜狗 / GitHub）。
  - 顶部左侧分类标签（导航精品 / 投资 / 系统…），可自定义添加 / 删除。
  - 右侧按钮：撤回、自动适应、整理书签、设置、卡片添加。
  - 主体按分类以网格卡片展示；每个卡片对应一个书签文件夹，只显示其中的书签，文件夹中的子文件夹不显示（可开启“包含子文件夹”）。
  - 卡片按列纵向堆叠：多个卡片可放在同一列（列数随屏幕宽度自适应）。
  - 每个书签项显示网站图标、名称、域名（描述）。
  - 拖动卡片上方标题（圆点手柄）调整卡片顺序。
  - 拖动卡片底部手柄可上下调整该卡片高度；所有卡片的列宽在**设置 → 卡片列宽**中统一调整。
  - “自动适应”按钮让所有卡片根据子项数量自动展开全部内容；每张卡片右上角也有独立的适应/固定切换。
  - 紧凑模式：当卡片高度较小时，书签项自动把“标题 + 域名”放到同一行并让图标变小（可在卡片菜单手动切换自动/开启/关闭）。

- **卡片菜单（每张卡片右上角）**
  - 重新选择文件夹
  - 包含子文件夹
  - 自动适应全部子项 / 固定高度
  - 紧凑模式（自动 / 开启 / 关闭）
  - 重命名
  - 删除卡片

- **整理书签页面**（右侧“整理书签”按钮进入）
  - 左侧文件夹树，右侧该文件夹内容。
  - 多选（Ctrl/⌘ 或 Shift 范围选择）。
  - 拖动选中项到其它文件夹移动；同在文件夹内拖动可排序。
  - 删除、新建文件夹、重命名、移动到其它文件夹。
  - 支持撤销（Ctrl/⌘+Z / 顶部按钮）。

- **设置页面**（右侧“设置”按钮，或 `about:addons` → 扩展 → 首选项）
  - 背景：渐变 / 深色渐变 / 自定义图片。
  - 自定义图片支持 **网络图片 URL** 或 **本地上传 JPG/PNG/WebP**（本地文件会自动转为数据链接加载，避免 `file://` 跨源限制）。
  - 自定义图片的模糊程度与遮罩透明度（模糊越小、遮罩越透明，图片越清晰；遮罩用于保证文字可读性）。
  - 卡片列宽（每列宽度，全局统一）。
  - 默认搜索引擎。
  - 主题色、字体大小、是否显示域名描述。

## 安装（临时加载）

1. 打开 Firefox，访问 `about:debugging#/runtime/this-firefox`。
2. 点击“临时载入附加组件”。
3. 选择本项目根目录下的 `manifest.json`。

> 由于 `chrome_url_overrides > newtab` 在 Firefox 中需用户授权（否则不会自动替换新标签页），安装后：
> 打开 `about:addons` → 找到 GG Bookmark → 点击扩展的“…”菜单 → 勾选“允许在隐私窗口中使用”，并在起始页设置里允许。之后点击工具栏图标或从地址栏打开起始页即可。
>
> 若新标签页未被替换，可点击工具栏扩展图标 → “打开起始页”。

## 开发 / 检查

```bash
# 安装 web-ext（需要 Node.js ≥ 18）
npm install -g web-ext

# 自动加载并在 Firefox 中运行（改了源码会自动重载）
web-ext run --source-dir .

# 静态检查（无误级别错误）
web-ext lint --source-dir .
```

## 在 Chrome / Edge 中加载

1. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）。
2. 右上角开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本项目根目录。
4. 新标签页会被替换为 GG Bookmark 起始页；点击工具栏图标可打开设置页。

> 本扩展同时兼容 Firefox 与 Chrome：采用 **Manifest V3**，`background` 使用
> service worker（`lib/background.js`，通过 `importScripts` 复用 `store.js`/`sync.js`），
> 并用 `lib/browser-polyfill.min.js` 把 Chrome 的回调式 `chrome.*` API 统一为
> Promise 化的 `browser.*`，页面与后台代码无需区分浏览器。

## 目录结构

```
manifest.json            扩展清单（Manifest V3）
lib/browser-polyfill.min.js  WebExtension API 兼容层（Firefox / Chrome 通用）
lib/background.js        MV3 service worker 入口（importScripts 复用以下两个）
lib/store.js             默认设置、搜索引擎、书签工具
js/shared.js             共享图标、Toast 提示
css/base.css             全局暗色 / 毛玻璃主题
pages/newtab/            起始页（新标签页 + 设置面板）
pages/organizer/         书签整理器
icons/                   图标与搜索引擎图标
```

数据（分类、卡片配置、搜索设置）保存在浏览器本地存储；书签本身由浏览器与整理器直接管理。




