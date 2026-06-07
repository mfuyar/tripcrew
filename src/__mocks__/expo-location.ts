export const Accuracy = {
  Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6,
};

export const requestForegroundPermissionsAsync = jest.fn().mockResolvedValue({ status: 'granted' });
export const getForegroundPermissionsAsync = jest.fn().mockResolvedValue({ status: 'granted' });
export const requestBackgroundPermissionsAsync = jest.fn().mockResolvedValue({ status: 'granted' });
export const getBackgroundPermissionsAsync = jest.fn().mockResolvedValue({ status: 'granted' });
export const isBackgroundLocationAvailableAsync = jest.fn().mockResolvedValue(true);
export const hasStartedLocationUpdatesAsync = jest.fn().mockResolvedValue(false);
export const startLocationUpdatesAsync = jest.fn().mockResolvedValue(undefined);
export const stopLocationUpdatesAsync = jest.fn().mockResolvedValue(undefined);
export const watchPositionAsync = jest.fn().mockResolvedValue({ remove: jest.fn() });
export const getCurrentPositionAsync = jest.fn().mockResolvedValue({
  coords: { latitude: 37.7749, longitude: -122.4194, accuracy: 10, heading: 0, altitude: 0, speed: 0 },
  timestamp: Date.now(),
});
