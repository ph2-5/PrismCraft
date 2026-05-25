const fs = require('fs');
const path = require('path');

const fileMigrations = [
  { src: 'src/lib/api-cache.ts', dest: 'src/infrastructure/ai-providers/api-cache.ts', importOld: '@/lib/api-cache', importNew: '@/infrastructure/ai-providers/api-cache' },
  { src: 'src/lib/db.ts', dest: 'src/infrastructure/storage/db.ts', importOld: '@/lib/db', importNew: '@/infrastructure/storage/db' },
  { src: 'src/lib/image-normalization.ts', dest: 'src/infrastructure/ai-providers/image-normalization.ts', importOld: '@/lib/image-normalization', importNew: '@/infrastructure/ai-providers/image-normalization' },
  { src: 'src/lib/model-capabilities.ts', dest: 'src/infrastructure/ai-providers/model-capabilities.ts', importOld: '@/lib/model-capabilities', importNew: '@/infrastructure/ai-providers/model-capabilities' },
  { src: 'src/lib/offline-queue.ts', dest: 'src/infrastructure/ai-providers/offline-queue.ts', importOld: '@/lib/offline-queue', importNew: '@/infrastructure/ai-providers/offline-queue' },
  { src: 'src/lib/platform.ts', dest: 'src/shared/utils/platform.ts', importOld: '@/lib/platform', importNew: '@/shared/utils/platform' },
  { src: 'src/lib/secureStorage.ts', dest: 'src/infrastructure/secure-storage.ts', importOld: '@/lib/secureStorage', importNew: '@/infrastructure/secure-storage' },
  { src: 'src/lib/performance.ts', dest: 'src/shared/utils/performance.ts', importOld: '@/lib/performance', importNew: '@/shared/utils/performance' },
  { src: 'src/lib/utils.ts', dest: 'src/shared/utils/utils.ts', importOld: '@/lib/utils', importNew: '@/shared/utils/utils' },
  { src: 'src/lib/story-constants.ts', dest: 'src/modules/story/story-constants.ts', importOld: '@/lib/story-constants', importNew: '@/modules/story/story-constants' },
  { src: 'src/lib/story-templates.ts', dest: 'src/modules/story/story-templates.ts', importOld: '@/lib/story-templates', importNew: '@/modules/story/story-templates' },
  { src: 'src/lib/storyboard-generation.ts', dest: 'src/modules/story/storyboard-generation.ts', importOld: '@/lib/storyboard-generation', importNew: '@/modules/story/storyboard-generation' },
  { src: 'src/lib/storyboard-template.ts', dest: 'src/modules/story/storyboard-template.ts', importOld: '@/lib/storyboard-template', importNew: '@/modules/story/storyboard-template' },
  { src: 'src/lib/version-control.ts', dest: 'src/modules/story/version-control.ts', importOld: '@/lib/version-control', importNew: '@/modules/story/version-control' },
  { src: 'src/lib/video-cache.ts', dest: 'src/modules/video/video-cache.ts', importOld: '@/lib/video-cache', importNew: '@/modules/video/video-cache' },
  { src: 'src/lib/video-codec.ts', dest: 'src/modules/video/video-codec.ts', importOld: '@/lib/video-codec', importNew: '@/modules/video/video-codec' },
  { src: 'src/lib/video-export.ts', dest: 'src/modules/video/video-export.ts', importOld: '@/lib/video-export', importNew: '@/modules/video/video-export' },
  { src: 'src/lib/video-frame-extractor.ts', dest: 'src/modules/video/video-frame-extractor.ts', importOld: '@/lib/video-frame-extractor', importNew: '@/modules/video/video-frame-extractor' },
  { src: 'src/lib/video-recovery.ts', dest: 'src/modules/video/video-recovery.ts', importOld: '@/lib/video-recovery', importNew: '@/modules/video/video-recovery' },
  { src: 'src/lib/video-templates.ts', dest: 'src/modules/video/video-templates.ts', importOld: '@/lib/video-templates', importNew: '@/modules/video/video-templates' },
  { src: 'src/lib/video-tracker.ts', dest: 'src/modules/video/video-tracker.ts', importOld: '@/lib/video-tracker', importNew: '@/modules/video/video-tracker' },
  { src: 'src/lib/useVideoTaskManager.ts', dest: 'src/modules/video/use-video-task-manager.ts', importOld: '@/lib/useVideoTaskManager', importNew: '@/modules/video/use-video-task-manager' },
  { src: 'src/lib/useProjectExport.ts', dest: 'src/modules/asset/use-project-export.ts', importOld: '@/lib/useProjectExport', importNew: '@/modules/asset/use-project-export' },
  { src: 'src/lib/asset-library.ts', dest: 'src/modules/asset/asset-library.ts', importOld: '@/lib/asset-library', importNew: '@/modules/asset/asset-library' },
  { src: 'src/lib/useDirtyState.ts', dest: 'src/shared/hooks/use-dirty-state.ts', importOld: '@/lib/useDirtyState', importNew: '@/shared/hooks/use-dirty-state' },
  { src: 'src/lib/useMemoryMonitor.ts', dest: 'src/shared/hooks/use-memory-monitor.ts', importOld: '@/lib/useMemoryMonitor', importNew: '@/shared/hooks/use-memory-monitor' },
  { src: 'src/lib/useNetworkMonitor.ts', dest: 'src/shared/hooks/use-network-monitor.ts', importOld: '@/lib/useNetworkMonitor', importNew: '@/shared/hooks/use-network-monitor' },
];

for (const m of fileMigrations) {
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
  console.log('Updated imports: ' + m.importOld + ' -> ' + m.importNew);
}

console.log('\nAll file migrations done!');
