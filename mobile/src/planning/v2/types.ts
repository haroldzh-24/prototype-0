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
  /**
   * Plan engagements on the move: drop a stop when every target it would cover can be engaged legally from the walking
   * path that replaces it, and report how far before each remaining stop its targets can already be engaged.
   * Not planned for IDPA (cover rules are not modelled). Default false; the app passes the route's setting.
   */
  moving?: boolean;
  /** Legal walking needed per target engaged on the move, inches. A geometric threshold, not timing. Default 36. */
  minMovingWindowInches?: number;
  /** Slide stops below grid resolution after the search (never loosening safety margins). Default true. */
  refine?: boolean;
  /** Representative points kept per distinct coverage set for the distance search. Default 4. */
  representativesPerCoverage?: number;
  /** Search budget for each search phase (minimum cover, then the walk), nodes. Default 200000. Deterministic. */
  maxSearchNodes?: number;
  /**
   * Minimum distance from a shooting position to any steel target it engages, inches. Default by ruleset:
   * USPSA 276 (23 ft, rule 10.5.16), PCSL 252 (7 yd for pistol, rule 1.8.1), IDPA 360 (10 yd, rule 2.14).
   */
  steelMinDistanceInches?: number;
  /**
   * Wall-clock guard for each search phase, ms. Default 3000. When reached, the best result so far is returned and
   * flagged (`diagnostics.stoppedBy = 'time'`); only then can the result depend on device speed.
   */
  maxSearchMs?: number;
};

export type ReasonCode = 'NO_ALLOWED_AREA' | 'IDPA_AREAS_REQUIRED' | 'STEEL_TOO_CLOSE' | 'OUTSIDE_SAFE_ANGLE' | 'OCCLUDED' | 'UNREACHABLE' | 'PROCEDURE_ORDER';

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
  /** Engaged on the walk into the position: where on that leg (inches along legs[i]) and the point it starts. */
  moving?: { startInches: number; endInches: number; at: Point };
  /** Standing engagements: legal walking just before the stop from which this target can already be engaged, inches. */
  approachInches?: number;
};

export type PlannedPosition = {
  id: string; point: Point;
  /** Engaged standing at the position, in order. */
  engagements: PlannedEngagement[];
  /** Engaged on the move along the leg into this position, in order, before the standing engagements. */
  movingEngagements: PlannedEngagement[];
  engageableTargetIds: string[];
};

export type TargetReport = { targetId: string; status: 'covered' | 'uncovered'; reasons: ReasonCode[]; positionId?: string; mode?: 'standing' | 'moving'; legalCandidateCount: number };

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
    /** Stops replaced by engagements on the move (the minimum-positions proof is for standing-only plans). */
    movingStopsRemoved?: number;
    /** Why a search phase stopped early, if it did. */
    stoppedBy: 'nodes' | 'time' | null;
  };
};
