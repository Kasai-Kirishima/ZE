/**
 * Joystick Movement runtime script.
 * X is strafe (left/right), Y is forward/backward (positive Y = forward).
 * The local direction is rotated around world Y so the target follows its own
 * facing direction, the camera yaw, or the world axes.
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

export function joystickMovementDelta({ x = 0, y = 0, speed = 4, deltaSeconds = 1 / 60, yawRadians = 0, deadZone = 0.08 } = {}) {
  let axisX = clamp(x, -1, 1);
  let axisY = clamp(y, -1, 1);
  const rawMagnitude = Math.hypot(axisX, axisY);
  const magnitude = Math.min(1, rawMagnitude);
  const threshold = clamp(deadZone, 0, 0.5);
  if (magnitude <= threshold || rawMagnitude <= 1e-8) return [0, 0, 0];

  // Remap the dead zone and normalize diagonals so they do not move faster.
  const strength = (magnitude - threshold) / (1 - threshold);
  axisX = (axisX / rawMagnitude) * strength;
  axisY = (axisY / rawMagnitude) * strength;

  // Local +X = right, local +Y = forward (Three.js local -Z).
  const localX = axisX;
  const localZ = -axisY;
  const cosine = Math.cos(Number(yawRadians) || 0);
  const sine = Math.sin(Number(yawRadians) || 0);
  const worldX = localX * cosine + localZ * sine;
  const worldZ = -localX * sine + localZ * cosine;
  const distance = Math.max(0, Number(speed) || 0) * Math.max(0, Math.min(0.05, Number(deltaSeconds) || 0));
  return [worldX * distance, 0, worldZ * distance];
}

/** Execute one movement tick using the engine collision callback. */
export function joystickMovementStep({ entity, x, y, speed, deltaSeconds, yawRadians, deadZone, moveEntityWithCollisions } = {}) {
  if (!entity || typeof moveEntityWithCollisions !== 'function') return [0, 0, 0];
  const delta = joystickMovementDelta({ x, y, speed, deltaSeconds, yawRadians, deadZone });
  if (Math.abs(delta[0]) + Math.abs(delta[2]) < 1e-9) return [0, 0, 0];
  const moved = moveEntityWithCollisions(entity, delta) || [0, 0, 0];
  if (entity.physics?.enabled && Array.isArray(entity.physics.velocity)) {
    entity.physics.velocity[0] = 0;
    entity.physics.velocity[2] = 0;
  }
  return moved;
}
