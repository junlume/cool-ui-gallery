# PAYATHON 2026 UI 规格与逆向记录

## 证据范围
采集时间：2026-10-26（Asia/Shanghai）。来源：https://aipay.alipay.com/community/events/payathon-2026。只读 Ego Lite UI 采集，未登录、未提交表单、未修改 Cookie/LocalStorage。

## 页面结构
- 顶部导航：产品、开发者、社区、活动、关于我们、可信智能体商业；桌面横向，移动端收纳。
- Hero：年度黑客松标题、橙色强调、命令行/网格视觉、报名倒计时。
- 合作伙伴：深色背景、Logo 滚动带、可调速度控件。
- 价值区：三列收益卡片。
- 赛道区：总奖池、五个赛道标签切换、当前赛道详情卡、创建作品/产品介绍入口。
- 流程区：报名、提交、展示、评选四步。
- 活动日历：2026-09-21 至 2026-12 月的横向日期按钮，可滚动。
- Footer：合作伙伴墙、站点信息、版本号。

## 视觉规格（证据+重建）
- 色彩：暖灰/米白页面底色；正文近黑；品牌强调橙约 #ff4d00；伙伴区深黑。
- 布局：桌面内容左右约 10vw 内边距，移动约 24px；卡片使用细边框、白底和弱阴影。
- 字体：真实页面加载多条远程字体记录；重建使用 Inter 回退 Arial，保证可运行与可替换。
- 响应式：真实移动视口 390×844，页面总高度约 18,699px；Hero 约 859px，伙伴区约 435px。
- 动效：伙伴 Logo marquee；赛道切换更新详情与键盘数字按钮；日历横向滚动；导航/折叠层存在但未触发登录流程。

## 交互观察
- 赛道按钮：Vibe Pay、Skill Pay、Machine Pay、Token Pay、Agent Pay；选择后详情卡同步变更。
- 移动端赛道选择：真实 DOM 暴露“按键 1–5”按钮；重建以可点击标签实现。
- 活动日历：真实页面为 region“2026 年活动日历，可横向滚动”，日期按钮按日生成。
- 未复现：登录、报名、创建作品、支付接入向导、后台数据、真实倒计时服务。

## 截图与证据文件
- 桌面：eference/payathon-2026/desktop.png
- 移动：eference/payathon-2026/mobile.png
- 赛道状态：eference/payathon-2026/mobile-skill-pay.png、mobile-machine-pay.png
- DOM/CSS/字体/图片/SVG：eference/payathon-2026/page-data.json
- 移动布局：eference/payathon-2026/mobile-data.json
- 交互状态：eference/payathon-2026/interaction-data.json

