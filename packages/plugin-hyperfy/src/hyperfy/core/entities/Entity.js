export class Entity {
  constructor(world, data, local) {
    this.world = world;
    this.data = data;

    // if spawned locally we need to broadcast to server/clients
    if (local) {
      this.world.network.send("entityAdded", data);
    }
  }

  modify(data) {
    // called when remote receives entity changes
    // or applying local changes
  }

  onEvent(version, name, data, networkId) {
    // ...
  }

  serialize() {
    return this.data;
  }

  destroy(local) {
    // ...
  }
}
