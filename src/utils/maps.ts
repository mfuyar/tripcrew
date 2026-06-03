import { Alert, Linking, Platform } from 'react-native';

function encodedDestination(destination: string): string {
  return encodeURIComponent(destination.trim());
}

export function openAppleMapsDirections(destination: string): void {
  const query = encodedDestination(destination);
  if (!query) {
    Alert.alert('Destination missing', 'Add a destination or address first.');
    return;
  }

  const url = Platform.OS === 'ios'
    ? `maps://?daddr=${query}&dirflg=d`
    : `https://maps.apple.com/?daddr=${query}`;

  Linking.openURL(url).catch(() => {
    Linking.openURL(`https://maps.apple.com/?daddr=${query}`).catch(() => {
      Alert.alert('Could not open Maps', 'Please check the destination and try again.');
    });
  });
}

export function openGoogleMapsDirections(destination: string): void {
  const query = encodedDestination(destination);
  if (!query) {
    Alert.alert('Destination missing', 'Add a destination or address first.');
    return;
  }

  const appUrl = Platform.OS === 'ios'
    ? `comgooglemaps://?daddr=${query}&directionsmode=driving`
    : `google.navigation:q=${query}`;
  const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${query}`;

  Linking.openURL(appUrl).catch(() => Linking.openURL(webUrl).catch(() => {
    Alert.alert('Could not open Google Maps', 'Please check the destination and try again.');
  }));
}
