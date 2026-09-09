# ONNX Runtime Web

This directory contains the browser/WASM files required by `Rename.html`.

- Package: `onnxruntime-web`
- Version: `1.17.3`
- Source: https://www.npmjs.com/package/onnxruntime-web/v/1.17.3
- Project: https://github.com/microsoft/onnxruntime
- License: MIT; see `LICENSE.txt`

Bundled files are limited to the single-threaded WASM execution path used on GitHub Pages:

- `ort.min.js` (the package's WASM-only `ort.wasm.min.js` build, deployed under the filename expected by the page)
- `ort-wasm-simd.wasm`

The page sets `ort.env.wasm.numThreads = 1` and disables proxy mode because GitHub Pages does not provide the cross-origin isolation headers needed for shared-memory multithreading. Version 1.17.3 was selected after an HTTP browser smoke test because this WASM-only build does not require a dynamically imported `.mjs` loader.
