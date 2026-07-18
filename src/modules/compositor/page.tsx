/**
 * Task 2A.9 — Compositor 路由入口
 *
 * 将 CompositorPanel 挂载到 /compositor 路由，使全局编译器可达。
 * CompositorPanel 内部通过 useCompositor hook 自管理状态。
 */
import { CompositorPanel } from ".";

export default function CompositorPage() {
  return <CompositorPanel />;
}
