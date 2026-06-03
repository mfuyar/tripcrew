import fs from 'fs';
import path from 'path';

describe('SPEC §9 — trip-media bucket setup', () => {
  it('documents audio MIME types required for push talk uploads', () => {
    const schema = fs.readFileSync(path.join(process.cwd(), 'supabase/schema.sql'), 'utf8');

    [
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a',
      'audio/mpeg',
      'audio/aac',
      'audio/wav',
      'audio/x-caf',
    ].forEach((mimeType) => {
      expect(schema).toContain(mimeType);
    });
  });
});
