export class UrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlError';
  }
}
