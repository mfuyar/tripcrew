export class File {
  uri: string;
  type: string;
  size = 12345;

  constructor(uri: string) {
    this.uri = uri;
    this.type = uri.endsWith('.m4a') ? 'audio/x-m4a' : 'image/jpeg';
  }
}
