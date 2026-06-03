const saveAsync = jest.fn().mockResolvedValue({
  uri: 'file:///cache/compressed.jpg',
  width: 1200,
  height: 1600,
});

const context = {
  renderAsync: jest
    .fn()
    .mockResolvedValueOnce({ width: 3024, height: 4032 })
    .mockResolvedValue({ saveAsync }),
  reset: jest.fn().mockReturnThis(),
  resize: jest.fn().mockReturnThis(),
};

export const ImageManipulator = {
  manipulate: jest.fn(() => context),
};

export const SaveFormat = {
  JPEG: 'jpeg',
  PNG: 'png',
  WEBP: 'webp',
};

export const __mockImageManipulator = {
  context,
  saveAsync,
};
