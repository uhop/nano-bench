import {readdir, stat} from 'node:fs/promises';
import path from 'node:path';

import {escapeHtml, isInside} from './files.js';
import {PREFIX} from './nano-bench-plugin.js';

const APP = PREFIX + 'web-app/';

const units = ['B', 'KB', 'MB', 'GB', 'TB'];

export const formatSize = bytes => {
  let i = 0,
    value = bytes;
  for (; value >= 1024 && i < units.length - 1; ++i) value /= 1024;
  return (i ? value.toFixed(value < 10 ? 1 : 0) : String(value)) + ' ' + units[i];
};

const formatTime = date => date.toISOString().replace(/^([^T]+)T([^.]+).*$/, '$1 $2');

const byName = (a, b) => a.name.localeCompare(b.name, undefined, {numeric: true});

const breadcrumbs = pathname => {
  const parts = pathname.split('/').filter(Boolean),
    links = [`<a href="/?list">root</a>`];
  let href = '/';
  for (const part of parts) {
    href += encodeURIComponent(part) + '/';
    links.push(`<a href="${href}">${escapeHtml(part)}</a>`);
  }
  return links.join('<span class="sep">/</span>');
};

const row = ({name, isDirectory, size, mtime, href, viewHref}) =>
  `<tr class="${isDirectory ? 'dir' : 'file'}">` +
  `<td class="name"><a href="${href}">${escapeHtml(name)}${isDirectory ? '/' : ''}</a>` +
  (viewHref ? ` <a class="view" href="${viewHref}">view</a>` : '') +
  `</td>` +
  `<td class="size"${isDirectory ? '' : ` title="${size.toLocaleString('en-US')} bytes"`}>${isDirectory ? '' : formatSize(size)}</td>` +
  `<td class="time">${formatTime(mtime)}</td></tr>`;

const page = (pathname, rows) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Index of ${escapeHtml(pathname)}</title>
<script src="${APP}theme-init.js"></script>
<link rel="stylesheet" href="${APP}theme.css">
<link rel="stylesheet" href="${APP}autoindex.css">
<script type="module" src="${APP}theme.js"></script>
</head>
<body>
<header class="bar">
<nav class="crumbs">${breadcrumbs(pathname)}</nav>
<a class="app-link" href="${APP}">Results</a>
<div id="theme-toggle" role="group" aria-label="Color theme"></div>
</header>
<main>
<table class="listing">
<thead><tr><th class="name">Name</th><th class="size">Size</th><th class="time">Modified</th></tr></thead>
<tbody>
${rows.join('\n')}
</tbody>
</table>
</main>
</body>
</html>
`;

/**
 * @param {{rootFolder: string}} api
 * @param {{showDotFiles?: boolean}} [options]
 */
export const autoindexPlugin = ({rootFolder}, {showDotFiles = false} = {}) => ({
  name: 'autoindex',
  async fetch(request) {
    const url = new URL(request.url),
      pathname = decodeURIComponent(url.pathname);
    if (!pathname.endsWith('/')) return undefined;
    // the root redirects to the viewer unless a listing is asked for explicitly
    if (pathname === '/' && !url.searchParams.has('list')) return undefined;
    const folder = path.join(rootFolder, pathname);
    if (!isInside(rootFolder, folder)) return undefined;
    if (await stat(path.join(folder, 'index.html')).catch(() => null)) return undefined;
    const entries = await readdir(folder, {withFileTypes: true}).catch(() => null);
    if (!entries) return undefined;

    const visible = entries.filter(
        e => (showDotFiles || !e.name.startsWith('.')) && (e.isDirectory() || e.isFile())
      ),
      folders = visible.filter(e => e.isDirectory()).sort(byName),
      files = visible.filter(e => e.isFile()).sort(byName),
      items = [];

    if (pathname !== '/') {
      const info = await stat(path.join(folder, '..'));
      items.push({name: '..', isDirectory: true, size: 0, mtime: info.mtime, href: '../'});
    }
    for (const e of [...folders, ...files]) {
      const info = await stat(path.join(folder, e.name)).catch(() => null);
      if (!info) continue;
      const isDirectory = e.isDirectory(),
        href = encodeURIComponent(e.name) + (isDirectory ? '/' : ''),
        viewHref =
          !isDirectory && e.name.endsWith('.json')
            ? APP + '?view=' + encodeURIComponent(pathname.substring(1) + e.name)
            : null;
      items.push({name: e.name, isDirectory, size: info.size, mtime: info.mtime, href, viewHref});
    }

    return new Response(page(pathname, items.map(row)), {
      headers: {'content-type': 'text/html; charset=utf-8'}
    });
  }
});

export default autoindexPlugin;
