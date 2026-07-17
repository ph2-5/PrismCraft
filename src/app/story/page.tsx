/**
 * Task 2A.6 — /story 页面入口
 *
 * 从 ComingSoon 占位页替换为 <StoryPipelineShell />。
 * 完成导入后（onComplete）导航到 /storyboard。
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { StoryPipelineShell } from "@/modules/novel";

export default function StoryPage() {
  const navigate = useNavigate();

  const handleComplete = useCallback(() => {
    // 导入完成后导航到故事板页面
    navigate("/storyboard");
  }, [navigate]);

  return <StoryPipelineShell onComplete={handleComplete} />;
}
