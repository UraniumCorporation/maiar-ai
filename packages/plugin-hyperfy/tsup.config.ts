import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  target: "es2020",
  external: ["@livekit/rtc-node", "yoga-layout"]
  // noExternal: [/.*/], // Comment out or remove this line
});
