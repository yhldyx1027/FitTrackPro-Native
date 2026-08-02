# FitTrackPro-Native

个人本地使用的健身饮食追踪应用（React Native / Expo），数据完全保存在本机，无需账号与联网。

## 功能

- **概览仪表盘**：运动手表风格圆盘展示今日摄入与碳/蛋/脂进度，中心大数字显示摄入量；下方显示今日训练消耗
- **训练计划**：创建/编辑/删除训练计划（动作、组次、重量、动作类型、MET 热量参数），开始训练后计时不中断（应用退出也能续算），勾组实时估算容量与消耗，结束后自动结算并同步到当日状态
- **饮食记录**：按早餐/午餐/晚餐/加餐记录食物，支持份数与自定义食物库；训练日/休息日自动切换营养建议
- **历史记录**：日历视图按日查看训练与饮食记录
- **身体设置**：身高/体重/年龄/性别/目标（减脂/维持/增肌）/活动系数，实时计算 BMR、TDEE 与建议摄入
- **AI 饮食助手**：接入 DeepSeek，可在手机里直接询问食物热量、碳蛋脂配置与三餐搭配；回答会结合你的身体数据、目标摄入与今日已吃（API Key 仅保存在本机，不会上传）。告诉 AI"我吃了什么"，它会自动算出这顿饭的热量/碳水/蛋白质/脂肪，并把该食物直接生成到食物库（带添加按钮），一键加入对应餐次

## 技术栈

- Expo SDK 57 / React Native 0.86 / TypeScript
- React Navigation（Bottom Tabs + Native Stack）
- AsyncStorage 本地持久化（SQLite）
- react-native-svg（仪表盘圆盘）
- DeepSeek Chat API（OpenAI 兼容接口，用户自备 API Key）

## 快速开始

```bash
npm install
npx expo start --dev-client
```

调试设备流程（Windows adb + WSL2 + USB 手机）见 [README_DEBUG.md](./README_DEBUG.md)。

## 项目结构

```
├── App.tsx                    # 入口与导航（5 Tab + 子页面 Stack）
├── src/
│   ├── screens/               # 概览/训练/饮食/记录/设置/AI 聊天
│   ├── components/            # 按压反馈、滑动返回等通用组件
│   ├── hooks/useAppState.tsx  # 全局状态与业务动作
│   ├── storage/storage.ts     # AsyncStorage 持久化层
│   ├── services/ai.ts         # DeepSeek 对话服务与个性化饮食上下文
│   ├── utils/calculations.ts  # BMR/TDEE/宏量/训练消耗等计算
│   ├── theme/index.ts         # 配色/间距/排版/阴影
│   └── types/index.ts
├── BUG_LOG.md                 # 测试记录与已知问题
└── README_DEBUG.md            # 真机调试指南
```

## 核心计算逻辑

- **BMR**：Harris-Benedict 公式（分性别）
- **TDEE**：`BMR × 活动系数 + 当日训练消耗`
- **目标调整**：减脂 −350 / 维持 0 / 增肌 +250 千卡
- **宏量分配**：训练日 碳:蛋:脂 = 5:3:2，休息日 4:3:3（按热量占比换算克数）
- **训练消耗**：ACSM 代谢公式 `MET × 3.5 × 体重 × 时长 / 200 × (1 + 容量修正)`，按动作类型（负重/自重/有氧）分别估算，仅统计已完成组
- **当日判断**：本地时区自然日滚动（非 UTC）

## 数据与隐私

- 所有数据仅保存在设备本地（AsyncStorage），无任何云端上报
- 支持“清理历史记录”与“重置数据（保留计划和食物库）”

## 已知问题与设计约定

- 消耗圆环目标：已移除固定 300 千卡刻度，圆盘仅展示 摄入 + 碳/蛋/脂；训练消耗在圆盘下方胶囊与“训练快照”卡片展示
- 负重/自重训练的热量按组数+次数估算（非计时器实际时长）；日志记录实际时长
- 完整测试记录见 [BUG_LOG.md](./BUG_LOG.md)
