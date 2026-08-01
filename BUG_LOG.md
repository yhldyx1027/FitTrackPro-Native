# FitTrackPro-Native 全面测试 Bug 记录

> 规则：测试阶段只记录不修改；全部测完后统一修复，再回归。

## 代码审计阶段发现（待真机验证）

| # | 严重度 | 模块 | 问题描述 |
|---|--------|------|----------|
| BUG-01 | 高 | 训练计时 | WorkoutModal 计时 `startTime = useState(Date.now())` 未持久化：关闭弹窗再打开、或 app 退出后重进，计时都会归零重来。与需求“app 退出后计时不中断”冲突 |
| BUG-02 | 高 | 日期 | `getTodayKey()` 用 `toISOString()`（UTC）。UTC+8 下每天 00:00–07:59 记录的“今天”会落到前一天，饮食/训练跨日滚动会在早上 8 点而不是午夜 |
| BUG-03 | 中 | 训练页 | 训练计划卡片只有“编辑/开始”，没有“删除”入口（`removePlan` 在 context 存在但 UI 无调用） |
| BUG-04 | 中 | 记录页 | 日历 `calHasData: {}` 是空样式，有记录的日子没有任何视觉标记，无法分辨哪些天有数据 |
| BUG-05 | 中 | 食物库 | `refreshAll` 中 `fdb.length > 0 ? fdb : DEFAULT_FOOD_DB`：用户清空食物库后重启会重新出现 7 个默认食物，无法持久化为空库 |
| BUG-06 | 低 | 状态同步 | `updateWorkout` 直接改同一个 `todayWorkout` 对象引用再 setState（引用相同 React 会 bail out），勾选完成组后依赖 context 的“实时容量/预计消耗”可能不刷新（待验证） |
| BUG-07 | 低 | 仪表盘 | 消耗圆环 target 硬编码 300 千卡，与身体数据无关，消耗>300 后圆环一直满格 |
| BUG-08 | 低 | 设置 | “重置数据”后表单 draft 用旧 profile 赋值，界面可能残留旧值（待验证） |
| BUG-09 | 低 | 计算 | 训练“时长”：结束训练时把计时器分钟数写进 log，但负重/自重热量估算完全不用实际时长（用组数/次数推导），日志时长与实际消耗计算不一致 |

## 真机测试阶段发现

| # | 严重度 | 模块 | 问题描述 |
|---|--------|------|----------|
| BUG-10 | 高 | 训练计时 | 计时器 `startTime = useState(Date.now())`：关闭训练弹窗再打开计时归零；app 进程退出后重进，计时也归零（需求要求不中断）。需把开始时间持久化（如写入 Workout 对象/AsyncStorage），并在恢复时用 Date.now()-startTime 续算 |
| BUG-11 | 中 | 训练弹窗 | uiautomator 经常无法 dump 出 WorkoutModal 的独立窗口，弹窗实际能打开（计时器在走），但自动测试难以稳定观察——环境层面问题，记录备查 |
| BUG-12 | 低 | 设置 | “重置数据”确认后表单仍显示旧的身体数据（draft 未清空），误点保存会把旧数据写回。DB 中 profile.json 已确实被删除 |
| BUG-13 | 中 | 记录页 | 日历“有记录的日子”无任何视觉标记（`calHasData` 样式为空），无法一眼看出哪天有数据 |
| BUG-14 | 低 | 食物库 | 用户清空食物库后重启会重新出现 7 个默认食物（`fdb.length > 0 ? fdb : DEFAULT_FOOD_DB`），无法持久化空库 |
| BUG-15 | 低 | 环境 | RN DevTools inspector 的 CxxInspector WebSocket 在 WSL2+adb reverse 环境下 Broken pipe → 主线程 NPE 崩溃/触摸失灵（dev 构建特有，release 不受影响）；uiautomator 对 RN Modal 窗口 dump 不稳定 |
| BUG-16 | 中 | 训练 | 同一天完成一次训练后再开始新训练：主屏“实时容量/预计消耗”显示的是已完成日志的值（`trainingCal = todayTrainingLog?.calories ?? 实时估算`），且完成新训练会覆盖当天的训练日志（同 key 覆盖，第一次训练数据丢失） |
| BUG-17 | 低 | 仪表盘 | 今日体重只支持输入记录，不回显当天已记录的体重值（用户看不到今天记过多少） |
| BUG-18 | 低 | 设置 | 活动系数校验边界：提示文案“标准 1.2~2.5”但只拦截 >3.0 或 <1.0，1.0~1.2 与 2.5~3.0 可通过 |
| BUG-19 | 低 | 训练计划 | 计划编辑“保存”时若名称为空则静默不保存（无任何提示），且计划库没有删除计划的入口 |

