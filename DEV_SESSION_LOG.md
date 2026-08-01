# FitTrackPro-Native 调试会话记录

> 日期: 2026-07-13 ~ 2026-07-28  
> 设备: vivo V2309A (Android 16)  
> 开发环境: WSL2 Ubuntu 26.04 → Windows → USB 连接手机

---

## 1. 调试环境搭建

### 架构
```
手机 (USB) ←→ Windows (adb server :5038) ←→ WSL2 (adb client + Metro :8081)
```

### 关键步骤
1. **Windows 端安装 adb**: 下载 platform-tools 到 `C:\platform-tools\`
2. **adb 端口冲突解决**: WSL2 localhost 转发占用 5037，改用 **5038** 端口启动 Windows adb daemon
3. **WSL 连接 Windows adb**: `adb -H 127.0.0.1 -P 5038 devices`
4. **端口转发**: `adb reverse tcp:8081 tcp:8081` — 手机 localhost:8081 → Windows:8081 → WSL2:8081 (Metro)

### 常用命令
```bash
# 启动 Windows adb (通过 WSL)
/mnt/c/platform-tools/platform-tools/adb.exe -a -P 5038 nodaemon server &

# WSL 中连接设备
adb -H 127.0.0.1 -P 5038 devices

# 设置端口转发
adb -H 127.0.0.1 -P 5038 reverse tcp:8081 tcp:8081

# 启动 Metro
cd /home/harin/FitTrackPro-Native && npx expo start --dev-client --port 8081 --clear
```

---

## 2. 代码修复

### 2.1 Fragment 错误 → G 标签替换

**问题**: react-native-svg 的 `<Svg>` 组件内部不支持 React 的 `<Fragment>`/`<React.Fragment>`，只接受 SVG 原生元素。

**错误信息**:
```
ReferenceError: Fragment is not defined
Code: DashboardScreen.tsx (line 82)
```

**修复** (`src/screens/DashboardScreen.tsx`):
```diff
- import React, { useState, useCallback, Fragment } from 'react';
- import Svg, { Circle } from 'react-native-svg';
+ import React, { useState, useCallback } from 'react';
+ import Svg, { Circle, G } from 'react-native-svg';

- <React.Fragment key={c.key}>
+ <G key={c.key}>
    <Circle ... />
    <Circle ... />
- </React.Fragment>
+ </G>
```

### 2.2 环形图排版修复

**问题**: 最大环半径 `r=168` + 半描边宽 `sw/2=11` = 179，超出旧 SVG 尺寸 `RING_SIZE=340` 的中心范围。

**修复**:
```diff
- const { width: SCREEN_W } = Dimensions.get('window');
- const RING_SIZE = Math.min(SCREEN_W - 64, 340);
+ const RING_OUTER_R = 168;
+ const RING_OUTER_SW = 22;
+ const RING_HALF_SW = RING_OUTER_SW / 2;
+ const RING_SIZE = (RING_OUTER_R + RING_HALF_SW) * 2 + 4;  // ~366
```

同时添加 `ringsSvgWrapper` 使百分比文字精确居中于环形图。

### 2.3 全面屏滑动返回手势

**问题**: `app.json` 中 `predictiveBackGestureEnabled: false` 禁用了 Android 预测性返回手势。

**修复** (`app.json`):
```diff
- "predictiveBackGestureEnabled": false,
+ "predictiveBackGestureEnabled": true,
+ "edgeToEdgeEnabled": true,
```

### 2.4 状态栏重叠修复

**问题**: 全面屏顶部内容与状态栏重叠，顶部按钮无法点击。

**修复** (`App.tsx`):
```diff
- import { SafeAreaProvider } from 'react-native-safe-area-context';
+ import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

- <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
+ <StatusBar barStyle="dark-content" backgroundColor="transparent"
+   translucent={Platform.OS === 'android'} />
+ <SafeAreaView style={styles.safeArea} edges={['top']}>
    <NavigationContainer>
      <MainApp />
    </NavigationContainer>
+ </SafeAreaView>
```

---

## 3. 构建与部署

### APK 构建
```bash
cd /home/harin/FitTrackPro-Native/android
./gradlew assembleDebug --offline
```

### 安装到手机
```bash
adb -H 127.0.0.1 -P 5038 install -r \
  /home/harin/FitTrackPro-Native/android/app/build/outputs/apk/debug/app-debug.apk
```

### DevLauncher 自动加载
通过 `run-as` 写入 SharedPreferences 让 Expo Dev Client 自动连接 Metro:
```bash
adb -H 127.0.0.1 -P 5038 shell \
  "run-as com.x1612416260.FitTrackProNative tee \
  /data/data/com.x1612416260.FitTrackProNative/shared_prefs/expo.modules.devlauncher.recentyopenedapps.xml"
```

---

## 4. 常见问题排查

| 问题 | 排查步骤 |
|------|----------|
| adb 连不上 | `adb.exe kill-server` → 确认端口未被占用 → 重试 |
| 设备 unauthorized | 手机上点"允许 USB 调试" |
| Metro 缓存旧代码 | 用 `--clear` 重启 Metro |
| Compose UI 无法 adb 输入 | 用 `run-as` 直接写 SharedPreferences |
| 手机无法访问 WSL IP | 手机和 WSL 虽同网段但 WSL2 NAT 隔离，需用 adb reverse |

---

## 5. 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `app.json` | `predictiveBackGestureEnabled: true`, `edgeToEdgeEnabled: true` |
| `App.tsx` | SafeAreaView + StatusBar translucent |
| `src/screens/DashboardScreen.tsx` | G 标签替换 Fragment, RING_SIZE 修正, ringsSvgWrapper 布局 |
| `android/gradle/wrapper/gradle-wrapper.properties` | 指向本地 gradle 缓存 |
