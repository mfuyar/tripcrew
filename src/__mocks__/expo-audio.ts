export const RecordingPresets = {
  HIGH_QUALITY: {},
  LOW_QUALITY: {},
};

export const requestRecordingPermissionsAsync = jest.fn().mockResolvedValue({ granted: true });
export const setAudioModeAsync = jest.fn().mockResolvedValue(undefined);
export const useAudioRecorder = jest.fn().mockReturnValue({
  prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
  record: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  uri: null,
  currentTime: 0,
});
