const fs = require('fs');
const path = require('path');

const singleFileImportMigrations = [
  { importOld: '@/components/VideoTaskManager', importNew: '@/modules/video/presentation/VideoTaskManager' },
  { importOld: '@/components/VideoTaskManagerInitializer', importNew: '@/modules/video/presentation/VideoTaskManagerInitializer' },
  { importOld: '@/components/MediaExporter', importNew: '@/modules/asset/presentation/MediaExporter' },
  { importOld: '@/components/ProjectExportImport', importNew: '@/modules/asset/presentation/ProjectExportImport' },
  { importOld: '@/components/BatchOperations', importNew: '@/modules/asset/presentation/BatchOperations' },
  { importOld: '@/components/ModelSelector', importNew: '@/infrastructure/ai-providers/presentation/ModelSelector' },
  { importOld: '@/components/ConfigCheckBanner', importNew: '@/infrastructure/ai-providers/presentation/ConfigCheckBanner' },
  { importOld: '@/components/NetworkStatusAlert', importNew: '@/shared/presentation/NetworkStatusAlert' },
  { importOld: '@/components/ErrorBoundary', importNew: '@/shared/presentation/ErrorBoundary' },
  { importOld: '@/components/PageErrorBoundary', importNew: '@/shared/presentation/PageErrorBoundary' },
  { importOld: '@/components/BeforeUnloadGuard', importNew: '@/shared/presentation/BeforeUnloadGuard' },
  { importOld: '@/components/Sidebar', importNew: '@/shared/presentation/Sidebar' },
  { importOld: '@/components/Toast', importNew: '@/shared/presentation/Toast' },
  { importOld: '@/components/SearchDialog', importNew: '@/shared/presentation/SearchDialog' },
  { importOld: '@/components/navigation', importNew: '@/shared/presentation/navigation' },
  { importOld: '@/components/GlobalSettings', importNew: '@/shared/presentation/GlobalSettings' },
  { importOld: '@/components/MigrationInitializer', importNew: '@/shared/presentation/MigrationInitializer' },
  { importOld: '@/components/VirtualList', importNew: '@/shared/presentation/VirtualList' },
  { importOld: '@/components/onboarding', importNew: '@/shared/presentation/onboarding' },
  { importOld: '@/components/DebugOverlay', importNew: '@/shared/presentation/DebugOverlay' },
  { importOld: '@/components/MemoryMonitorPanel', importNew: '@/shared/presentation/MemoryMonitorPanel' },
  { importOld: '@/components/PerformanceMonitorPanel', importNew: '@/shared/presentation/PerformanceMonitorPanel' },
  { importOld: '@/components/CrashRecoveryDialog', importNew: '@/shared/presentation/CrashRecoveryDialog' },
];

function updateImports(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== 'dist' && entry.name !== 'components') {
        updateImports(fullPath);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let modified = false;
      for (const m of singleFileImportMigrations) {
        if (content.includes(m.importOld)) {
          content = content.split(m.importOld).join(m.importNew);
          modified = true;
        }
      }
      if (modified) {
        fs.writeFileSync(fullPath, content);
        console.log('Updated: ' + path.relative('.', fullPath));
      }
    }
  }
}

updateImports('src');
console.log('\nAll single-file import updates done!');
