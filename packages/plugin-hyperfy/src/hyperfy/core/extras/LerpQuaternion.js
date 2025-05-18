import * as THREE from "three";

export class LerpQuaternion {
  constructor(value, rate) {
    this.value = value;
    this.rate = rate; // receive rate eg 1/5 for 5hz
    this.previous = new THREE.Quaternion().copy(this.value);
    this.current = new THREE.Quaternion().copy(this.value);
    this.time = 0;
    this.snapToken = null;
  }

  push(value, snapToken = null) {
    if (this.snapToken !== snapToken) {
      this.snapToken = snapToken;
      this.previous.copy(value);
      this.current.copy(value);
      this.value.copy(value);
    } else {
      this.previous.copy(this.current);
      this.current.copy(value);
    }
    this.time = 0;
  }

  pushArray(value, snapToken = null) {
    if (this.snapToken !== snapToken) {
      this.snapToken = snapToken;
      this.previous.fromArray(value);
      this.current.fromArray(value);
      this.value.fromArray(value);
    } else {
      this.previous.copy(this.current);
      this.current.fromArray(value);
    }
    this.time = 0;
  }

  update(delta) {
    this.time += delta;
    let alpha = this.time / this.rate;
    if (alpha > 1) alpha = 1;
    this.value.slerpQuaternions(this.previous, this.current, alpha);
    return this;
  }

  snap() {
    this.previous.copy(this.current);
    this.value.copy(this.current);
    this.time = 0;
  }

  clear() {
    this.previous.copy(this.value);
    this.current.copy(this.value);
    this.time = 0;
  }
}
