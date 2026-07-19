/**
 * Task 2A.13 v5.3 增强 — 镜头契约编辑面板
 *
 * 表格形式展示 ShotContract[]，每行可编辑景别/镜头/运动/灯光/时长/站位动作。
 *
 * - 顶部：标题 + 描述 + 统计（契约总数 / 关联节点数 / 总时长）
 * - 中部：可编辑表格（受控）— 用户修改后通过 onChange 回调上传新 contracts
 * - 空状态：未生成时显示 EmptyState
 *
 * 此组件为纯展示组件，所有状态由父组件通过 props 传入。
 * 不接入 useNovelPipeline（与 StructureAnalysisPanel 同理，
 *   完整流程接入由 Task 2A.16 三档模式实现）。
 */

import { useMemo } from "react";
import { Clapperboard, Clock, Film } from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import type { NarrativeBeat } from "../structure/domain/narrative-beats";
import type { ShotContract, ShotLighting, ShotMovement, ShotSize } from "../structure/domain/shot-contract";
import {
  SHOT_LIGHTINGS,
  SHOT_MOVEMENTS,
  SHOT_SIZES,
  clampDuration,
} from "../structure/domain/shot-contract";

// ============================================================================
// 类型与常量
// ============================================================================

export interface ShotContractPanelProps {
  /** 镜头契约列表（为空时显示 EmptyState） */
  contracts: ShotContract[];
  /** 关联的 beats（用于显示 beat 标题） */
  beats: NarrativeBeat[];
  /** contracts 变化回调（用户编辑后触发） */
  onChange?: (contracts: ShotContract[]) => void;
  /** 是否禁用编辑（用于只读模式） */
  readOnly?: boolean;
}

/** 景别 → i18n 键 */
const SHOT_SIZE_LABEL_KEY: Record<ShotSize, string> = {
  extreme_wide: "novel.structure.shotSize.extreme_wide",
  wide: "novel.structure.shotSize.wide",
  medium: "novel.structure.shotSize.medium",
  close_up: "novel.structure.shotSize.close_up",
  extreme_close_up: "novel.structure.shotSize.extreme_close_up",
};

/** 运动 → i18n 键 */
const SHOT_MOVEMENT_LABEL_KEY: Record<ShotMovement, string> = {
  static: "novel.structure.shotMovement.static",
  pan: "novel.structure.shotMovement.pan",
  tilt: "novel.structure.shotMovement.tilt",
  dolly: "novel.structure.shotMovement.dolly",
  handheld: "novel.structure.shotMovement.handheld",
  tracking: "novel.structure.shotMovement.tracking",
};

/** 灯光 → i18n 键 */
const SHOT_LIGHTING_LABEL_KEY: Record<ShotLighting, string> = {
  natural: "novel.structure.shotLighting.natural",
  low_key: "novel.structure.shotLighting.low_key",
  high_key: "novel.structure.shotLighting.high_key",
  golden_hour: "novel.structure.shotLighting.golden_hour",
  neon: "novel.structure.shotLighting.neon",
};

// ============================================================================
// 子组件：表格行
// ============================================================================

interface ShotRowProps {
  contract: ShotContract;
  beatTitle: string;
  readOnly: boolean;
  onChange: (updated: ShotContract) => void;
}

