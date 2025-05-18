export function bindRotations(quaternion, euler) {
  euler._onChange(() => {
    quaternion.setFromEuler(euler, false);
  });
  quaternion._onChange(() => {
    euler.setFromQuaternion(quaternion, undefined, false);
  });
}
