import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer, TabActions } from '@react-navigation/native';
import { createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, TouchableOpacity, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../contexts/AuthContext';
import { Colors, FontSize } from '../constants/theme';
import { LoadingView } from '../components/LoadingView';
import { NotificationBellButton } from '../components/NotificationBellButton';

// Auth Screens
import { LoginScreen } from '../screens/auth/LoginScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { UpdatePasswordScreen } from '../screens/auth/UpdatePasswordScreen';
import { PrivacyPolicyScreen } from '../screens/auth/PrivacyPolicyScreen';

// Main Screens
import { TripsListScreen } from '../screens/trips/TripsListScreen';
import { CreateTripScreen } from '../screens/trips/CreateTripScreen';
import { TripDashboardScreen } from '../screens/trips/TripDashboardScreen';
import { TripSettingsScreen } from '../screens/trips/TripSettingsScreen';
import { ProfileScreen } from '../screens/other/ProfileScreen';

// Family Screens
import { FamiliesScreen } from '../screens/families/FamiliesScreen';
import { JoinFamilyScreen } from '../screens/families/JoinFamilyScreen';
import { AddEditFamilyScreen } from '../screens/families/AddEditFamilyScreen';
import { FamilyDetailScreen } from '../screens/families/FamilyDetailScreen';

// Expense Screens
import { ExpensesListScreen } from '../screens/expenses/ExpensesListScreen';
import { AddEditExpenseScreen } from '../screens/expenses/AddEditExpenseScreen';
import { BalancesScreen } from '../screens/expenses/BalancesScreen';
import { SettlementScreen } from '../screens/expenses/SettlementScreen';
import { PaymentTrackingScreen } from '../screens/expenses/PaymentTrackingScreen';
import { ExpenseHistoryScreen } from '../screens/expenses/ExpenseHistoryScreen';
import { ReceiptScannerScreen } from '../screens/expenses/ReceiptScannerScreen';

// Chat
import { TripChatScreen } from '../screens/chat/TripChatScreen';

// Media
import { TripAlbumScreen } from '../screens/media/TripAlbumScreen';
import { MediaDetailScreen } from '../screens/media/MediaDetailScreen';

// Itinerary
import { ItineraryScreen } from '../screens/itinerary/ItineraryScreen';
import { AddEditItineraryItemScreen } from '../screens/itinerary/AddEditItineraryItemScreen';
import { DailyPlanScreen } from '../screens/itinerary/DailyPlanScreen';

// Lists
import { GroceryListScreen } from '../screens/lists/GroceryListScreen';
import { PackingListScreen } from '../screens/lists/PackingListScreen';

// Cars
import { CarPlanningScreen } from '../screens/cars/CarPlanningScreen';
import { AddEditCarScreen } from '../screens/cars/AddEditCarScreen';

// Polls
import { PollsScreen } from '../screens/polls/PollsScreen';
import { CreatePollScreen } from '../screens/polls/CreatePollScreen';
import { PollDetailScreen } from '../screens/polls/PollDetailScreen';

// Other
import { EmergencyInfoScreen } from '../screens/other/EmergencyInfoScreen';
import { FairnessDashboardScreen } from '../screens/other/FairnessDashboardScreen';
import { AnnouncementsScreen } from '../screens/other/AnnouncementsScreen';
import { NotificationCenterScreen } from '../screens/other/NotificationCenterScreen';
import { MoreScreen } from '../screens/trips/MoreScreen';
import { LiveLocationScreen } from '../screens/location/LiveLocationScreen';
import { CommunitySpotsScreen } from '../screens/community/CommunitySpotsScreen';
import { CreateCommunitySpotScreen } from '../screens/community/CreateCommunitySpotScreen';
import { CommunitySpotReviewScreen } from '../screens/community/CommunitySpotReviewScreen';
import { GlobalAdminScreen } from '../screens/admin/GlobalAdminScreen';

import {
  RootStackParamList,
  AuthStackParamList,
  MainStackParamList,
  TabParamList,
  TripTabParamList,
} from '../types';
import { useNotifications } from '../contexts/NotificationsContext';
import { useTripContext } from '../contexts/TripContext';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const TripTab = createBottomTabNavigator<TripTabParamList>();

function AuthNavigator() {
  const { isPasswordRecovery } = useAuth();
  return (
    <AuthStack.Navigator
      key={isPasswordRecovery ? 'password-recovery' : 'auth'}
      screenOptions={{ headerShown: false }}
      initialRouteName={isPasswordRecovery ? 'UpdatePassword' : 'Login'}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStack.Screen name="UpdatePassword" component={UpdatePasswordScreen} />
      <AuthStack.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{
          headerShown: true,
          title: 'Privacy Policy',
          headerTintColor: Colors.primary,
          headerStyle: { backgroundColor: Colors.surface },
          headerTitleStyle: { color: Colors.text, fontWeight: '700' },
        }}
      />
    </AuthStack.Navigator>
  );
}

