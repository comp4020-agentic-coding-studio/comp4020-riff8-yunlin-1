import { defineConfig } from "vitest/config";

// Every test in spec/ runs against the running app, which spec/global-setup.ts
// finds. Only spec/ runs: a test anywhere else needs adding to `include`.
//
// Files run one at a time: the 過眼 count and the "since your last visit" mark
// are about everyone using the app at once, so a spec asserting an exact count
// or an exact set of new lines can't share the app with another file writing
// lines and opening streams in parallel.
export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts"],
    globalSetup: ["./spec/global-setup.ts"],
    fileParallelism: false,
  },
});
