export function isCrossOriginHttpLink(rawHref: string, baseUri: string): boolean {
  const baseUrl = new URL(baseUri);
  const targetUrl = new URL(rawHref, baseUrl);

  return ['http:', 'https:'].includes(targetUrl.protocol)
    && targetUrl.origin !== baseUrl.origin;
}
