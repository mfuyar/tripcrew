import { Alert, Linking, Platform } from 'react-native';

function encodedDestination(destination: string): string {
  return encodeURIComponent(destination.trim());
}

export function isMappableDestination(destination: string | null | undefined): boolean {
  const value = destination?.trim();
  if (!value) return false;

  const normalized = value.toLowerCase();
  if (['tbd', 'todo', 'unknown', 'none', 'n/a', 'na', 'trip', 'vacation', 'holiday'].includes(normalized)) {
    return false;
  }

  const coordinatePattern = /^-?\d{1,2}(?:\.\d+)?,\s*-?\d{1,3}(?:\.\d+)?$/;
  if (coordinatePattern.test(value)) return true;

  const hasLetter = /[a-z]/i.test(value);
  if (!hasLetter || value.length < 4) return false;

  const hasStreetNumber = /\d+\s+[a-z]/i.test(value);
  const hasAddressWord = /\b(street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|hotel|resort|airport|station|terminal|park|mall|center|centre)\b/i.test(value);
  if (hasStreetNumber || hasAddressWord) return true;

  if (/\b(trip|vacation|holiday|somewhere|destination)\b/i.test(value)) return false;

  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.every((part) => /[a-z]/i.test(part) && part.length >= 2)) return true;

  return value.trim().split(/\s+/).length >= 2;
}

export function openAppleMapsDirections(destination: string): void {
  if (!isMappableDestination(destination)) {
    Alert.alert('Address needed', 'Add a proper address or destination before opening Maps.');
    return;
  }

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
  if (!isMappableDestination(destination)) {
    Alert.alert('Address needed', 'Add a proper address or destination before opening Google Maps.');
    return;
  }

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
