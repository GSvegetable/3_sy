# 3_sy — 双轨卡片空间

**当前版本：0.17.0**

双轨卡片空间的 Web / Capacitor 实现，保留三种空间状态、双轨滚动、卡片翻面与触控交互。

在线预览：https://3-sy-workspace.vercel.app

## 本次更新

- 重整玻璃视觉与合成方式，改善透射层次和卡面可读性。
- 移除高负载的动态绘制流程，降低持续渲染开销。
- 保留现有轨道布局、状态切换和卡片交互。

## 本地运行

```bash
npm install
npm run dev
```

生产构建：

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

## 版本记录

- **0.17.0**：更新玻璃表现与渲染方式，优化移动端运行负担。
- **0.16.x**：视觉材质与透射效果迭代。
- **0.15.x**：调整卡片层级、交互与转场表现。
