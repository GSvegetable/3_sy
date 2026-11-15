# 3_sy — 双轨卡片空间

**当前版本：0.17.4**

双轨卡片空间的 Web / Capacitor 实现，保留三种空间状态、双轨滚动、卡片翻面与触控交互。

在线预览：https://3-sy-workspace.vercel.app

## 本次更新

- 调整前轨文字内边距，避免标题被后轨卡片遮挡。
- 同步项目版本信息。

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

- **0.17.4**：修复双轨重叠区域遮挡前轨文字的问题。
- **0.17.3**：修复触摸手势边界问题并同步版本信息。
- **0.17.2**：修复卡片文字层级与可见性。
- **0.17.1**：调整双轨配色与卡面样式。
- **0.17.0**：调整渲染方式与移动端表现。
- **0.16.x**：视觉迭代。
