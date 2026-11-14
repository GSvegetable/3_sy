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

/** 「倾斜」滑条的原生读数 → CSS rotateY 角度。 */
export const TILT_TO_DEG = 0.2;

/**
 * 三个状态（底部三个小点）。整组双轨在三个位置之间切换，转场带弹簧过冲：
 *   anchor  整组所处的位置
 *           out-left  推到屏幕左侧之外，只露出右半组
 *           left      贴左边缘，整组可见
 *           right     贴右边缘，整组可见
 *   curve   弧线曲率，越大弧越紧（半径 = 140dp / curve%）
 *   tilt    「倾斜」读数（原生单位）。白色轨取全量，青瓷轨取 -0.42 倍，
 *           正负号决定整组向哪一侧偏转。
 */
export const PRESETS = [
  { id: 0, label: 'EDGE', anchor: 'out-left', curve: 13, tilt: 95 },
  { id: 1, label: 'LEFT', anchor: 'left', curve: 23, tilt: 65 },
  { id: 2, label: 'RIGHT', anchor: 'right', curve: 33, tilt: -65 },
];

/** 启动时的状态：视频里一开始是中间那个点（贴左）。 */
export const INITIAL_PRESET = 1;
