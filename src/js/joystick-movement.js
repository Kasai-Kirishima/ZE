/**
 * Joystick Movement runtime script.
 * Positive Y means forward; movement can follow the live camera basis.
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

export function joystickMovementDelta({
  x = 0, y = 0, speed = 4, deltaSeconds = 1 / 60, yawRadians = 0,
  deadZone = 0.08, forwardVector = null, rightVector = null
} = {}) {
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

  // If supplied, use the camera's current horizontal direction. This prevents
  // the joystick from retaining a baked-in forward/backward world direction.
  let forward, right;
  if (Array.isArray(forwardVector) && Array.isArray(rightVector) &&
      forwardVector.length >= 3 && rightVector.length >= 3) {
    forward = forwardVector;
    right = rightVector;
  } else {
    const yaw = Number(yawRadians) || 0;
    const cosine = Math.cos(yaw);
    const sine = Math.sin(yaw);
    right = [cosine, 0, -sine];
    forward = [-sine, 0, -cosine];
  }
  const worldX = (Number(right[0]) || 0) * axisX + (Number(forward[0]) || 0) * axisY;
  const worldZ = (Number(right[2]) || 0) * axisX + (Number(forward[2]) || 0) * axisY;
  const distance = Math.max(0, Number(speed) || 0) * Math.max(0, Math.min(0.05, Number(deltaSeconds) || 0));
  return [worldX * distance, 0, worldZ * distance];
}

/** Execute one movement tick using the engine collision callback. */
export function joystickMovementStep({
  entity, x, y, speed, deltaSeconds, yawRadians, deadZone,
  forwardVector, rightVector, moveEntityWithCollisions
} = {}) {
  if (!entity || typeof moveEntityWithCollisions !== 'function') return [0, 0, 0];
  const delta = joystickMovementDelta({
    x, y, speed, deltaSeconds, yawRadians, deadZone, forwardVector, rightVector
  });
  if (Math.abs(delta[0]) + Math.abs(delta[2]) < 1e-9) return [0, 0, 0];
  const moved = moveEntityWithCollisions(entity, delta) || [0, 0, 0];
  if (entity.physics?.enabled && Array.isArray(entity.physics.velocity)) {
    entity.physics.velocity[0] = 0;
    entity.physics.velocity[2] = 0;
  }
  return moved;
}
