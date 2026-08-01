# FitTrackPro-Native 手机调试指南

## 项目信息

- **路径**: `/home/harin/FitTrackPro-Native`
- **框架**: Expo SDK 57 + React Native 0.86 + TypeScript
- **包名**: `com.x1612416260.FitTrackProNative`
- **Metro 端口**: 8081
- **adb 端口**: 5038（Windows adb server 端口，非默认 5037）

## 架构

```
手机(USB) ←→ Windows(adb server :5038) ←→ WSL2(Metro :8081 + adb client)
```

- Windows adb: `/mnt/c/platform-tools/platform-tools/adb.exe`
- WSL adb: `~/android-sdk/platform-tools/adb`
- 手机通过 WSL2 localhost 转发连接 Windows adb server

---

## 启动步骤

### 1. 启动 Windows adb server
```bash
# 如果已运行则跳过。端口 5038 避免和 WSL2 localhost 5037 冲突
/mnt/c/platform-tools/platform-tools/adb.exe -a -P 5038 nodaemon server &
```

### 2. 连手机 + 验证
```bash
# 快捷别名（建议加入 ~/.bashrc）
alias adb="adb -H 127.0.0.1 -P 5038"

# 验证设备（需显示 device 状态，如 unauthorized 则手机上点允许）
adb devices
```

### 3. 启动 Metro
```bash
cd /home/harin/FitTrackPro-Native
npx expo start --dev-client --port 8081 --clear
```

### 4. 设置端口转发 + 写入 prefs + 启动应用
```bash
adb reverse tcp:8081 tcp:8081

adb shell "run-as com.x1612416260.FitTrackProNative tee \
  /data/data/com.x1612416260.FitTrackProNative/shared_prefs/expo.modules.devlauncher.recentyopenedapps.xml << 'EOF'
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name=\"http://localhost:8081\">{\"timestamp\":$(date +%s)000,\"name\":\"FitTrackPro-Native\",\"url\":\"http://localhost:8081\",\"isEASUpdate\":false}</string>
</map>
EOF
"

adb shell am force-stop com.x1612416260.FitTrackProNative
sleep 1
adb shell monkey -p com.x1612416260.FitTrackProNative 1
```

应用会自动加载 Metro bundle 并运行。

---

## 常用命令

