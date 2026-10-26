# 作品图放这里

把作品缩略图（任意格式、任意尺寸）丢进这个文件夹，然后跑：

    node tools/ingest-works.mjs

脚本会按**文件名排序**依次转成 `public/cms-media/w1.avif` … `w6.avif`：
16:9 居中裁切、800×450、AVIF。不足 6 张时，剩下的槽位保留原有占位图。

想控制顺序就给文件名加前缀，例如 `1-live-beauty.png`、`2-reclaiming-me.png`。

对应的标题 / 日期 / 分类在 `src/pages/index.astro` 顶部的 `works` 数组里改。