## 素材清单（真实页面前 40 条）
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/agent-friendly-wordmark.SL9PuN8q.svg (378x88)
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/agent-silhouette.-HpQD743.svg (170x150)
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/agent.BpQi1F8h.svg (609x541)
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/vibe-silhouette.Bsudpjfj.svg (160x150)
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/vibe.YzIMapgp.svg (609x570)
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/skill-silhouette.B87tLn4O.svg (195x150)
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/skill-outline.C78XhNof.svg (52x40)
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/machine-silhouette.Dm8nQIyK.svg (240x150)
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/machine.BGtndQof.svg (704x440)
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/token-silhouette.UYg68BXC.svg (209x150)
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/token.BeyBDEIA.svg (682x489)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/8sPVS5vUIJMAAAAAQCAAAAgADvg4AQFr/original (464x37)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/4giDSLLYgHYAAAAAQEAAAAgADvg4AQFr/original (119x37)
-  (0x0)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/NATLT7af8P4AAAAAQFAAAAgADvg4AQFr/original (120x72)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/PQ68TpAOnrIAAAAAQEAAAAgADvg4AQFr/original (949x200)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/67HmT7u0NaoAAAAARlAAAAgADvg4AQFr/original (830x200)
- https://mdn.alipayobjects.com/huamei_sbzpph/afts/img/FrwzSJR9CNgAAAAAQmAAAAgADjOVAQJr/fmt.webp (1949x521)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/THTRTZNzwUcAAAAAQkAAAAgADvg4AQFr/original (674x200)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/GcgxQLVm52UAAAAAQlAAAAgADvg4AQFr/original (478x200)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/86ZaRqrHLkIAAAAARhAAAAgADvg4AQFr/original (665x200)
- https://mdn.alipayobjects.com/huamei_sbzpph/afts/img/0NBJTon0ZIYAAAAAQLAAAAgADjOVAQJr/fmt.webp (2224x392)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/fOcyTYOQqaAAAAAAQHAAAAgADvg4AQFr/original (519x153)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/GiPQQpNQDhAAAAAAS1AAAAgADvg4AQFr/original (669x200)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/28I-R7xkcOgAAAAAQCAAAAgADvg4AQFr/original (490x257)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/-pg2TaBxPfsAAAAAZqAAAAgADvg4AQFr/original (684x200)
- https://mdn.alipayobjects.com/huamei_sbzpph/afts/img/EGAKS5QXXQ8AAAAAQWAAAAgADjOVAQJr/fmt.webp (2336x286)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/6KosTLLoRHIAAAAAQSAAAAgADvg4AQFr/original (591x200)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/file/MRQlTbHnwnoAAAAAT7AAAAgADvg4AQFr (537x200)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/ZCrIT4uK0-4AAAAATiAAAAgADvg4AQFr/original (891x200)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/lI1xSLYLLEoAAAAAQLAAAAgADvg4AQFr/original (535x200)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/QgIMT6k-gCoAAAAATEAAAAgADvg4AQFr/original (1343x200)
- https://mdn.alipayobjects.com/huamei_sbzpph/afts/img/EHiNTY996RQAAAAAQ8AAAAgADjOVAQJr/fmt.webp (2430x1040)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/xC3aS6LPrIYAAAAAQlAAAAgADvg4AQFr/original (715x200)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/GXE1QKQRzs4AAAAAQTAAAAgADvg4AQFr/original (826x200)
- https://mdn.alipayobjects.com/huamei_sbzpph/afts/file/jVu_Q5r3lw8AAAAAQOAAAAgADjOVAQJr (294x105)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/uNBhRplJefEAAAAAQVAAAAgADvg4AQFr/original (900x200)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/TxGRSrVsu64AAAAAQdAAAAgADvg4AQFr/original (626x200)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/MpwKTadiIeMAAAAAQdAAAAgADvg4AQFr/original (160x32)
- https://mdn.alipayobjects.com/huamei_xyehqf/afts/img/PQ68TpAOnrIAAAAAQEAAAAgADvg4AQFr/original (949x200)

## 外链样式表
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/top-bar.CozK7WcG.css
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/payathon-header.BCH1XRAs.css
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/payathon-2026.C56K_e0B.css
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/ReleaseTopBar.BXm0gzqm.css
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/FooterClosingCard.C-QHJGiV.css
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/WatchaAssets.BkK0cBOE.css
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/NavigationQueryScript.HzMHniMc.css
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/SiteThemeHead.CB9TM8cR.css
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/index.ddALJaqe.css
- https://aipay.alipay.com/_astro/index.ddALJaqe.css
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/compact-navigation.D-FuPWfC.css
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/compact-navigation.D-FuPWfC.css
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/compact-navigation.D-FuPWfC.css
- https://gw.alipayobjects.com/render/p/yuyan/180020010001292425/_astro/compact-navigation.D-FuPWfC.css

## 偏差与限制
- 重建聚焦可复用布局和交互骨架，未复制真实品牌 Logo、插画、远程字体或业务流程。
- Hero 的 canvas/SVG 动效、真实图形、伙伴 Logo 资产和倒计时算法未复现；以 CSS 网格、文字 Logo 和静态日期带替代。
- 真实页面受视口、远程资源加载和运行时状态影响，截图是本次采集时点证据。
