// ============================================================
// FitTrack Pro - App Entry Point
// ============================================================

import React from 'react';
import {
  StatusBar, ActivityIndicator, View, Text, StyleSheet, Platform,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider, useApp } from './src/hooks/useAppState';
import { Colors, Shadow } from './src/theme';

import DashboardScreen from './src/screens/DashboardScreen';
import TrainingScreen from './src/screens/TrainingScreen';
import DietScreen from './src/screens/DietScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AiChatScreen from './src/screens/AiChatScreen';
import SwipeBackView from './src/components/SwipeBackView';

const TOP_OFFSET = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 44) + 8 : 0;
const Tab = createBottomTabNavigator();

const stackBase = {
  gestureEnabled: true as const,
  fullScreenGestureEnabled: true as const,
  animation: 'slide_from_right' as const,
  headerStyle: { backgroundColor: Colors.background },
  headerTintColor: Colors.textPrimary,
  headerTitleStyle: { fontSize: 16, fontWeight: '600' as const },
  headerShadowVisible: false,
};

// Sub-pages on Android only support the system edge back gesture (narrow bezel
// zone). Wrap pushed pages with an in-app right-swipe detector so swiping from
// further inside the screen also goes back.
const withSwipeBack = (Comp: React.ComponentType<any>) => (props: any) => (
  <SwipeBackView onSwipeBack={() => props.navigation?.goBack()}>
    <Comp {...props} />
  </SwipeBackView>
);
const SwipeDiet = withSwipeBack(DietScreen);
const SwipeTraining = withSwipeBack(TrainingScreen);
const SwipeHistory = withSwipeBack(HistoryScreen);
const SwipeSettings = withSwipeBack(SettingsScreen);
const SwipeDashboard = withSwipeBack(DashboardScreen);
const SwipeAiChat = withSwipeBack(AiChatScreen);

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <Text style={[styles.tabIconText, focused && styles.tabIconTextActive]}>{label}</Text>
    </View>
  );
}

// Headerless main screens get status bar padding via contentStyle (see options below)
const mainScreenOptions = {
  headerShown: false as const,
  contentStyle: { paddingTop: TOP_OFFSET, backgroundColor: Colors.background },
};

function DashboardStack() {
  const S = createNativeStackNavigator();
  return (
    <S.Navigator screenOptions={stackBase}>
      <S.Screen name="DashboardMain" component={DashboardScreen} options={mainScreenOptions} />
      <S.Screen name="DietPage" component={SwipeDiet} options={{ title: '饮食管理', headerBackTitle: '返回' }} />
      <S.Screen name="TrainingPage" component={SwipeTraining} options={{ title: '训练', headerBackTitle: '返回' }} />
      <S.Screen name="HistoryPage" component={SwipeHistory} options={{ title: '历史记录', headerBackTitle: '返回' }} />
      <S.Screen name="SettingsPage" component={SwipeSettings} options={{ title: '设置', headerBackTitle: '返回' }} />
      <S.Screen name="AiChatPage" component={SwipeAiChat} options={{ title: 'AI 饮食助手', headerBackTitle: '返回' }} />
    </S.Navigator>
  );
}

function TrainingStack() {
  const S = createNativeStackNavigator();
  return (
    <S.Navigator screenOptions={stackBase}>
      <S.Screen name="TrainingMain" component={TrainingScreen} options={mainScreenOptions} />
      <S.Screen name="DietPage" component={SwipeDiet} options={{ title: '饮食管理', headerBackTitle: '返回' }} />
      <S.Screen name="DashboardPage" component={SwipeDashboard} options={{ title: '概览', headerBackTitle: '返回' }} />
      <S.Screen name="HistoryPage" component={SwipeHistory} options={{ title: '历史记录', headerBackTitle: '返回' }} />
      <S.Screen name="SettingsPage" component={SwipeSettings} options={{ title: '设置', headerBackTitle: '返回' }} />
      <S.Screen name="AiChatPage" component={SwipeAiChat} options={{ title: 'AI 饮食助手', headerBackTitle: '返回' }} />
    </S.Navigator>
  );
}

function DietStack() {
  const S = createNativeStackNavigator();
  return (
    <S.Navigator screenOptions={stackBase}>
      <S.Screen name="DietMain" component={DietScreen} options={mainScreenOptions} />
      <S.Screen name="TrainingPage" component={SwipeTraining} options={{ title: '训练', headerBackTitle: '返回' }} />
      <S.Screen name="DashboardPage" component={SwipeDashboard} options={{ title: '概览', headerBackTitle: '返回' }} />
      <S.Screen name="HistoryPage" component={SwipeHistory} options={{ title: '历史记录', headerBackTitle: '返回' }} />
      <S.Screen name="SettingsPage" component={SwipeSettings} options={{ title: '设置', headerBackTitle: '返回' }} />
      <S.Screen name="AiChatPage" component={SwipeAiChat} options={{ title: 'AI 饮食助手', headerBackTitle: '返回' }} />
    </S.Navigator>
  );
}

