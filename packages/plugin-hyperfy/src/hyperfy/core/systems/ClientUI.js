import { isBoolean } from "lodash-es";
import { thickness } from "three/src/nodes/TSL.js";

import { ControlPriorities } from "../extras/ControlPriorities";
import { System } from "./System";

const appPanes = ["app", "script", "nodes", "meta"];

export class ClientUI extends System {
  constructor(world) {
    super(world);
    this.state = {
      visible: true,
      active: false,
      app: null,
      pane: null
    };
    this.lastAppPane = "app";
    this.control = null;
  }

  start() {
    this.control = this.world.controls.bind({
      priority: ControlPriorities.CORE_UI
    });
  }

  update() {
    if (this.control.escape.pressed) {
      if (this.state.pane) {
        this.state.pane = null;
        this.broadcast();
      } else if (this.state.app) {
        this.state.app = null;
        this.broadcast();
      }
    }
    if (
      this.control.keyZ.pressed &&
      !this.control.metaLeft.down &&
      !this.control.controlLeft.down &&
      !this.control.shiftLeft.down
    ) {
      this.state.visible = !this.state.visible;
      this.broadcast();
    }
    if (this.control.pointer.locked && this.state.active) {
      this.state.active = false;
      this.broadcast();
    }
    if (!this.control.pointer.locked && !this.state.active) {
      this.state.active = true;
      this.broadcast();
    }
  }

  togglePane(pane) {
    if (pane === null || this.state.pane === pane) {
      this.state.pane = null;
    } else {
      // if (appPanes.includes(this.state.pane) && !appPanes.includes(pane)) {
      //   this.state.app = null
      // }
      this.state.pane = pane;
      if (appPanes.includes(pane)) {
        this.lastAppPane = pane;
      }
    }
    this.broadcast();
  }

  toggleVisible(value) {
    value = isBoolean(value) ? value : !this.state.visible;
    if (this.state.visible === value) return;
    this.state.visible = value;
    this.broadcast();
  }

  setApp(app) {
    this.state.app = app;
    this.state.pane = app ? this.lastAppPane : null;
    this.broadcast();
  }

  broadcast() {
    this.world.emit("ui", { ...this.state });
  }

  destroy() {
    this.control?.release();
    this.control = null;
  }
}
