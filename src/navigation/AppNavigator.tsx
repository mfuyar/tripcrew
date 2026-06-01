import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { Colors, FontSize } from '../constants/theme';
import { LoadingView } from '../components/LoadingView';

// Auth Screens
import { LoginScreen } from '../screens/auth/LoginScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';

// Main Screens
import { TripsListScreen } from '../screens/trips/TripsListScreen';
import { CreateTripScreen } from '../screens/trips/CreateTripScreen';
import { TripDashboardScreen } from '../screens/trips/TripDashboardScreen';
import { TripSettingsScreen } from '../screens/trips/TripSettingsScreen';
import { ProfileScreen } from '../screens/other/ProfileScreen';

// Family Screens
import { FamiliesScreen } from '../screens/families/FamiliesScreen';
import { AddEditFamilyScreen } from '../screens/families/AddEditFamilyScreen';
import { FamilyDetailScreen } from '../screens/families/FamilyDetailScreen';

// Expense Screens
import { ExpensesListScreen } from '../screens/expenses/ExpensesListScreen';
import { AddEditExpenseScreen } from '../screens/expenses/AddEditExpenseScreen';
import { BalancesScreen } from '../screens/expenses/BalancesScreen';
import { SettlementScreen } from '../screens/expenses/SettlementScreen';
import { PaymentTrackingScreen } from '../screens/expenses/PaymentTrackingScreen';
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

import {
  RootStackParamList,
  AuthStackParamList,
  MainStackParamList,
  TabParamList,
  TripTabParamList,
} from '../types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const TripTab = createBottomTabNavigator<TripTabParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
    </AuthStack.Navigator>
  );
}

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={{ opacity: focused ? 1 : 0.55 }}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
    </View>
  );
}

function MainTabs() {
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
          tabBarIcon: ({ focused }) => <TabIcon emoji="✈️" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

function TripTabs({ route }: { route: { params: { tripId: string } } }) {
  const { tripId } = route.params;
  return (
    <TripTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: { borderTopColor: Colors.border },
        tabBarLabelStyle: { fontSize: FontSize.xs },
      }}
    >
      <TripTab.Screen
        name="Dashboard"
        component={TripDashboardScreen}
        initialParams={{ tripId }}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <TripTab.Screen
        name="Expenses"
        component={ExpensesListScreen}
        initialParams={{ tripId }}
        options={{
          tabBarLabel: 'Expenses',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💰" focused={focused} />,
        }}
      />
      <TripTab.Screen
        name="Chat"
        component={TripChatScreen}
        initialParams={{ tripId }}
        options={{
          tabBarLabel: 'Chat',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
        }}
      />
      <TripTab.Screen
        name="Album"
        component={TripAlbumScreen}
        initialParams={{ tripId }}
        options={{
          tabBarLabel: 'Album',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📷" focused={focused} />,
        }}
      />
      <TripTab.Screen
        name="More"
        component={MoreScreen}
        initialParams={{ tripId }}
        options={{
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
        headerTitleStyle: { fontWeight: '600' },
        headerStyle: { backgroundColor: Colors.surface },
      }}
    >
      <MainStack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <MainStack.Screen
        name="TripStack"
        component={TripTabs}
        options={{ headerShown: false }}
      />
      <MainStack.Screen name="CreateTrip" component={CreateTripScreen} options={{ title: 'New Trip' }} />
      <MainStack.Screen name="TripSettings" component={TripSettingsScreen} options={{ title: 'Trip Settings' }} />
      <MainStack.Screen name="Families" component={FamiliesScreen} options={{ title: 'Families' }} />
      <MainStack.Screen name="AddEditFamily" component={AddEditFamilyScreen} options={{ title: 'Family' }} />
      <MainStack.Screen name="FamilyDetail" component={FamilyDetailScreen} options={{ title: 'Family Details' }} />
      <MainStack.Screen name="AddEditExpense" component={AddEditExpenseScreen} options={{ title: 'Expense' }} />
      <MainStack.Screen name="Balances" component={BalancesScreen} options={{ title: 'Balances' }} />
      <MainStack.Screen name="Settlements" component={SettlementScreen} options={{ title: 'Settlements' }} />
      <MainStack.Screen name="PaymentTracking" component={PaymentTrackingScreen} options={{ title: 'Payment Tracking' }} />
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
      <MainStack.Screen name="Notifications" component={NotificationCenterScreen} options={{ title: 'Notifications' }} />
    </MainStack.Navigator>
  );
}

export function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingView message="Loading TripCrew..." />;

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <RootStack.Screen name="Main" component={MainNavigator} />
        ) : (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