function HistoryStack() {
  const S = createNativeStackNavigator();
  return (
    <S.Navigator screenOptions={stackBase}>
      <S.Screen name="HistoryMain" component={HistoryScreen} options={mainScreenOptions} />
      <S.Screen name="DietPage" component={SwipeDiet} options={{ title: '饮食管理', headerBackTitle: '返回' }} />
      <S.Screen name="TrainingPage" component={SwipeTraining} options={{ title: '训练', headerBackTitle: '返回' }} />
      <S.Screen name="DashboardPage" component={SwipeDashboard} options={{ title: '概览', headerBackTitle: '返回' }} />
      <S.Screen name="SettingsPage" component={SwipeSettings} options={{ title: '设置', headerBackTitle: '返回' }} />
      <S.Screen name="AiChatPage" component={SwipeAiChat} options={{ title: 'AI 饮食助手', headerBackTitle: '返回' }} />
    </S.Navigator>
  );
}

function SettingsStack() {
  const S = createNativeStackNavigator();
  return (
    <S.Navigator screenOptions={stackBase}>
      <S.Screen name="SettingsMain" component={SettingsScreen} options={mainScreenOptions} />
      <S.Screen name="DietPage" component={SwipeDiet} options={{ title: '饮食管理', headerBackTitle: '返回' }} />
      <S.Screen name="TrainingPage" component={SwipeTraining} options={{ title: '训练', headerBackTitle: '返回' }} />
      <S.Screen name="DashboardPage" component={SwipeDashboard} options={{ title: '概览', headerBackTitle: '返回' }} />
      <S.Screen name="HistoryPage" component={SwipeHistory} options={{ title: '历史记录', headerBackTitle: '返回' }} />
      <S.Screen name="AiChatPage" component={SwipeAiChat} options={{ title: 'AI 饮食助手', headerBackTitle: '返回' }} />
    </S.Navigator>
  );
}

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: { backgroundColor: Colors.surface, borderTopColor: Colors.borderLight, borderTopWidth: 1, height: 64, paddingBottom: 10, paddingTop: 8, ...Shadow.card },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
      }}
    >
      {([
        ['Dashboard', DashboardStack, '概览', '览'],
        ['Training', TrainingStack, '训练', '训'],
        ['Diet', DietStack, '饮食', '食'],
        ['History', HistoryStack, '记录', '记'],
        ['Settings', SettingsStack, '设置', '设'],
      ] as const).map(([name, Comp, label, icon]) => (
        <Tab.Screen
          key={name}
          name={name}
          component={Comp}
          options={({ route }: any) => {
            const focused = getFocusedRouteNameFromRoute(route) ?? '';
            // Full-screen the AI chat page so the input bar sits flush with the keyboard.
            const hideTab = focused === 'AiChatPage';
            return {
              tabBarLabel: label,
              tabBarIcon: ({ focused: f }: any) => <TabIcon label={icon} focused={f} />,
              tabBarStyle: hideTab
                ? { display: 'none' }
                : { backgroundColor: Colors.surface, borderTopColor: Colors.borderLight, borderTopWidth: 1, height: 64, paddingBottom: 10, paddingTop: 8, ...Shadow.card },
            };
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <View style={styles.loadingCard}>
        <ActivityIndicator size="small" color={Colors.accent} />
        <Text style={styles.loadingTitle}>正在整理你的训练台</Text>
        <Text style={styles.loadingSub}>本地档案、饮食记录与训练计划正在载入</Text>
      </View>
    </View>
  );
}

function MainApp() {
  const app = useApp();
  if (!app.ready) return <LoadingScreen />;
  return <TabNavigator />;
}

const RootStack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} />
        <NavigationContainer>
          <RootStack.Navigator screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="Home" component={MainApp} />
          </RootStack.Navigator>
        </NavigationContainer>
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  loadingCard: { alignItems: 'center', gap: 16, padding: 40, backgroundColor: Colors.surface, borderRadius: 28, ...Shadow.elevated, borderWidth: 1, borderColor: Colors.borderLight },
  loadingTitle: { fontSize: 17, fontWeight: '600', color: Colors.textPrimary, letterSpacing: -0.2 },
  loadingSub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', maxWidth: 240, lineHeight: 20 },
  tabIcon: { width: 34, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabIconActive: { backgroundColor: Colors.accentLight },
  tabIconText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabIconTextActive: { color: Colors.accent },
});
