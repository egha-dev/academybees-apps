// `pnpm --filter @academybee/marketing preview`: serve the static export in `out/` the way
// Cloudflare Pages does (folders → index.html, 404.html for misses). Local only.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../out');
const port = Number(process.env.PORT ?? 3100);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.woff2': 'font/woff2',
  '': 'image/png', // opengraph-image (Cloudflare gets it from public/_headers)
};

if (!existsSync(root)) {
  console.error('No out/ folder. Run `pnpm --filter @academybee/marketing build` first.');
  process.exit(1);
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) {
    res.writeHead(400).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  let status = 200;
  if (!existsSync(file)) {
    status = 404;
    file = path.join(root, '404.html');
  }
  res.writeHead(status, {
    'content-type': types[path.extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => console.warn(`academybees.com preview: http://localhost:${port}`));
