/**
 * 卡片内容与轨道预设。
 * 数据逐一对应 Android 端的 `editor/BlackWorkspaceData.kt`。
 */

export const CARD_CONTENTS = [
  { tag: '01', title: '触发输入', subtitle: 'Trigger / Input', pinyinFull: 'chufashuru', pinyinAbbr: 'cfsr' },
  { tag: '02', title: '提示上下文', subtitle: 'Prompt / Context', pinyinFull: 'tishishangxiawen', pinyinAbbr: 'tssxw' },
  { tag: '03', title: '模型推理', subtitle: 'Model / Reasoning', pinyinFull: 'moxingtuili', pinyinAbbr: 'mxtl' },
  { tag: '04', title: '工具动作', subtitle: 'Tool / Action', pinyinFull: 'gongjudongzuo', pinyinAbbr: 'gjdz' },
  { tag: '05', title: '记忆数据', subtitle: 'Memory / Data', pinyinFull: 'jiyishuju', pinyinAbbr: 'jysj' },
  { tag: '06', title: '输出响应', subtitle: 'Output / Response', pinyinFull: 'shuchuxiangying', pinyinAbbr: 'scxy' },
  { tag: '07', title: '逻辑控制', subtitle: 'Logic / Control', pinyinFull: 'luojikongzhi', pinyinAbbr: 'ljkz' },
  { tag: '08', title: '安全观测', subtitle: 'Safety / Observability', pinyinFull: 'anquanguance', pinyinAbbr: 'aqgc' },
  { tag: '09', title: '编排', subtitle: 'Orchestration', pinyinFull: 'bianpai', pinyinAbbr: 'bp' },
];

/**
 * 整组倾斜（对应原生 graphicsLayer）：
 *   rotationY         = 读数 / 100 × 48°
 *   transformOrigin.x = 0.5 − 读数 / 100 × 0.35（占屏宽比例）
 *   cameraDistance    ≈ 8 英寸 ≈ 1280dp，用 CSS perspective() 近似
 * 倾斜作用在左右两条轨道的整体上，不是各转各的。
 */
export const TILT_ROT = 0.48;
export const TILT_ORIGIN = 0.0035;
export const CAMERA_DP = 1280;

/**
 * 三个状态（底部三个小点），数值与原生 BlackWorkspaceData.kt 一致：
 *   peak   整组横向偏移（dp，两条轨道同时偏移，同时决定弧线半径下限）
 *   curve  弧线曲率，半径 = max(140dp / curve%, |peak|)
 *   tilt   「倾斜」读数，原生 PRESET_TILTS = 95 / 65 / -65
 */
export const PRESETS = [
  { id: 0, label: 'EDGE', peak: -282, curve: 45, tilt: 95 },
  { id: 1, label: 'LEFT', peak: 21.5, curve: 16, tilt: 65 },
  { id: 2, label: 'RIGHT', peak: 735, curve: 14, tilt: -65 },
];

/** 启动时的状态：视频里一开始是中间那个点。 */
export const INITIAL_PRESET = 1;
