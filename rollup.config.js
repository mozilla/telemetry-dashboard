import css from "rollup-plugin-css-porter";
import rollupCopy from "rollup-plugin-copy";
import sourcemaps from "rollup-plugin-sourcemaps";
import uglify from "rollup-plugin-uglify";

// TODO: Figure out hash URLs

// rollup.config.js
export default [
  // Index page.
  {
    input: "src/index.js",
    output: {
      file: "dist/bundle.min.js",
      sourcemap: true,
      format: "iife"
    },
    context: "window",
    plugins: [
      css({ dest: "dist/bundle.css" }),
      uglify(),
      sourcemaps(),
      rollupCopy({
        "src/index.html": "dist/index.html"
      })
    ]
  },
  // Measurement dashboard.
  {
    input: "src/dist.js",
    output: {
      file: "dist/dist/bundle.min.js",
      sourcemap: true,
      format: "iife"
    },
    context: "window",
    plugins: [
      css({ dest: "dist/dist/bundle.css" }),
      uglify(),
      sourcemaps(),
      rollupCopy({
        "src/dist.html": "dist/dist/index.html"
      })
    ]
  }
];
