# 3_sy — 双轨卡片空间

**当前版本：0.17.1**

双轨卡片空间的 Web / Capacitor 实现，保留三种空间状态、双轨滚动、卡片翻面与触控交互。

在线预览：https://3-sy-workspace.vercel.app

## 本次更新

- 更新双轨卡片配色，采用纯色视觉方案。
- 简化卡面材质表现，保留原有布局与交互。

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

- **0.17.1**：调整双轨配色与卡面样式。
- **0.17.0**：调整渲染方式与移动端表现。
- **0.16.x**：视觉迭代。
