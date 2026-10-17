import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { validateCatalogue } from '../public/restoration/catalogue.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(await readFile(join(root, 'tools/client-lock.json'), 'utf8'));
const progress = JSON.parse(await readFile(join(root, 'public/restoration/progress.json'), 'utf8'));
const restoration = validateCatalogue(progress);
for (const icon of new Set([...progress.categories, ...progress.features].map(row => row.icon).filter(icon => icon !== null))) {
  if (!/^assets\/player\/[a-z0-9-]+\.png$/.test(icon)) throw new Error(`Invalid restoration asset: ${icon}`);
  await readFile(join(root, 'public/restoration', icon));
}
for (const name of ['SITE_URL', 'CLIENT_DIR']) {
  if (!process.env[name]) throw new Error(`${name} is required; see the setup instructions.`);
}
const site = new URL(process.env.SITE_URL);
if (site.username || site.password || site.search || site.hash) throw new Error('SITE_URL must be a public site root without credentials, query or fragment.');
if (site.protocol !== 'https:' && !(site.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(site.hostname))) {
  throw new Error('SITE_URL must use HTTPS, except for a loopback development server.');
}
if (site.pathname !== '/') throw new Error('SITE_URL must be the origin root for the game backend.');
const socketOrigin = site.origin.replace(/^http/, 'ws');
const client = resolve(process.env.CLIENT_DIR);
const revision = execFileSync('git', ['-C', client, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (revision !== lock.revision) throw new Error(`Client revision mismatch: expected ${lock.revision}, received ${revision}. Update the lock deliberately.`);
execFileSync('git', ['-C', client, 'diff', '--quiet', 'HEAD', '--', 'client.swf', 'scripts/run.py', 'ruffle']);
const swf = await readFile(join(client, 'client.swf'));
if (createHash('sha256').update(swf).digest('hex') !== lock.swfSha256) throw new Error('Reference SWF checksum mismatch.');
execFileSync('python3', [join(client, 'scripts/run.py'), '--prepare-only'], { stdio: 'inherit' });
const runtimeFiles = await readdir(join(client, 'vendor'));
if (runtimeFiles.length !== 8 || !runtimeFiles.includes('ruffle.js') || !runtimeFiles.includes('openrotmg.json')) throw new Error('Expected the pinned dual Ruffle runtime and source provenance.');

const dist = join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist);
await cp(join(root, 'public'), dist, { recursive: true });
const socialImage = `social.png?v=${createHash('sha256').update(await readFile(join(dist, 'social.png'))).digest('hex').slice(0, 12)}`;
async function render(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await render(path);
    else if (entry.name.endsWith('.html')) {
      const html = (await readFile(path, 'utf8')).replaceAll('{{SITE_URL}}', site.href).replaceAll('{{BASE}}', site.pathname).replaceAll('{{CLIENT_REVISION}}', lock.revision).replaceAll('{{SOCIAL_IMAGE}}', socialImage).replaceAll('{{SOCKET_ORIGIN}}', socketOrigin).replaceAll('{{RESTORATION_PERCENT}}', restoration.percent).replaceAll('{{RESTORATION_FEATURES}}', progress.features.length);
      if (html.includes('{{')) throw new Error(`Unresolved template token: ${path}`);
      await writeFile(path, html);
    }
  }
}
await render(dist);
await writeFile(join(dist, 'diagnostics-build.json'), JSON.stringify({
  website: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
  dirty: execFileSync('git', ['status', '--porcelain'], {cwd: root, encoding: 'utf8'}).trim().length > 0,
  client: lock.revision, runtime: createHash('sha256').update(await readFile(join(client, 'vendor/openrotmg.json'))).digest('hex').slice(0, 16)
}));
await writeFile(join(dist, '.nojekyll'), '');
await writeFile(join(dist, 'robots.txt'), `User-agent: *\nAllow: ${site.pathname}\nDisallow: /vendor/\nDisallow: /client.swf\nDisallow: /sfx/\nDisallow: /legacy-api/\nDisallow: /game\nSitemap: ${site.href}sitemap.xml\n`);
await writeFile(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site.href}</loc></url><url><loc>${site.href}about/</loc></url><url><loc>${site.href}restoration/</loc></url><url><loc>${site.href}branding/</loc></url><url><loc>${site.href}hiscores/</loc></url><url><loc>${site.href}gold/</loc></url><url><loc>${site.href}updates/</loc></url></urlset>\n`);
console.log(`Built ${site.href} for client ${revision}. Rust must serve /client.swf, /vendor/, /sfx/, /legacy-api/ and /game.`);