function TabIcon({ emoji, focused, badge }: { emoji: string; focused: boolean; badge?: number }) {
  return (
    <View style={{ opacity: focused ? 1 : 0.55 }}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
      {badge && badge > 0 ? (
        <View style={{
          position: 'absolute', top: -4, right: -8,
          backgroundColor: Colors.danger, borderRadius: 999,
          minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 3,
        }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function MainTabs() {
  const { unreadCount } = useNotifications();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: { borderTopColor: Colors.border },
        tabBarLabelStyle: { fontSize: FontSize.xs },
      }}
    >
      <Tab.Screen
        name="TripsTab"
        component={TripsListScreen}
        options={{
          tabBarLabel: 'Trips',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏖️" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} badge={unreadCount} />,
        }}
      />
    </Tab.Navigator>
  );
}

function TripTabs({ route, navigation }: { route: { params: { tripId: string; initialTab?: string } }; navigation: any }) {
  const { tripId, initialTab } = route.params;
  const {
    currentTrip,
    loadTripData,
    canViewExpenses,
    isFeatureEnabled,
  } = useTripContext();
  const [bootstrapping, setBootstrapping] = useState(currentTrip?.id !== tripId);

  useEffect(() => {
    let cancelled = false;

    async function loadTripContext() {
      // If the trip context already matches (e.g. it was just loaded by
      // openTrip before navigating here), there's nothing to fetch.
      if (currentTrip?.id === tripId) {
        setBootstrapping(false);
        return;
      }
      setBootstrapping(true);
      await loadTripData(tripId);
      if (cancelled) return;
      setBootstrapping(false);
    }

    loadTripContext();

    return () => {
      cancelled = true;
    };
  }, [tripId, currentTrip, loadTripData]);

  // Navigate to the requested tab after bootstrapping (set by notification tap).
  // We do this here rather than in handleNotificationNavigation because specifying
  // a nested tab screen before TripTab.Navigator mounts causes a native crash.
  // By the time this effect fires with bootstrapping=false, TripTab.Navigator
  // is mounted and the full nested path is safe to use.
  useEffect(() => {
    if (!bootstrapping && initialTab) {
      navigation.setParams({ initialTab: undefined });
      try {
        // TripTab.Navigator is now mounted (bootstrapping=false).
        // Full nested path is safe here and correctly switches the active tab.
        (navigationRef as any).navigate('Main', {
          screen: 'TripStack',
          params: { tripId, screen: initialTab, params: { tripId } },
        });
      } catch { /* tab not available (feature disabled) — stay on Dashboard */ }
    }
  }, [bootstrapping, initialTab]);

  if (bootstrapping) return <LoadingView />;

  return (
    <TripTab.Navigator
      key={tripId}
      initialRouteName={(initialTab as keyof TripTabParamList | undefined) ?? 'Dashboard'}
      screenOptions={({ navigation, route }) => ({
        headerShown: true,
        headerTintColor: Colors.primary,
        headerTitleStyle: { fontWeight: '700', color: Colors.text },
        headerStyle: { backgroundColor: Colors.surface },
        headerShadowVisible: false,
        headerLeft: route.name === 'Dashboard'
          ? undefined
          : () => (
              <TouchableOpacity
                onPress={() => navigation.navigate('Dashboard', { tripId })}
                accessibilityRole="button"
                accessibilityLabel="Back to trip home"
                style={{ paddingVertical: 8, paddingRight: 12 }}
              >
                <Text style={{ color: Colors.primary, fontSize: FontSize.md, fontWeight: '700' }}>
                  ‹ Home
                </Text>
              </TouchableOpacity>
            ),
        headerRight: () => <NotificationBellButton />,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: { borderTopColor: Colors.border },
        tabBarLabelStyle: { fontSize: FontSize.xs },
      })}
    >
      <TripTab.Screen
        name="Dashboard"
        component={TripDashboardScreen}
        initialParams={{ tripId }}
        options={{
          title: 'Trip Home',
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      {canViewExpenses && isFeatureEnabled('expenses') && (
        <TripTab.Screen
          name="Expenses"
          component={ExpensesListScreen}
          initialParams={{ tripId }}
          options={{
            title: 'Expenses',
            tabBarLabel: 'Expenses',
            tabBarIcon: ({ focused }) => <TabIcon emoji="💰" focused={focused} />,
          }}
        />
      )}
      {isFeatureEnabled('chat') && (
        <TripTab.Screen
          name="Chat"
          component={TripChatScreen}
          initialParams={{ tripId }}
          options={{
            title: 'Chat',
            tabBarLabel: 'Chat',
            tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
          }}
        />
      )}
      {isFeatureEnabled('album') && (
        <TripTab.Screen
          name="Album"
          component={TripAlbumScreen}
          initialParams={{ tripId }}
          options={{
            title: 'Album',
            tabBarLabel: 'Album',
            tabBarIcon: ({ focused }) => <TabIcon emoji="📷" focused={focused} />,
          }}
        />
      )}
      <TripTab.Screen
        name="More"
        component={MoreScreen}
        initialParams={{ tripId }}
        options={{
          title: 'More',
          tabBarLabel: 'More',
          tabBarIcon: ({ focused }) => <TabIcon emoji="☰" focused={focused} />,
        }}
      />
    </TripTab.Navigator>
  );
}

function MainNavigator() {
  return (
    <MainStack.Navigator
      screenOptions={{
        headerTintColor: Colors.primary,
        headerBackTitle: 'Back',
        headerTitleStyle: { fontWeight: '600' },
        headerStyle: { backgroundColor: Colors.surface },
        headerRight: () => <NotificationBellButton />,
      }}
    >
      <MainStack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <MainStack.Screen
        name="TripStack"
        component={TripTabs}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <MainStack.Screen name="CreateTrip" component={CreateTripScreen} options={{ title: 'New Trip' }} />
      <MainStack.Screen name="TripSettings" component={TripSettingsScreen} options={{ title: 'Trip Settings' }} />
      <MainStack.Screen name="Families" component={FamiliesScreen} options={{ title: 'Families' }} />
      <MainStack.Screen name="JoinFamily" component={JoinFamilyScreen} options={{ title: 'Join a Family' }} />
      <MainStack.Screen name="AddEditFamily" component={AddEditFamilyScreen} options={{ title: 'Family' }} />
      <MainStack.Screen name="FamilyDetail" component={FamilyDetailScreen} options={{ title: 'Family Details' }} />
      <MainStack.Screen name="AddEditExpense" component={AddEditExpenseScreen} options={{ title: 'Expense' }} />
      <MainStack.Screen name="Balances" component={BalancesScreen} options={{ title: 'Balances' }} />
      <MainStack.Screen name="Settlements" component={SettlementScreen} options={{ title: 'Settlements' }} />
      <MainStack.Screen name="PaymentTracking" component={PaymentTrackingScreen} options={{ title: 'Payment Tracking' }} />
      <MainStack.Screen name="ExpenseHistory" component={ExpenseHistoryScreen} options={{ title: 'Expense History' }} />
      <MainStack.Screen name="ReceiptScanner" component={ReceiptScannerScreen} options={{ title: 'Scan Receipt' }} />
      <MainStack.Screen name="MediaDetail" component={MediaDetailScreen} options={{ title: 'Media' }} />
      <MainStack.Screen name="Itinerary" component={ItineraryScreen} options={{ title: 'Itinerary' }} />
      <MainStack.Screen name="AddEditItineraryItem" component={AddEditItineraryItemScreen} options={{ title: 'Itinerary Item' }} />
      <MainStack.Screen name="DailyPlan" component={DailyPlanScreen} options={{ title: "Today's Plan" }} />
      <MainStack.Screen name="GroceryList" component={GroceryListScreen} options={{ title: 'Grocery List' }} />
      <MainStack.Screen name="PackingList" component={PackingListScreen} options={{ title: 'Packing List' }} />
      <MainStack.Screen name="CarPlanning" component={CarPlanningScreen} options={{ title: 'Car Planning' }} />
      <MainStack.Screen name="AddEditCar" component={AddEditCarScreen} options={{ title: 'Car' }} />
      <MainStack.Screen name="Polls" component={PollsScreen} options={{ title: 'Polls' }} />
      <MainStack.Screen name="CreatePoll" component={CreatePollScreen} options={{ title: 'New Poll' }} />
      <MainStack.Screen name="PollDetail" component={PollDetailScreen} options={{ title: 'Poll' }} />
      <MainStack.Screen name="EmergencyInfo" component={EmergencyInfoScreen} options={{ title: 'Emergency Info' }} />
      <MainStack.Screen name="Fairness" component={FairnessDashboardScreen} options={{ title: 'Fairness Dashboard' }} />
      <MainStack.Screen name="Announcements" component={AnnouncementsScreen} options={{ title: 'Announcements' }} />
      <MainStack.Screen name="CommunitySpots" component={CommunitySpotsScreen} options={{ title: 'Community Spots' }} />
      <MainStack.Screen name="CreateCommunitySpot" component={CreateCommunitySpotScreen} options={{ title: 'Post Spot' }} />
      <MainStack.Screen name="CommunitySpotReview" component={CommunitySpotReviewScreen} options={{ title: 'Spot Review' }} />
      <MainStack.Screen name="GlobalAdmin" component={GlobalAdminScreen} options={{ title: '🛡 Admin — All Trips' }} />
      <MainStack.Screen
        name="LiveLocation"
        component={LiveLocationScreen}
        options={{
          headerShown: false,
        }}
      />
      <MainStack.Screen
        name="Notifications"
        component={NotificationCenterScreen}
        options={{ title: 'Notifications', headerRight: () => null }}
      />
    </MainStack.Navigator>
  );
}

const navigationRef = createNavigationContainerRef();

function normalizeNotificationData(data: unknown): Record<string, unknown> {
  return data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
}

function navigateMain(screen: keyof MainStackParamList, params?: Record<string, unknown>) {
  (navigationRef as any).navigate('Main', {
    screen,
    params,
  });
}

function handleNotificationNavigation(rawData: unknown) {
  if (!navigationRef.isReady()) return;
  const data = normalizeNotificationData(rawData);
  const tripId = data?.trip_id as string | undefined;
  const type = data?.type as string | undefined;
  if (!tripId) return;

  try {
    if (type === 'message' || type === 'push_talk') {
      (navigationRef as any).navigate('Main', {
        screen: 'TripStack',
        params: { tripId, initialTab: 'Chat' },
      });
      return;
    }

    // Join request notifications carry a request_id in data
    if (data?.request_id) {
      navigateMain('TripSettings', { tripId });
      return;
    }

    if (data?.settlement_id) {
      navigateMain('PaymentTracking', { tripId });
      return;
    }

    const MODAL_SCREEN: Partial<Record<string, keyof MainStackParamList>> = {
      expense_added: 'Settlements',
      settlement_request: 'Settlements',
      payment_confirmed: 'PaymentTracking',
      announcement: 'Announcements',
      poll: 'Polls',
    };

    const modal = type ? MODAL_SCREEN[type] : undefined;
    if (modal) {
      navigateMain(modal, { tripId });
    } else {
      (navigationRef as any).navigate('Main', {
        screen: 'TripStack',
        params: { tripId },
      });
    }
  } catch { /* navigation may fail if screen isn't mounted yet */ }
}

// Stores notification data when nav isn't ready yet (cold start race condition).
// Processed in NavigationContainer's onReady callback.
let pendingNotificationData: unknown = null;

export function AppNavigator() {
  const { user, loading, isPasswordRecovery } = useAuth();

  useEffect(() => {
    // App opened from killed state via notification tap.
    // NavigationContainer may not be mounted yet (loading=true guard below),
    // so store the data and process it in onReady instead.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data;
      if (navigationRef.isReady()) {
        handleNotificationNavigation(data);
      } else {
        pendingNotificationData = data;
      }
    });

    // Notification tapped while app is running
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationNavigation(response.notification.request.content.data);
    });

    return () => sub.remove();
  }, []);

  if (loading) return <LoadingView message="Loading Travel Crew..." />;

  const linking = {
    prefixes: ['travelcrew://'],
    config: {
      screens: {
        Main: {
          screens: {
            // travelcrew://poll?pollId=xxx&tripId=xxx
            PollDetail: {
              path: 'poll',
              parse: { pollId: String, tripId: String },
            },
            // travelcrew://trip?tripId=xxx  → opens trip dashboard
            TripStack: {
              path: 'trip',
              parse: { tripId: String },
            },
            // travelcrew://chat?tripId=xxx  → opens trip, user lands on Chat tab
            // Handled by TripStack + in-screen navigation via initialRoute logic
            // (TripStack opens Dashboard by default; chat tab requires user tap)
          },
        },
      },
    },
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      onReady={() => {
        if (pendingNotificationData) {
          handleNotificationNavigation(pendingNotificationData);
          pendingNotificationData = null;
        }
      }}
    >
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {user && !isPasswordRecovery ? (
          <RootStack.Screen name="Main" component={MainNavigator} />
        ) : (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
