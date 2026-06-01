// Minimal React Native mock for Node/Jest environment
module.exports = {
  Platform: { OS: 'ios', select: (obj: any) => obj.ios ?? obj.default },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  Alert: { alert: jest.fn() },
  AsyncStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  },
};
