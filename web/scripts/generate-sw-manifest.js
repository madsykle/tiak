const { injectManifest } = require('workbox-build');
const path = require('path');
const fs = require('fs');

async function generateManifest() {
  const publicDir = path.join(__dirname, '../public');
  const standaloneRoot = path.join(__dirname, '../.next/standalone');
  const standalonePublicDir = path.join(standaloneRoot, 'public');
  const standaloneStaticDir = path.join(standaloneRoot, '.next/static');
  const sourceStaticDir = path.join(__dirname, '../.next/static');
  const swSrc = path.join(publicDir, 'sw.js');
  const swDest = path.join(standalonePublicDir, 'sw.js');

  // Next's standalone output does not include public/, so copy it explicitly
  // for direct `node .next/standalone/server.js` deployments as well as Docker.
  fs.rmSync(standalonePublicDir, { recursive: true, force: true });
  fs.mkdirSync(standalonePublicDir, { recursive: true });
  fs.cpSync(publicDir, standalonePublicDir, { recursive: true });
  fs.mkdirSync(path.dirname(standaloneStaticDir), { recursive: true });
  fs.rmSync(standaloneStaticDir, { recursive: true, force: true });
  fs.cpSync(sourceStaticDir, standaloneStaticDir, { recursive: true });

  const { count, size, warnings } = await injectManifest({
    swSrc,
    swDest,
    globDirectory: path.join(__dirname, '../.next'),
    globPatterns: [
      'static/**/*.{js,css,html,json,ico,png,svg,woff,woff2}',
    ],
    globIgnores: [
      '**/node_modules/**',
      '**/sw.js',
      '**/workbox-*.js',
    ],
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
  });

  if (warnings.length > 0) {
    console.warn('Workbox warnings:', warnings);
  }

  console.log(`Generated SW manifest: ${count} files, ${(size / 1024).toFixed(1)} KB`);

  // Now manually add public folder files to the precache manifest
  const generatedSw = fs.readFileSync(swDest, 'utf8');
  
  // Get public files
  const publicFiles = getPublicFiles(publicDir);
  
  // Inject them into the precache manifest
  const updatedSw = injectPublicFiles(generatedSw, publicFiles);
  fs.writeFileSync(swDest, updatedSw);
  
  console.log(`Added ${publicFiles.length} public files to manifest`);
}

function getPublicFiles(dir, baseDir = dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);
    
    if (entry.isDirectory()) {
      files.push(...getPublicFiles(fullPath, baseDir));
    } else if (/\.(ico|png|svg|json|woff|woff2)$/i.test(entry.name) && entry.name !== 'sw.js' && !entry.name.startsWith('workbox-')) {
      const stats = fs.statSync(fullPath);
      if (stats.size <= 5 * 1024 * 1024) {
        files.push({
          url: '/' + relPath.replace(/\\/g, '/'),
          revision: stats.mtimeMs.toString(),
          size: stats.size,
        });
      }
    }
  }
  return files;
}

function injectPublicFiles(swContent, publicFiles) {
  // Workbox replaces self.__WB_MANIFEST with an array during injectManifest.
  // Add public assets to that generated array so offline startup can resolve
  // the manifest, icons, and other files served from public/.
  const manifestMatch = swContent.match(
    /const PRECACHE_MANIFEST = (\[.*?\]) \|\| \[\];/s,
  );
  if (!manifestMatch) {
    throw new Error("Generated service worker precache marker not found");
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestMatch[1]);
  } catch {
    return swContent;
  }

  for (const file of publicFiles) {
    if (!manifest.some((entry) => entry.url === file.url)) {
      manifest.push({
        revision: file.revision,
        url: file.url,
      });
    }
  }

  return swContent.replace(
    /const PRECACHE_MANIFEST = \[.*?\] \|\| \[\];/s,
    `const PRECACHE_MANIFEST = ${JSON.stringify(manifest, null, 2)} || [];`,
  );
}

generateManifest().catch((err) => {
  console.error('Failed to generate SW manifest:', err);
  process.exit(1);
});
