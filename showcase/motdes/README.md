# MOTDES 源代码交接

快照日期 2026 年 10 月 15 日

这是当前首页实现的可运行源工程 包含当前开场视频 全部 public 素材 四组下滑作品 M 动效 THANKS FOR WATCHING 收尾 以及刚完成修复的开场音乐和后续循环

本次为 2026 年 10 月 15 日完整快照 与同批提示词一起交给接手 AI 即可恢复

## 快速启动

在本 README 所在目录执行

```sh
node verify-package.mjs
cd motdes
npm ci
npm run dev
```

默认打开 http://127.0.0.1:4323/

建议 Node.js 22 或更高版本和 npm 10 或更高版本

源工程快照环境是 Node.js 26.0.0 和 npm 11.12.1

锁定的 Astro 5.18.2 要求 Node.js `18.20.8 || ^20.3.0 || >=22.0.0` npm `>=9.6.5`

首次 `npm ci` 需要网络访问 npm 仓库 不需要 API Key 后端数据库 或原作者电脑中的绝对路径

如果 4323 已占用 可以运行 `npm run dev -- --port 4324`

## 构建与部署

在 motdes 目录执行

```sh
npm run build
npm run preview
```

preview 同样使用 4323 端口 先停止 dev 或使用 `npm run preview -- --port 4324`

把构建后的整个 `motdes/dist` 部署到静态托管服务 网站目前使用根路径资源 最直接的部署位置是域名根目录

发布前把 `astro.config.mjs` 中的 `https://motdes.example` 改成实际域名

开发阶段不要通过 file 协议双击 index.html 来替代 HTTP 服务

## 包内结构

```text
MOTDES-source
  README.md
  MANIFEST.json                 每个交接文件的大小与 SHA256
  verify-package.mjs            不依赖 npm 的完整性检查
  HANDOFF_VALIDATION.json        本次独立恢复验证结果
  motdes
    package.json
    package-lock.json
    astro.config.mjs
    src                         完整当前源代码
    public                      所有现有视频 两首音乐 海报 图片 图标
    brand                       SVG 字标源文件
    tools                       现有辅助工具
  analysis
    profile-scroll
      verify-profile-gl.mjs     实际 Three 对象和时间线的离线检查
      verify-profile-damping.mjs 共享阻尼及卡片漂移的离线检查
    site-soundtrack
      verify-soundtrack.mjs      声音激活 顺序循环和生命周期检查
    opening-performance
      verify-boot.mjs            开场启动和资源准备检查
```

省略可重新生成的 node_modules dist 和 .astro

省略 .ref 参考缓存 旧版本副本 本机录屏以及开发过程的历史分析目录

src 和 public 保留交接时的文件内容 未为打包改写页面效果

public 中有少量保留的旧媒体 当前实际引用由源码决定 不要仅按文件名选择开场或替换作品

## 最新交互基准

- 开场用 `public/top/coin/intro-grab-pullback.mp4` 衔接 `loop-pullback.mp4`
- Profile 作品依次为 少女与猫 风暴之刃 焰灵奇想 赤焰之舞
- 作品圆角 图文在固定舞台内左右交换 卡片带轻微滚动漂移并能回稳
- 第四组向左右两侧退场 从 Profile 进度 0.797 起同步让底部 M 变大并抬升
- M 在前面的介绍和作品停留阶段保持小而浅 内部没有粒子
- M 放大曲线跨 Profile 和 PORTFOLIO 连续衔接 后者 0.62 完成放大 0.74 开始翻转
- Profile 使用浅灰白网格底与苹方优先的无衬线文字
- 收尾英文为 THANKS FOR WATCHING
- 第一步音乐随开场播放一次 约 92 秒结束后接第二首循环 音量已降低
- 一个 audio 元素承担两首歌 点击开启声音后才显示真实播放状态
- 开场未就绪时的点击能激活播放器 不会再把第一次点击误设为静音

更完整的布局 文案 映射和动效说明请使用同批次另一个文件 `02_MOTDES_AI复原提示词_20261015.md`

## 维护入口

- 四组作品与个人文案 `motdes/src/lib/profile-content.js`
- 动画时间线 `motdes/src/lib/profile-timeline.js`
- 图文排版 `motdes/src/styles/profile-story.css`
- 视频控制与卡片漂移 `motdes/src/scripts/controllers/profile-story.js`
- M 显现 尺寸和翻转 `motdes/src/scripts/gl/main-logo.js`
- 开场 `motdes/src/scripts/controllers/coin-opening.js`
- 音乐启动 静音与循环 `motdes/src/scripts/controllers/site-soundtrack.js`
- 音频资源 `motdes/public/sounds/opening-first.mp3` 和 `ambient-loop.mp3`
- 展开后案例 `motdes/src/lib/service-cases.js`
- THANKS FOR WATCHING 字形 `motdes/src/lib/outro-name.js`

源工程保留历史粒子模块文件 但当前 M 没有导入或挂载该粒子层

Header 当前不显示旧汉堡菜单与旧声音小控件 右下角新增的 SiteMusic 胶囊是当前音乐入口 要保留它

## 已知边界

- 当前实现的是首页 部分导航链接指向尚未实现的 news works about stellla contact 子页面
- 当前首页已包含两首音乐 历史 sound-manager 中的四个旧音效路径未提供素材 但当前硬币开场不调用它们
- 浏览器可能要求真实点击后才允许出声 点右下角 点击开启声音 页面普通点击也可恢复首次播放 已主动静音时只能用声音按钮重新开启
- 本次离线检查不等于浏览器实际听感验收
- 苹方依赖系统提供 非 Apple 系统使用现有字体回退 不随包分发系统字体文件
- 一般安装和构建无需重跑 tools 中的字形生成脚本 已生成结果随 src 提供 部分历史辅助脚本使用旧端口或可选依赖 运行前先检查
- 本交接不改写这些现存边界 也不把首页恢复描述成已完成全部子页面

## 验证

先安装并构建 然后从本 README 所在目录执行

```sh
node analysis/profile-scroll/verify-profile-gl.mjs
node analysis/profile-scroll/verify-profile-damping.mjs
node analysis/site-soundtrack/verify-soundtrack.mjs
node analysis/opening-performance/verify-boot.mjs
```

检查覆盖实际 Three.js 几何 姿态 透明度 屏幕投影 父级变换 正反向滚动 减少动态效果 共享阻尼 视频卡片回稳 音乐早期点击 浏览器授权模拟 双曲顺序循环 以及开场资源准备

这些检查不启动浏览器 不执行 GPU 渲染

本次交接的安装 构建 素材校验与离线检查结果在 HANDOFF_VALIDATION.json

浏览器实际视觉 动作和声音尚未在交接环境验证 需在可访问的浏览器中检查并试听后再报告完整验收通过
