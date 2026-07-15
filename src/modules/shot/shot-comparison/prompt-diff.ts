/**
 * 提示词 diff 工具（Task 4.4）
 *
 * 实现简单的逐行 diff 算法（LCS 最长公共子序列）
 * 用于对比两个版本的提示词差异
 */

import type { DiffLine } from "./types";

/**
 * 计算两个文本的逐行 diff
 *
 * 算法：LCS（最长公共子序列）动态规划
 * 时间复杂度 O(n*m)，适合提示词这种短文本
 */
export function diffText(left: string, right: string): DiffLine[] {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const n = leftLines.length;
  const m = rightLines.length;

  // LCS DP 表
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const leftLine = leftLines[i - 1];
      const rightLine = rightLines[j - 1];
      if (leftLine !== undefined && rightLine !== undefined && leftLine === rightLine) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // 回溯生成 diff
  const result: DiffLine[] = [];
  let i = n;
  let j = m;
  let leftLineNum = n;
  let rightLineNum = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const leftLine = leftLines[i - 1];
      const rightLine = rightLines[j - 1];
      if (leftLine !== undefined && rightLine !== undefined && leftLine === rightLine) {
        result.unshift({
          text: leftLine,
          type: "same",
          leftLine: leftLineNum,
          rightLine: rightLineNum,
        });
        i--;
        j--;
        leftLineNum--;
        rightLineNum--;
      } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
        result.unshift({
          text: leftLines[i - 1] ?? "",
          type: "left",
          leftLine: leftLineNum,
        });
        i--;
        leftLineNum--;
      } else {
        result.unshift({
          text: rightLines[j - 1] ?? "",
          type: "right",
          rightLine: rightLineNum,
        });
        j--;
        rightLineNum--;
      }
    } else if (i > 0) {
      result.unshift({
        text: leftLines[i - 1] ?? "",
        type: "left",
        leftLine: leftLineNum,
      });
      i--;
      leftLineNum--;
    } else {
      result.unshift({
        text: rightLines[j - 1] ?? "",
        type: "right",
        rightLine: rightLineNum,
      });
      j--;
      rightLineNum--;
    }
  }

  return result;
}

/**
 * 统计 diff 的差异行数
 */
export function countDifferences(diff: DiffLine[]): {
  added: number;
  removed: number;
  unchanged: number;
} {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const line of diff) {
    if (line.type === "right") added++;
    else if (line.type === "left") removed++;
    else unchanged++;
  }
  return { added, removed, unchanged };
}
