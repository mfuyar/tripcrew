import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { TripProvider } from './src/contexts/TripContext';
import { NotificationsProvider } from './src/contexts/NotificationsContext';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <TripProvider>
          <NotificationsProvider>
            <StatusBar style="auto" />
            <AppNavigator />
          </NotificationsProvider>
        </TripProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
