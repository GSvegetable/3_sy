# 3_sy — Android 双轨卡片空间的 Web 移植

这是 Android `BlackWorkspaceScreen` 的浏览器移植版本。预览页只保留原版的两条卡片轨道，不添加网页专属控制面板。

## v0.4.0 — 按 Android 源码重建布局

- 使用原版 `BlackWorkspaceData.kt` 的 9 张卡片内容与三组 Peak / Curve / Tilt 预设。
- 按原版尺寸实现 150 × 132 dp 卡片、72 dp 堆叠步距、58 dp 左边距和 -24 dp 轨道间距。
- 按原版焦点比例、圆弧半径、三角函数坐标、焦点缩放、层级和越界透明度计算卡片位置。
- 左轨采用有限滚动与边界压缩回弹；右轨按原版奇数卡片序列循环排列。
- 保留独立轨道拖动、惯性、横向切换预设、点击翻面、长按跨轨移动和可用设备上的触觉反馈。
- 卡片正面、背面和左轨瓷质卡面按 `CardFace` 的结构与配色重新实现。

## 在线预览

https://3-sy-workspace.vercel.app

## 本地运行

```bash
npm install
npm run dev
```

构建：

```bash
npm run build
```

## Android

```bash
npm install
npm run build
npx cap sync android
npx cap open android
```

## 与原生版本的差异

这是基于 Android 源码逻辑重写的 Web 实现，不是把 Jetpack Compose 直接运行在浏览器中。Android 的 AGSL RuntimeShader、Kyant Backdrop 的真实折射/镜头效果、系统重力传感器和原生弹簧动画不能被 CSS 完全等价复刻；目前网页端对材质与部分动画使用 CSS 近似。需要继续通过原版设备截图逐项校准视觉差异，不能将当前版本描述为像素级一致。
