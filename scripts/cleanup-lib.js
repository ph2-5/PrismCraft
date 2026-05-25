const fs = require('fs');

const filesToDelete = [
  'src/lib/api-cache.ts',
  'src/lib/asset-library.ts',
  'src/lib/db.ts',
  'src/lib/image-normalization.ts',
  'src/lib/model-capabilities.ts',
  'src/lib/offline-queue.ts',
  'src/lib/performance.ts',
  'src/lib/platform.ts',
  'src/lib/secureStorage.ts',
  'src/lib/story-constants.ts',
  'src/lib/story-templates.ts',
  'src/lib/storyboard-generation.ts',
  'src/lib/storyboard-template.ts',
  'src/lib/useDirtyState.ts',
  'src/lib/useMemoryMonitor.ts',
  'src/lib/useNetworkMonitor.ts',
  'src/lib/useProjectExport.ts',
  'src/lib/useVideoTaskManager.ts',
  'src/lib/utils.ts',
  'src/lib/version-control.ts',
  'src/lib/video-cache.ts',
  'src/lib/video-codec.ts',
  'src/lib/video-export.ts',
  'src/lib/video-frame-extractor.ts',
  'src/lib/video-recovery.ts',
  'src/lib/video-templates.ts',
  'src/lib/video-tracker.ts',
];

for (const f of filesToDelete) {
  if (fs.existsSync(f)) {
    fs.unlinkSync(f);
    console.log('Deleted: ' + f);
  }
}
console.log('Done!');
