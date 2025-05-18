import * as THREE from "./three";

export function extendThreePhysX() {
  if (!PHYSX) throw new Error("PHYSX not initialised");
  if (THREE.Vector3.prototype.fromPxVec3) return;

  const _pxVec3 = new PHYSX.PxVec3();
  const _pxExtVec3 = new PHYSX.PxExtendedVec3();

  const pos = new THREE.Vector3();
  const qua = new THREE.Quaternion();
  const sca = new THREE.Vector3();

  THREE.Vector3.prototype.fromPxVec3 = function (pxVec3) {
    this.x = pxVec3.x;
    this.y = pxVec3.y;
    this.z = pxVec3.z;
    return this;
  };

  THREE.Vector3.prototype.toPxVec3 = function (pxVec3 = _pxVec3) {
    pxVec3.x = this.x;
    pxVec3.y = this.y;
    pxVec3.z = this.z;
    return pxVec3;
  };

  THREE.Vector3.prototype.toPxExtVec3 = function (pxExtVec3 = _pxExtVec3) {
    pxExtVec3.x = this.x;
    pxExtVec3.y = this.y;
    pxExtVec3.z = this.z;
    return pxExtVec3;
  };

  THREE.Vector3.prototype.toPxTransform = function (pxTransform) {
    pxTransform.p.x = this.x;
    pxTransform.p.y = this.y;
    pxTransform.p.z = this.z;
  };

  THREE.Quaternion.prototype.toPxTransform = function (pxTransform) {
    pxTransform.q.x = this.x;
    pxTransform.q.y = this.y;
    pxTransform.q.z = this.z;
    pxTransform.q.w = this.w;
  };

  THREE.Matrix4.prototype.toPxTransform = function (pxTransform) {
    this.decompose(pos, qua, sca);
    pxTransform.p.x = pos.x;
    pxTransform.p.y = pos.y;
    pxTransform.p.z = pos.z;
    pxTransform.q.x = qua.x;
    pxTransform.q.y = qua.y;
    pxTransform.q.z = qua.z;
    pxTransform.q.w = qua.w;
  };
}
