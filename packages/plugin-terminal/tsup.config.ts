import { chmod } from "fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "scripts/chat": "src/scripts/chat.ts"
  },
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  async onSuccess() {
    await chmod("dist/scripts/chat.js", "755");
  }
});
