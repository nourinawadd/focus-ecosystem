// Copies local Expo modules from ./modules/ into ./node_modules/ after install.
// We can't rely on npm's `file:` dep handling because it creates symlinks that
// the Expo autolinker doesn't follow reliably on the EAS build server.

const fs   = require('fs');
const path = require('path');

const LOCAL_MODULES = ['anchor-screen-time'];

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src,  entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

for (const name of LOCAL_MODULES) {
  const src  = path.join(__dirname, '..', 'modules',      name);
  const dest = path.join(__dirname, '..', 'node_modules', name);
  if (!fs.existsSync(src)) {
    console.warn(`[setup-local-modules] source missing: ${src}`);
    continue;
  }
  rmrf(dest);
  copyDir(src, dest);
  console.log(`[setup-local-modules] copied ${name} -> node_modules/${name}`);
}
