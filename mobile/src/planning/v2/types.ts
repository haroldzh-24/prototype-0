import type { StageDocument } from '../../stage/model';
import type { EngagementRules, FiringArea } from '../engagements';

export type Point = Readonly<{ x: number; y: number }>;
export type Ruleset = 'USPSA' | 'PCSL' | 'IDPA';

/** Everything the planner may read. It never reads camera, profile, timing or scoring data. */
export type StageSnapshot = {
  stage: StageDocument;
  firingAreas: readonly FiringArea[];
  /** Per-target restrictions from the stage brief (allowed areas). */
  targetProcedures?: EngagementRules['targetProcedures'];
  ruleset?: Ruleset;
};

export type PlanRouteOptions = {
  /** Ruleset whose occlusion and wall-height rules apply. Default: snapshot ruleset, else USPSA. */
  ruleset?: Ruleset;
  /** Grid spacing for candidate shooting positions, inches. Default 12. */
  candidateSpacingInches?: number;
  /** Upper bound on candidate positions after sampling. Default 1500. */
  maxCandidates?: number;
  /** Body clearance from walls and target stands, inches. Default 6. */
  clearanceInches?: number;
  /** Safe direction override, degrees (stage plane). Default: the stage's downrange. Route settings pass theirs. */
  downrangeDegrees?: number;
  /** Half of the safe muzzle arc around downrange, degrees. Default 90 (the 180-degree plane). */
  safeHalfAngleDegrees?: number;
  /** Engagements closer than this to the safe-angle limit are flagged, degrees. Default 10. */
  nearSafeAngleMarginDegrees?: number;
  /** How no-shoots and other target faces affect line of sight. Default by ruleset (USPSA/PCSL occlude, IDPA warn). */
  noShootPolicy?: 'occlude' | 'warn';
  /** Whether travel may leave firing areas. Default 'anywhere' (moving outside without firing is not penalized). */
  travel?: 'anywhere' | 'within-areas';
  /** Treat target stands as obstacles for movement. Default true. */
  targetsBlockTravel?: boolean;
  /** Slide stops below grid resolution after the search (never loosening safety margins). Default true. */
  refine?: boolean;
  /** Representative points kept per distinct coverage set for the distance search. Default 4. */
  representativesPerCoverage?: number;
  /** Search budget for each search phase (minimum cover, then the walk), nodes. Default 200000. Deterministic. */
  maxSearchNodes?: number;
  /**
   * Wall-clock guard for each search phase, ms. Default 3000. When reached, the best result so far is returned and
   * flagged (`diagnostics.stoppedBy = 'time'`); only then can the result depend on device speed.
   */
  maxSearchMs?: number;
};

export type ReasonCode = 'NO_ALLOWED_AREA' | 'IDPA_AREAS_REQUIRED' | 'OUTSIDE_SAFE_ANGLE' | 'OCCLUDED' | 'UNREACHABLE' | 'PROCEDURE_ORDER';

export type PlannedEngagement = {
  targetId: string;
  /** 1-based order at this position. */
  order: number;
  /** Fraction of sampled face points visible from the position, 0..1. */
  visibleFraction: number;
  /** Degrees between the most extreme face direction and the safe-angle limit. */
  safeMarginDegrees: number;
  nearSafeAngle: boolean;
  /** IDPA policy: the line of sight passes through a non-threat (penalty risk). */
  throughNoShoot: boolean;
  /** USPSA/PCSL: visible only over a wall lower than 69 in (an assumption). */
  overLowWall: boolean;
};

export type PlannedPosition = { id: string; point: Point; engagements: PlannedEngagement[]; engageableTargetIds: string[] };

export type TargetReport = { targetId: string; status: 'covered' | 'uncovered'; reasons: ReasonCode[]; positionId?: string; legalCandidateCount: number };

export type RoutePlan = {
  version: 2;
  status: 'complete' | 'partial' | 'infeasible' | 'no-targets' | 'invalid-input';
  start: Point | null;
  positions: PlannedPosition[];
  /** legs[i] is the walking path (polyline, inches) from the previous stop (or start) to positions[i]. */
  legs: Point[][];
  movementInches: number;
  targets: TargetReport[];
  safety: { downrangeDegrees: number; safeHalfAngleDegrees: number; checked: string[]; notChecked: string[]; nearSafeAngle: { targetId: string; positionId: string; marginDegrees: number }[] };
  assumptions: string[];
  warnings: string[];
  errors: string[];
  diagnostics: {
    candidateCount: number; distinctCoverageSets: number; minimumPositions: number | null;
    exactPositions: boolean;
    /** True when the walk is provably shortest among the sampled candidates (before refinement). */
    exactDistance: boolean;
    /** Inches saved by sliding stops below grid resolution after the search. */
    refinedInches?: number;
    searchNodes: number; durationMs: number; truncatedCandidates: boolean;
    /** Why a search phase stopped early, if it did. */
    stoppedBy: 'nodes' | 'time' | null;
  };
};
