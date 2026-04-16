import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  outExtension: ({ format }) => ({
    js: format === "cjs" ? ".cjs" : ".js",
  }),
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom"],
  target: "es2020",
  treeshake: true,
  minify: false,
});
