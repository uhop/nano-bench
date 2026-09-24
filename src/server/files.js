import path from 'node:path';

const mimeTable = {
  css: 'text/css; charset=utf-8',
  html: 'text/html; charset=utf-8',
  ico: 'image/vnd.microsoft.icon',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8'
};

export const mimeOf = fileName =>
  mimeTable[path.extname(fileName).substring(1).toLowerCase()] ?? 'application/octet-stream';

export const isInside = (base, fileName) => {
  const relative = path.relative(base, fileName);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
};

export const toPosix = fileName =>
  path.sep === path.win32.sep ? fileName.replaceAll(path.win32.sep, path.posix.sep) : fileName;

// a slash is legal in a query value; keeping it makes printed URLs readable
export const encodeQueryPath = p => encodeURIComponent(p).replaceAll('%2F', '/');

export const escapeHtml = s =>
  String(s).replace(
    /[&<>"']/g,
    c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]
  );