```bash
# 查看设备
adb devices

# 查看应用进程
adb shell ps -A | grep fittrack

# 查看当前 Activity
adb shell dumpsys activity activities | grep mFocusedApp

# 强制重载（发送 React Native reload）
adb shell input keyevent 82   # 打开 dev menu
adb shell input keyevent 46   # 按 R 重载

# 截图
adb shell screencap -p /sdcard/screen.png
adb pull /sdcard/screen.png /tmp/screen.png

# 查看 Metro 日志
tail -20 /home/harin/FitTrackPro-Native/.expo/dev/logs/start.log | python3 -c "
import json, sys, re
for line in sys.stdin:
    try:
        d = json.loads(line.strip())
        if d.get('level') == 'error':
            for item in d.get('data', []):
                print(re.sub(r'\x1b\[[0-9;]*m', '', str(item)))
    except: pass
"

# 读取手机存储的 profile 数据
adb shell run-as com.x1612416260.FitTrackProNative sqlite3 \
  /data/data/com.x1612416260.FitTrackProNative/databases/AsyncStorage \
  "SELECT * FROM Storage WHERE key = 'fittrack-pro:profile.json'"

# 构建 APK（需要本地 gradle 缓存）
cd /home/harin/FitTrackPro-Native/android
./gradlew assembleDebug --offline

# 安装 APK
adb install -r /home/harin/FitTrackPro-Native/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 已知问题 & 待修复

### 1. App.tsx 中 `{() => <Padded>...}` render function 写法导致应用崩溃

**当前状态**: 已修复并真机验证（2026-08-01）

**问题**: 第 49 行 `{() => <Padded><DashboardScreen /></Padded>}` 这种 render children 写法不会传 `navigation` prop，点快捷入口报 `Cannot read property 'navigate' of undefined`（DashboardScreen.tsx:148）。

**解决思路**: 将 Padded 逻辑改为：
- 方案 A: 在 `screenOptions` 中用 `contentStyle: { paddingTop: TOP_OFFSET }`（**已采用**，主页面全部改为 `component={XxxScreen}`，删掉 Padded 包装）
- 方案 B: 在每个 screen 组件内部自己处理 safe area
- 方案 C: 用 HOC 包装每个 screen（但之前的 `withScreenWrapper` 也没生效）

### 2. 顶部与状态栏重叠

每个页面（Dashboard/Diet/Training/History/Settings）的 ScrollView 顶部在 vivo X100 上被状态栏和下拉菜单遮挡。

**修复方式**: 需要每个页面最外层 View 有 `paddingTop: StatusBar.currentHeight + 8`（约 52dp）。无论是通过 App.tsx 统一处理还是各页面单独加都可以。

**状态**: 已修复并真机验证（contentStyle padding，ScrollView 从 y=154 起，状态栏 126px）。**注意**：训练/饮食页的 `Modal`（新建计划、食物库管理等）在独立窗口渲染，不吃 contentStyle padding，其自绘 header（← 返回箭头）会被状态栏盖住且点不到——已给 4 个 Modal 的 modalHeader 加 `paddingTop: StatusBar.currentHeight`（箭头实测 y=168+），并补上 Android 必需的 `onRequestClose`（此前返回键关不掉 Modal）。

### 3. 子页面跳转后无返回按钮 + 侧滑返回不工作

**已完成**:
- `android:enableOnBackInvokedCallback="true"`（已改 manifest 并重建 APK）
- Stack Navigator 已配置 `gestureEnabled: true, fullScreenGestureEnabled: true`
- 子页面已配置 `headerBackTitle: '返回'`

**状态**: 返回箭头、系统返回键、边缘侧滑均已真机验证可用。

**重要发现（侧滑 gap）**: Android native-stack 没有应用内边缘手势，侧滑只走系统预测性返回手势，仅当手指落在屏幕最边缘约 30dp（本机约 x<100px）才生效；从屏幕内侧起手（x>120px）无任何响应。已新增 `src/components/SwipeBackView.tsx`（纯 JS PanResponder），子页面左半屏右滑即返回（实测 x=200/250 起手有效），竖向滚动不受影响。若需要拖动跟手动画，则要引入 react-native-gesture-handler / JS Stack 并重建 APK。

### 4. DashboardScreen 快捷入口使用了 Navigation Stack push

快捷入口 tab 值已改为 `'SettingsPage'`, `'TrainingPage'`, `'DietPage'`, `'HistoryPage'`（对应 Stack 中注册的子页面名称），而非原来的 tab 名称。

**状态**: 已真机验证（点“开始今日训练”正确 push TrainingPage）。

---

## 文件结构速览

```
FitTrackPro-Native/
├── App.tsx                 # 入口，导航结构（5 Tab + Stack）
├── index.ts                # registerRootComponent
├── app.json                # Expo 配置
├── src/
│   ├── screens/
│   │   ├── DashboardScreen.tsx   # 概览页（环形图、快捷入口）
│   │   ├── TrainingScreen.tsx     # 训练页
│   │   ├── DietScreen.tsx        # 饮食页
│   │   ├── HistoryScreen.tsx     # 历史记录页
│   │   └── SettingsScreen.tsx    # 设置页（身体数据、活动系数）
│   ├── components/
│   ├── hooks/
│   │   └── useAppState.ts
│   ├── storage/
│   │   └── storage.ts
│   ├── theme/
│   │   └── index.ts
│   ├── types/
│   │   └── index.ts
│   └── utils/
│       └── calculations.ts       # BMR/TDEE/训练热量等计算公式
├── android/                       # Android 原生代码
└── DEV_SESSION_LOG.md             # 之前的调试记录
```

## 计算公式注意事项

- BMR: Harris-Benedict 公式
- 活动系数范围: 1.2 ~ 2.5（用户容易误填成 12 而非 1.2，已在 SettingsScreen 加校验）
- 热量目标调整: cutting -350, maintenance 0, bulking +250
- react-native-svg 的 `<Svg>` 内不支持 `<Fragment>`，必须用 `<G>` 标签分组
