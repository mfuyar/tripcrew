/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo-location$': '<rootDir>/src/__mocks__/expo-location.ts',
    '^expo-audio$': '<rootDir>/src/__mocks__/expo-audio.ts',
    '^expo-.*': '<rootDir>/src/__mocks__/expo.ts',
    '^react-native$': '<rootDir>/src/__mocks__/react-native.ts',
    '^react-native-url-polyfill/auto$': '<rootDir>/src/__mocks__/expo.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
      diagnostics: false,
    }],
  },
};
