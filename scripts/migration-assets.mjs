import fs from 'node:fs/promises';
import path from 'node:path';

export async function referencedImages(dir, manifest) {
  const tables = await Promise.all(Object.keys(manifest.tables).map(async name => ({ name, raw: await fs.readFile(path.join(dir, 'tables', `${name}.json`), 'utf8') })));
  return manifest.files.filter(file => file.contentType.startsWith('image/')).flatMap(file => {
    const usage = tables.filter(t => t.raw.includes(file.sourceUrl));
    if (!usage.length) return [];
    return [{ ...file, access: usage.some(t => !['orders', 'assessment_responses', 'session', 'app_settings'].includes(t.name)) ? 'catalog' : 'admin' }];
  });
}
