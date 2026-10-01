import { UrlError } from '../errors/CommonErrors.ts';

export const validateRpcUrl = (rpcUrl: string): void => {
  let url: URL;
  try {
    url = new URL(rpcUrl);
  } catch {
    throw new UrlError('Argument must be a valid URL');
  }

  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.hash ||
    /[<>]/.test(rpcUrl) ||
    /%3c.*%3e/i.test(url.pathname) ||
    /\/(?:YOUR_)?(?:ALCHEMY_)?API_KEY\/?$/i.test(url.pathname)
  ) {
    throw new UrlError('Argument must be a valid HTTPS URL');
  }
};
