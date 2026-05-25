const fs = require('fs');
const path = require('path');

const serviceMigrations = [
  { src: 'src/application/services/character-service.ts', dest: 'src/modules/character/character-service.ts', importOld: '@/application/services/character-service', importNew: '@/modules/character/character-service' },
  { src: 'src/application/services/scene-service.ts', dest: 'src/modules/scene/scene-service.ts', importOld: '@/application/services/scene-service', importNew: '@/modules/scene/scene-service' },
  { src: 'src/application/services/story-service.ts', dest: 'src/modules/story/story-service.ts', importOld: '@/application/services/story-service', importNew: '@/modules/story/story-service' },
  { src: 'src/application/services/storyboard-generation-service.ts', dest: 'src/modules/story/storyboard-generation-service.ts', importOld: '@/application/services/storyboard-generation-service', importNew: '@/modules/story/storyboard-generation-service' },
  { src: 'src/application/services/consistency-check-service.ts', dest: 'src/modules/shot/consistency-check-service.ts', importOld: '@/application/services/consistency-check-service', importNew: '@/modules/shot/consistency-check-service' },
  { src: 'src/application/services/feature-anchoring-service.ts', dest: 'src/modules/shot/feature-anchoring-service.ts', importOld: '@/application/services/feature-anchoring-service', importNew: '@/modules/shot/feature-anchoring-service' },
  { src: 'src/application/services/shot-reference-service.ts', dest: 'src/modules/shot/shot-reference-service.ts', importOld: '@/application/services/shot-reference-service', importNew: '@/modules/shot/shot-reference-service' },
  { src: 'src/application/services/reference-check-service.ts', dest: 'src/modules/shot/reference-check-service.ts', importOld: '@/application/services/reference-check-service', importNew: '@/modules/shot/reference-check-service' },
  { src: 'src/application/services/video-cache-service.ts', dest: 'src/modules/video/video-cache-service.ts', importOld: '@/application/services/video-cache-service', importNew: '@/modules/video/video-cache-service' },
  { src: 'src/application/services/video-recovery-service.ts', dest: 'src/modules/video/video-recovery-service.ts', importOld: '@/application/services/video-recovery-service', importNew: '@/modules/video/video-recovery-service' },
  { src: 'src/application/services/import-export-service.ts', dest: 'src/modules/asset/import-export-service.ts', importOld: '@/application/services/import-export-service', importNew: '@/modules/asset/import-export-service' },
  { src: 'src/application/services/media-asset-service.ts', dest: 'src/modules/asset/media-asset-service.ts', importOld: '@/application/services/media-asset-service', importNew: '@/modules/asset/media-asset-service' },
];

for (const m of serviceMigrations) {
  if (!fs.existsSync(m.src)) {
    console.log('SKIP: ' + m.src);
    continue;
  }
  const destDir = path.dirname(m.dest);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(m.src, m.dest);
  console.log('Copied: ' + m.src + ' -> ' + m.dest);

  function updateImports(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== 'dist') {
          updateImports(fullPath);
        }
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        let content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes(m.importOld)) {
          content = content.split(m.importOld).join(m.importNew);
          fs.writeFileSync(fullPath, content);
        }
      }
    }
  }
  updateImports('src');
  console.log('Updated: ' + m.importOld + ' -> ' + m.importNew);
}

console.log('\nAll service migrations done!');
