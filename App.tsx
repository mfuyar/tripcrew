import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/contexts/AuthContext';
import { TripProvider } from './src/contexts/TripContext';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  return (
    <AuthProvider>
      <TripProvider>
        <StatusBar style="auto" />
        <AppNavigator />
      </TripProvider>
    </AuthProvider>
  );
}