function ShotRow({ contract, beatTitle, readOnly, onChange }: ShotRowProps) {
  return (
    <tr className="border-b border-border hover:bg-[rgba(var(--primary-rgb),0.02)]">
      {/* 序号 */}
      <td className="px-2 py-1.5 text-[11px] font-bold text-muted-foreground whitespace-nowrap">
        #{contract.shotNumber}
      </td>
      {/* 节点 */}
      <td className="px-2 py-1.5 text-[11px] whitespace-nowrap max-w-[120px] truncate" title={beatTitle}>
        {beatTitle}
      </td>
      {/* 景别 */}
      <td className="px-2 py-1.5">
        {readOnly ? (
          <span className="text-[11px]">{t(SHOT_SIZE_LABEL_KEY[contract.shotSize])}</span>
        ) : (
          <select
            value={contract.shotSize}
            onChange={(e) => onChange({ ...contract, shotSize: e.target.value as ShotSize })}
            className="input text-[11px] px-1 py-0.5 w-full"
            aria-label={t("novel.structure.shotColSize")}
          >
            {SHOT_SIZES.map((s) => (
              <option key={s} value={s}>
                {t(SHOT_SIZE_LABEL_KEY[s])}
              </option>
            ))}
          </select>
        )}
      </td>
      {/* 镜头 */}
      <td className="px-2 py-1.5">
        {readOnly ? (
          <span className="text-[11px] font-mono">{contract.lens}</span>
        ) : (
          <input
            type="text"
            value={contract.lens}
            onChange={(e) => onChange({ ...contract, lens: e.target.value })}
            className="input text-[11px] px-1 py-0.5 w-full font-mono"
            aria-label={t("novel.structure.shotColLens")}
          />
        )}
      </td>
      {/* 运动 */}
      <td className="px-2 py-1.5">
        {readOnly ? (
          <span className="text-[11px]">{t(SHOT_MOVEMENT_LABEL_KEY[contract.movement])}</span>
        ) : (
          <select
            value={contract.movement}
            onChange={(e) => onChange({ ...contract, movement: e.target.value as ShotMovement })}
            className="input text-[11px] px-1 py-0.5 w-full"
            aria-label={t("novel.structure.shotColMovement")}
          >
            {SHOT_MOVEMENTS.map((m) => (
              <option key={m} value={m}>
                {t(SHOT_MOVEMENT_LABEL_KEY[m])}
              </option>
            ))}
          </select>
        )}
      </td>
      {/* 灯光 */}
      <td className="px-2 py-1.5">
        {readOnly ? (
          <span className="text-[11px]">{t(SHOT_LIGHTING_LABEL_KEY[contract.lighting])}</span>
        ) : (
          <select
            value={contract.lighting}
            onChange={(e) => onChange({ ...contract, lighting: e.target.value as ShotLighting })}
            className="input text-[11px] px-1 py-0.5 w-full"
            aria-label={t("novel.structure.shotColLighting")}
          >
            {SHOT_LIGHTINGS.map((l) => (
              <option key={l} value={l}>
                {t(SHOT_LIGHTING_LABEL_KEY[l])}
              </option>
            ))}
          </select>
        )}
      </td>
      {/* 时长 */}
      <td className="px-2 py-1.5">
        {readOnly ? (
          <span className="text-[11px] text-muted-foreground">
            {contract.duration.toFixed(1)}s
          </span>
        ) : (
          <input
            type="number"
            min={2}
            max={30}
            step={0.5}
            value={contract.duration}
            onChange={(e) =>
              onChange({
                ...contract,
                duration: clampDuration(parseFloat(e.target.value) || 2),
              })
            }
            className="input text-[11px] px-1 py-0.5 w-16"
            aria-label={t("novel.structure.shotColDuration")}
          />
        )}
      </td>
      {/* 站位/动作 */}
      <td className="px-2 py-1.5">
        {readOnly ? (
          <span className="text-[11px] text-muted-foreground line-clamp-2">
            {contract.blocking}
          </span>
        ) : (
          <input
            type="text"
            value={contract.blocking}
            onChange={(e) => onChange({ ...contract, blocking: e.target.value })}
            className="input text-[11px] px-1 py-0.5 w-full"
            aria-label={t("novel.structure.shotColBlocking")}
          />
        )}
      </td>
    </tr>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function ShotContractPanel({
  contracts,
  beats,
  onChange,
  readOnly = false,
}: ShotContractPanelProps) {
  // beatId → beat 标题映射
  const beatTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const beat of beats) {
      map.set(beat.id, beat.title);
    }
    return map;
  }, [beats]);

  // 统计
  const stats = useMemo(() => {
    const total = contracts.length;
    const beatIds = new Set(contracts.map((c) => c.beatId));
    const totalDuration = contracts.reduce((sum, c) => sum + c.duration, 0);
    return { total, beatCount: beatIds.size, totalDuration };
  }, [contracts]);

  // 行变更
  const handleRowChange = (updated: ShotContract) => {
    if (!onChange) return;
    const newContracts = contracts.map((c) => (c.id === updated.id ? updated : c));
    onChange(newContracts);
  };

  // 空状态
  if (contracts.length === 0) {
    return (
      <div className="flex flex-col gap-3 max-w-5xl mx-auto w-full">
        <EmptyState
          icon={Film}
          title={t("novel.structure.shotContractEmpty")}
          hint={t("novel.structure.shotContractEmptyHint")}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-w-5xl mx-auto w-full">
      {/* 顶部标题 + 统计 */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <div className="text-[14px] font-bold flex items-center gap-1.5">
            <Clapperboard size={14} className="text-[var(--primary)]" />
            {t("novel.structure.shotContractTitle")}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t("novel.structure.beatCount", { count: stats.total })}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">{t("novel.structure.shotColBeat")}：</span>
            <span className="font-bold">{stats.beatCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={11} className="text-muted-foreground" />
            <span className="text-muted-foreground">{t("novel.finalize.estimatedTotalDuration")}</span>
            <span className="font-bold">{stats.totalDuration.toFixed(1)}s</span>
          </div>
        </div>
      </div>

      {/* 描述 */}
      <div className="text-[11px] text-muted-foreground px-1">
        {t("novel.structure.shotContractDesc")}
      </div>

      {/* 表格 */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground text-left whitespace-nowrap">
                {t("novel.structure.shotColNumber")}
              </th>
              <th className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground text-left whitespace-nowrap">
                {t("novel.structure.shotColBeat")}
              </th>
              <th className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground text-left whitespace-nowrap">
                {t("novel.structure.shotColSize")}
              </th>
              <th className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground text-left whitespace-nowrap">
                {t("novel.structure.shotColLens")}
              </th>
              <th className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground text-left whitespace-nowrap">
                {t("novel.structure.shotColMovement")}
              </th>
              <th className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground text-left whitespace-nowrap">
                {t("novel.structure.shotColLighting")}
              </th>
              <th className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground text-left whitespace-nowrap">
                {t("novel.structure.shotColDuration")}
              </th>
              <th className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground text-left whitespace-nowrap">
                {t("novel.structure.shotColBlocking")}
              </th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((contract) => (
              <ShotRow
                key={contract.id}
                contract={contract}
                beatTitle={beatTitleMap.get(contract.beatId) ?? "-"}
                readOnly={readOnly}
                onChange={handleRowChange}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
