const path = require('node:path');

/** Resolve a request path beneath the static root without accepting sibling prefixes. */
function resolveStaticPath(root, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent((requestUrl || '/').split('?')[0]);
  } catch {
    return { status: 400 };
  }
  if (pathname.includes('\0')) return { status: 400, pathname };

  const rootPath = path.resolve(root);
  const relativeRequest = pathname === '/' ? './index.html' : `.${pathname}`;
  const filePath = path.resolve(rootPath, relativeRequest);
  const relativeFile = path.relative(rootPath, filePath);
  if (
    relativeFile === '..' ||
    relativeFile.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeFile)
  ) {
    return { status: 403, pathname };
  }

  return { status: 200, pathname, filePath };
}

module.exports = { resolveStaticPath };
