import type { ShotReference, StoryBeat } from "@/domain/schemas";

/**
 * Validation result for reference operations
 */
interface ReferenceValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Port interface for ReferenceEngine operations.
 * Manages shot-to-shot references, validation, and video URL resolution.
 */
export interface IReferenceEngine {
  /**
   * Validates a shot reference for correctness and completeness.
   * @param shot - The source shot containing the reference
   * @param allShots - Complete list of all shots for cross-reference
   * @param reference - The reference configuration to validate
   * @returns Validation result indicating success or error details
   */
  validateReference(
    shot: StoryBeat,
    allShots: StoryBeat[],
    reference: ShotReference,
  ): ReferenceValidationResult;

  /**
   * Resolves the target shot based on reference configuration.
   * @param shot - The source shot containing the reference
   * @param allShots - Complete list of all shots
   * @param reference - The reference configuration
   * @returns The target StoryBeat or undefined if not found
   */
  getTargetShot(
    shot: StoryBeat,
    allShots: StoryBeat[],
    reference: ShotReference,
  ): StoryBeat | undefined;

  /**
   * Retrieves the appropriate video URL for a reference.
   * @param shot - The source shot containing the reference
   * @param allShots - Complete list of all shots
   * @param reference - The reference configuration
   * @returns Video URL or undefined if not available
   */
  getReferenceVideoUrl(
    shot: StoryBeat,
    allShots: StoryBeat[],
    reference: ShotReference,
  ): string | undefined;

  /**
   * Builds a human-readable description of a reference.
   * @param shot - The source shot containing the reference
   * @param allShots - Complete list of all shots
   * @param reference - The reference configuration
   * @returns Localized description string
   */
  buildReferenceDescription(
    shot: StoryBeat,
    allShots: StoryBeat[],
    reference: ShotReference,
  ): string;
}