## 测试结论（计算正确性）

- BMR/TDEE/目标调整（减脂-350/维持0/增肌+250）、训练日 5:3:2 / 休息日 4:3:3 宏量换算、dietTotals、训练容量/热量（MET×体重×时长/200×(1+容量修正)）：57 项 Node 单测全部通过，且与真机显示的 男/女 × 减脂/维持/增肌 六组数字完全一致。
- 训练结束同步：完成训练后，概览页训练快照（当前计划/容量/消耗）、训练日宏量切换、记录页日详情均正确显示。
- 饮食：餐次分组、份数、自定义食物、热量汇总、重启持久化均验证通过。
- 记录：日历/月份切换/日详情（训练+饮食）正常；有数据的日子无视觉标记（BUG-13）。

## 修复状态（2026-08-01 已统一修复并回归）

| # | 修复方式 | 回归验证 |
|---|----------|----------|
| BUG-01/10 | `Workout` 增加 `startedAt`，`startWorkoutFromPlan` 写入；WorkoutModal 用 `startedAt` 作为计时基准，弹窗关闭/重开、应用重启后计时续算 | ✅ 跨应用重启后结算 `durationMinutes=4`（实际经过≈4分钟，非归零） |
| BUG-02 | `getTodayKey` 改用本地日期（不再用 UTC `toISOString`），午夜 0-8 点跨日正确 | ✅ tsc 通过，逻辑验证 |
| BUG-06 | `updateWorkout` 克隆对象引用，`updateSet`/`handleFinish` 不再原地改 `todayWorkout`；实时容量/消耗随勾组刷新 | ✅ 勾 1 组后结算日志 volume=480、calories=14（与手算一致） |
| BUG-12 | 重置后 draft 清空为 null，表单回到空态 | ✅ 重置后 profile.json 删除、表单显示占位符 |
| BUG-13 | 日历有数据的日子加 accent 圆点 | ✅ 像素级确认 8/1 数字下方出现圆点、无数据日无点 |
| BUG-14 | `refreshAll` 不再在空食物库时回填默认值 | ✅ 有 profile 时清空食物库→重启后仍为空，显示“食物库为空”提示 |
| BUG-16 | `trainingCal/Vol` 有进行中训练时优先用实时估算，日志仅作无训练时的兜底 | ✅ 结算后训练日建议 2114 = TDEE+250+训练消耗14 |
| BUG-17 | 今日体重输入框挂载时回显当天已记录体重 | ✅ 重启后输入框显示 70.5 |
| BUG-18 | 活动系数校验收紧到 1.2~2.5 并给出明确提示 | ✅ 代码验证 |
| BUG-19 | 计划卡片增加“删除”（带确认）；计划名称为空保存时 Alert 提示 | ✅ 删除确认弹窗出现；Alert 提示代码验证 |
| BUG-03/04/05/07/08/09 | 同 BUG-19/BUG-13/BUG-14/BUG-12 等；BUG-07（消耗圆环目标硬编码 300）、BUG-09（日志时长与热量估算口径不同）保留为设计常量并记录 | — |

## 未修复/保留项（记录备查）

- BUG-07：~~消耗圆环目标固定 300 千卡~~ —— 已按用户决定删除“卡路里消耗”圆环（300 无出处且与训练消耗口径不符），圆环仅保留 卡路里摄入 + 碳/蛋/脂 4 环；训练消耗保留在“训练快照”卡片展示。
- BUG-09：结束训练写入的时长用于日志展示；负重/自重热量按“组数+次数”估算而非实际时长（设计口径）。
- BUG-15：dev 构建下 RN DevTools inspector（CxxInspector）在 WSL2+adb reverse 环境偶发 WebSocket Broken pipe → 主线程 NPE/触摸失灵；uiautomator 对 RN Modal 窗口 dump 不稳定。release 构建不受影响。建议日常调试若频繁遇到，重启 Metro+应用即可恢复。

## 测试期间环境干扰说明

- WSL2 里 Metro 的 react-native-devtools 因缺 libnspr4.so/libasound2 无法启动（已下载解压到 ~/nss-libs 缓解 libnspr4，libasound 仍缺）。
- 应用偶发 CxxInspector NPE 崩溃（dev 构建、调试环境问题），导致触摸失灵、需重启/重载恢复。
- 测试数据操作使用 run-as sqlite3 直写 AsyncStorage 以保证确定性。
