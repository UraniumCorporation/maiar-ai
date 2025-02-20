import { defineConfig } from "tsup";
import { chmod } from "fs/promises";

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
