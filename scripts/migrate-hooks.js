const fs = require('fs');
const path = require('path');

const hookMigrations = [
  { src: 'src/application/hooks/use-characters.ts', dest: 'src/modules/character/use-characters.ts', importOld: '@/application/hooks/use-characters', importNew: '@/modules/character/use-characters' },
  { src: 'src/application/hooks/use-scenes.ts', dest: 'src/modules/scene/use-scenes.ts', importOld: '@/application/hooks/use-scenes', importNew: '@/modules/scene/use-scenes' },
  { src: 'src/application/hooks/use-stories.ts', dest: 'src/modules/story/use-stories.ts', importOld: '@/application/hooks/use-stories', importNew: '@/modules/story/use-stories' },
  { src: 'src/application/hooks/use-video-tasks.ts', dest: 'src/modules/video/use-video-tasks.ts', importOld: '@/application/hooks/use-video-tasks', importNew: '@/modules/video/use-video-tasks' },
  { src: 'src/application/hooks/use-video-cache.ts', dest: 'src/modules/video/use-video-cache.ts', importOld: '@/application/hooks/use-video-cache', importNew: '@/modules/video/use-video-cache' },
  { src: 'src/application/hooks/use-import-export.ts', dest: 'src/modules/asset/use-import-export.ts', importOld: '@/application/hooks/use-import-export', importNew: '@/modules/asset/use-import-export' },
  { src: 'src/application/hooks/use-media-assets.ts', dest: 'src/modules/asset/use-media-assets.ts', importOld: '@/application/hooks/use-media-assets', importNew: '@/modules/asset/use-media-assets' },
];

for (const m of hookMigrations) {
  if (!fs.existsSync(m.src)) { console.log('SKIP: ' + m.src); continue; }
  const destDir = path.dirname(m.dest);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(m.src, m.dest);
  console.log('Copied: ' + m.src + ' -> ' + m.dest);
  function updateImports(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== 'dist') updateImports(fullPath);
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
console.log('\nAll hook migrations done!');
