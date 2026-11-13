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
 * 三组轨道预设。
 * shift  轨道整体横向位移（dp），负值向左。
 * curve  弧线曲率，越大弧越紧（半径 = 140dp / curve%）。
 * tilt   轨道 Y 轴倾角（deg），后轨与前轨反向，形成走廊式透视。
 */
export const PRESETS = [
  { id: 0, label: 'NEAR', shift: 0, curve: 13, tilt: 5 },
  { id: 1, label: 'ARC', shift: -56, curve: 23, tilt: 13 },
  { id: 2, label: 'WIDE', shift: 56, curve: 33, tilt: -11 },
];
