import { PositionType } from "@chorus/shared/types/basic";

function calculateEuclideanDistance(
  p1: PositionType,
  p2: PositionType
): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

interface GainParams {
  client: PositionType;
  source: PositionType;
  falloff?: number;
  minGain?: number;
  maxGain?: number;
}

export const calculateGainFromDistanceToSource = (params: GainParams) => {
  return gainFromDistanceInverse(params);
};

/**
 * Inverse-distance falloff (the same law Web Audio's own PannerNode uses),
 * normalized so a device at the grid's center-to-edge radius (25, where
 * clients sit by default) still gets a clearly audible pan across a full
 * rotation, instead of the old quadratic curve's roughly ~21% usable range
 * before clamping flat at the floor.
 *
 * minGain is a safety clamp, not a target: with refDistance=15 the curve
 * only reaches it around d≈285 (well past the grid's ~141 diagonal), so in
 * normal play it never fires — it exists only to guard extreme or
 * out-of-bounds coordinates from ever going silent.
 */
export function gainFromDistanceInverse({
  client,
  source,
  refDistance = 15,
  rolloff = 1.0,
  minGain = 0.05,
  maxGain = 1.0,
}: GainParams & { refDistance?: number; rolloff?: number }): number {
  const distance = calculateEuclideanDistance(client, source);
  const gain = maxGain * Math.pow(refDistance / Math.max(refDistance, distance), rolloff);
  return Math.max(minGain, gain);
}

export function gainFromDistanceExp({
  client,
  source,
  falloff = 0.05,
  minGain = 0.15,
  maxGain = 1.0,
}: GainParams): number {
  const distance = calculateEuclideanDistance(client, source);
  const gain = maxGain * Math.exp(-falloff * distance);
  return Math.max(minGain, gain);
}

export function gainFromDistanceLinear({
  client,
  source,
  falloff = 0.01,
  minGain = 0.15,
  maxGain = 1.0,
}: GainParams): number {
  const distance = calculateEuclideanDistance(client, source);
  // Linear falloff: gain decreases linearly with distance
  const gain = maxGain - falloff * distance;
  return Math.max(minGain, gain);
}

export function gainFromDistanceQuadratic({
  client,
  source,
  falloff = 0.001,
  minGain = 0.15,
  maxGain = 1.0,
}: GainParams): number {
  const distance = calculateEuclideanDistance(client, source);
  // Quadratic falloff: gain decreases with square of distance
  const gain = maxGain - falloff * distance * distance;
  return Math.max(minGain, gain);
}

