const fs = require('fs');
const path = require('path');

const componentMigrations = [
  { src: 'src/components/story', dest: 'src/modules/story/presentation', importOld: '@/components/story', importNew: '@/modules/story/presentation' },
  { src: 'src/components/sync', dest: 'src/modules/sync/presentation', importOld: '@/components/sync', importNew: '@/modules/sync/presentation' },
  { src: 'src/components/VideoTaskManager', dest: 'src/modules/video/presentation/video-task-manager', importOld: '@/components/VideoTaskManager', importNew: '@/modules/video/presentation/video-task-manager' },
  { src: 'src/components/ui', dest: 'src/shared/ui', importOld: '@/components/ui', importNew: '@/shared/ui' },
  { src: 'src/components/VideoTaskManager.tsx', dest: 'src/modules/video/presentation/VideoTaskManager.tsx', importOld: null },
  { src: 'src/components/VideoTaskManagerInitializer.tsx', dest: 'src/modules/video/presentation/VideoTaskManagerInitializer.tsx', importOld: null },
  { src: 'src/components/MediaExporter.tsx', dest: 'src/modules/asset/presentation/MediaExporter.tsx', importOld: null },
  { src: 'src/components/ProjectExportImport.tsx', dest: 'src/modules/asset/presentation/ProjectExportImport.tsx', importOld: null },
  { src: 'src/components/BatchOperations.tsx', dest: 'src/modules/asset/presentation/BatchOperations.tsx', importOld: null },
  { src: 'src/components/ModelSelector.tsx', dest: 'src/infrastructure/ai-providers/presentation/ModelSelector.tsx', importOld: null },
  { src: 'src/components/ConfigCheckBanner.tsx', dest: 'src/infrastructure/ai-providers/presentation/ConfigCheckBanner.tsx', importOld: null },
  { src: 'src/components/NetworkStatusAlert.tsx', dest: 'src/shared/presentation/NetworkStatusAlert.tsx', importOld: null },
  { src: 'src/components/ErrorBoundary.tsx', dest: 'src/shared/presentation/ErrorBoundary.tsx', importOld: null },
  { src: 'src/components/PageErrorBoundary.tsx', dest: 'src/shared/presentation/PageErrorBoundary.tsx', importOld: null },
  { src: 'src/components/BeforeUnloadGuard.tsx', dest: 'src/shared/presentation/BeforeUnloadGuard.tsx', importOld: null },
  { src: 'src/components/Sidebar.tsx', dest: 'src/shared/presentation/Sidebar.tsx', importOld: null },
  { src: 'src/components/Toast.tsx', dest: 'src/shared/presentation/Toast.tsx', importOld: null },
  { src: 'src/components/SearchDialog.tsx', dest: 'src/shared/presentation/SearchDialog.tsx', importOld: null },
  { src: 'src/components/navigation.tsx', dest: 'src/shared/presentation/navigation.tsx', importOld: null },
  { src: 'src/components/GlobalSettings.tsx', dest: 'src/shared/presentation/GlobalSettings.tsx', importOld: null },
  { src: 'src/components/MigrationInitializer.tsx', dest: 'src/shared/presentation/MigrationInitializer.tsx', importOld: null },
  { src: 'src/components/VirtualList.tsx', dest: 'src/shared/presentation/VirtualList.tsx', importOld: null },
  { src: 'src/components/onboarding.tsx', dest: 'src/shared/presentation/onboarding.tsx', importOld: null },
  { src: 'src/components/DebugOverlay.tsx', dest: 'src/shared/presentation/DebugOverlay.tsx', importOld: null },
  { src: 'src/components/MemoryMonitorPanel.tsx', dest: 'src/shared/presentation/MemoryMonitorPanel.tsx', importOld: null },
  { src: 'src/components/PerformanceMonitorPanel.tsx', dest: 'src/shared/presentation/PerformanceMonitorPanel.tsx', importOld: null },
  { src: 'src/components/CrashRecoveryDialog.tsx', dest: 'src/shared/presentation/CrashRecoveryDialog.tsx', importOld: null },
];

for (const m of componentMigrations) {
  if (!fs.existsSync(m.src)) { console.log('SKIP: ' + m.src); continue; }
  const destDir = path.dirname(m.dest);
  fs.mkdirSync(destDir, { recursive: true });
  if (fs.statSync(m.src).isDirectory()) {
    const entries = fs.readdirSync(m.src);
    for (const entry of entries) {
      const srcFile = path.join(m.src, entry);
      const destFile = path.join(m.dest, entry);
      try {
        if (fs.existsSync(srcFile) && fs.statSync(srcFile).isFile()) {
          fs.copyFileSync(srcFile, destFile);
        }
      } catch(e) {
        console.log('SKIP file: ' + srcFile);
      }
    }
  } else {
    try {
      fs.copyFileSync(m.src, m.dest);
    } catch(e) {
      console.log('SKIP (error): ' + m.src);
      continue;
    }
  }
  console.log('Copied: ' + m.src + ' -> ' + m.dest);

  if (m.importOld) {
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
}

console.log('\nAll component migrations done!');
