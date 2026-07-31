const { injectManifest } = require('workbox-build');
const path = require('path');
const fs = require('fs');

async function generateManifest() {
  const swSrc = path.join(__dirname, '../public/sw.js');
  const swDest = path.join(__dirname, '../.next/standalone/public/sw.js');

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
  const publicDir = path.join(__dirname, '../public');
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
  // Find the precacheAndRoute call and inject public files
  const manifestMatch = swContent.match(/precacheAndRoute\((\[.*?\])/s);
  if (!manifestMatch) return swContent;
  
  let manifest;
  try {
    manifest = JSON.parse(manifestMatch[1]);
  } catch {
    return swContent;
  }
  
  // Add public files to manifest
  for (const file of publicFiles) {
    // Check if already in manifest
    if (!manifest.some((m) => m.url === file.url)) {
      manifest.push({
        revision: file.revision,
        url: file.url,
      });
    }
  }
  
  // Replace the manifest array
  return swContent.replace(
    /precacheAndRoute\(\[.*?\]/s,
    `precacheAndRoute(${JSON.stringify(manifest, null, 2)}`
  );
}

generateManifest().catch((err) => {
  console.error('Failed to generate SW manifest:', err);
  process.exit(1);
});
