import { Client } from "./systems/Client";
import { ClientControls } from "./systems/ClientControls";
import { ClientEnvironment } from "./systems/ClientEnvironment";
import { ClientGraphics } from "./systems/ClientGraphics";
import { ClientLoader } from "./systems/ClientLoader";
import { ClientPrefs } from "./systems/ClientPrefs";
import { World } from "./World";

// import { ClientAudio } from './systems/ClientAudio'

export { System } from "./systems/System";

export function createViewerWorld() {
  const world = new World();
  world.register("client", Client);
  world.register("prefs", ClientPrefs);
  world.register("loader", ClientLoader);
  world.register("controls", ClientControls);
  world.register("graphics", ClientGraphics);
  world.register("environment", ClientEnvironment);
  // world.register('audio', ClientAudio)
  return world;
}
