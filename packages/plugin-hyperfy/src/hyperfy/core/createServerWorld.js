import { Server } from "./systems/Server";
import { ServerEnvironment } from "./systems/ServerEnvironment";
import { ServerLiveKit } from "./systems/ServerLiveKit";
import { ServerLoader } from "./systems/ServerLoader";
import { ServerNetwork } from "./systems/ServerNetwork";
import { World } from "./World";

export function createServerWorld() {
  const world = new World();
  world.register("server", Server);
  world.register("livekit", ServerLiveKit);
  world.register("network", ServerNetwork);
  world.register("loader", ServerLoader);
  world.register("environment", ServerEnvironment);
  return world;
}
