/** Keep legacy/local images working while limiting migrated images to four variants. */
export function imageUrl(url: string, width: 320 | 640 | 960 | 1600 = 960): string {
  return /^\/api\/media\/[a-f0-9]{64}$/.test(url) ? `${url}?w=${width}` : url;
}
