import type { StoryBeat, StoryElement } from "@/domain/schemas";
import { t } from "@/shared/constants/messages";

export interface CrossShotConsistencyInput {
  beats: StoryBeat[];
  elements: StoryElement[];
}

export interface ElementDriftReport {
  elementId: string;
  elementName: string;
  appearsInBeats: string[];
  driftScore: number;
  issues: string[];
}

export interface CrossShotConsistencyResult {
  passed: boolean;
  elementDriftReports: ElementDriftReport[];
  overallDriftScore: number;
  recommendation: "accept" | "adjust";
}

interface AnchorSnapshot {
  beatId: string;
  featureTags: string[];
  referenceImageUrl: string;
}

export function checkCrossShotConsistency(
  input: CrossShotConsistencyInput,
): CrossShotConsistencyResult {
  const { beats, elements } = input;

  // Build a map from elementId to the list of beats it appears in
  const elementBeatMap = new Map<string, string[]>();
  for (const beat of beats) {
    const elementIds = collectElementIds(beat);
    for (const elementId of elementIds) {
      const existing = elementBeatMap.get(elementId);
      if (existing) {
        existing.push(beat.id);
      } else {
        elementBeatMap.set(elementId, [beat.id]);
      }
    }
  }

  // Only check elements that appear in 2+ beats
  const multiBeatElementIds = [...elementBeatMap.entries()]
    .filter(([, beatIds]) => beatIds.length >= 2)
    .map(([elementId]) => elementId);

  if (multiBeatElementIds.length === 0) {
    return {
      passed: true,
      elementDriftReports: [],
      overallDriftScore: 0,
      recommendation: "accept",
    };
  }

  const elementMap = new Map(elements.map((el) => [el.id, el]));

  const elementDriftReports: ElementDriftReport[] = [];

  for (const elementId of multiBeatElementIds) {
    const element = elementMap.get(elementId);
    const elementName = element?.name ?? elementId;
    const appearsInBeats = elementBeatMap.get(elementId)!;

    // Collect anchor snapshots for this element across beats
    const snapshots = collectAnchorSnapshots(beats, elementId);

    const driftResult = computeDrift(elementName, snapshots);

    elementDriftReports.push({
      elementId,
      elementName,
      appearsInBeats,
      driftScore: driftResult.driftScore,
      issues: driftResult.issues,
    });
  }

  const overallDriftScore =
    elementDriftReports.reduce((sum, r) => sum + r.driftScore, 0) /
    elementDriftReports.length;

  const passed = overallDriftScore < 0.3;
  const recommendation: "accept" | "adjust" = overallDriftScore < 0.2 ? "accept" : "adjust";

  return {
    passed,
    elementDriftReports,
    overallDriftScore,
    recommendation,
  };
}

function collectElementIds(beat: StoryBeat): string[] {
  const ids = new Set<string>();

  if (beat.elementIds) {
    for (const id of beat.elementIds) {
      ids.add(id);
    }
  }

  if (beat.elementBindings) {
    for (const id of Object.keys(beat.elementBindings)) {
      ids.add(id);
    }
  }

  return [...ids];
}

function collectAnchorSnapshots(
  beats: StoryBeat[],
  elementId: string,
): AnchorSnapshot[] {
  const snapshots: AnchorSnapshot[] = [];

  for (const beat of beats) {
    if (!beat.featureAnchoring?.enabled) continue;

    const allAnchors = [
      ...(beat.featureAnchoring.characterAnchors || []),
      ...(beat.featureAnchoring.propAnchors || []),
    ];

    const anchor = allAnchors.find((a) => a.elementId === elementId);
    if (anchor) {
      snapshots.push({
        beatId: beat.id,
        featureTags: anchor.featureTags ?? [],
        referenceImageUrl: anchor.referenceImageUrl ?? "",
      });
    }
  }

  return snapshots;
}

function computeDrift(
  elementName: string,
  snapshots: AnchorSnapshot[],
): { driftScore: number; issues: string[] } {
  if (snapshots.length < 2) {
    return { driftScore: 0, issues: [] };
  }

  const issues: string[] = [];
  let driftScore = 0;

  // Check featureTags consistency
  const tagsSets = snapshots.map((s) => s.featureTags);
  const tagsConsistent = areAllEqual(tagsSets);
  if (!tagsConsistent) {
    driftScore += 0.3;
    issues.push(t("crossShot.featureDrift", { name: elementName }));
  }

  // Check referenceImageUrl consistency
  const urls = snapshots.map((s) => s.referenceImageUrl);
  const urlsConsistent = areAllStringsEqual(urls);
  if (!urlsConsistent) {
    driftScore += 0.2;
    issues.push(t("crossShot.referenceDrift", { name: elementName }));
  }

  // Both inconsistent → extra penalty
  if (!tagsConsistent && !urlsConsistent) {
    driftScore = 0.5;
  }

  return { driftScore, issues };
}

function areAllEqual(arrays: string[][]): boolean {
  if (arrays.length <= 1) return true;
  const first = [...arrays[0]!].sort().join(",");
  return arrays.every((a) => [...a].sort().join(",") === first);
}

function areAllStringsEqual(strings: string[]): boolean {
  if (strings.length <= 1) return true;
  const first = strings[0]!;
  return strings.every((s) => s === first);
}
