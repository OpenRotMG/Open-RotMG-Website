import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(await readFile(join(root, 'client-lock.json'), 'utf8'));
for (const name of ['SITE_URL', 'CLIENT_DIR']) {
  if (!process.env[name]) throw new Error(`${name} is required; see the setup instructions.`);
}
const site = new URL(process.env.SITE_URL);
if (site.username || site.password || site.search || site.hash) throw new Error('SITE_URL must be a public site root without credentials, query or fragment.');
if (site.protocol !== 'https:' && !(site.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(site.hostname))) {
  throw new Error('SITE_URL must use HTTPS, except for a loopback development server.');
}
if (!site.pathname.endsWith('/')) site.pathname += '/';
const client = resolve(process.env.CLIENT_DIR);
const revision = execFileSync('git', ['-C', client, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (revision !== lock.revision) throw new Error(`Client revision mismatch: expected ${lock.revision}, received ${revision}. Update the lock deliberately.`);
execFileSync('git', ['-C', client, 'diff', '--quiet', 'HEAD', '--', 'client.swf', 'run.py']);
const swf = await readFile(join(client, 'client.swf'));
if (createHash('sha256').update(swf).digest('hex') !== lock.swfSha256) throw new Error('Reference SWF checksum mismatch.');
execFileSync('python3', [join(client, 'run.py'), '--prepare-only'], { stdio: 'inherit' });
const runtimeFiles = await readdir(join(client, 'vendor'));
if (runtimeFiles.length !== 7 || !runtimeFiles.includes('ruffle.js')) throw new Error('Expected the pinned seven-file Ruffle runtime.');

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
      const html = (await readFile(path, 'utf8')).replaceAll('{{SITE_URL}}', site.href).replaceAll('{{BASE}}', site.pathname).replaceAll('{{SOCIAL_IMAGE}}', socialImage);
      if (html.includes('{{')) throw new Error(`Unresolved template token: ${path}`);
      await writeFile(path, html);
    }
  }
}
await render(dist);
await mkdir(join(dist, 'client'));
await writeFile(join(dist, 'client/123.5.1.swf'), swf);
await mkdir(join(dist, 'runtime'));
for (const name of runtimeFiles) await cp(join(client, 'vendor', name), join(dist, 'runtime', name));
await writeFile(join(dist, '.nojekyll'), '');
await writeFile(join(dist, 'robots.txt'), `User-agent: *\nAllow: ${site.pathname}\nDisallow: ${site.pathname}runtime/\nDisallow: ${site.pathname}client/\nDisallow: ${site.pathname}legacy-api/\nSitemap: ${site.href}sitemap.xml\n`);
await writeFile(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site.href}</loc></url><url><loc>${site.href}about/</loc></url></urlset>\n`);
console.log(`Built ${site.href} from client ${revision}. Multiplayer remains disconnected.`);
