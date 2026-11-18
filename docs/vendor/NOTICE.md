# FFmpeg WebAssembly

Bundled files are from `@ffmpeg/core` version 0.11.0. This version is pinned because the tested 0.12.x builds crash while encoding VP9. The WASM memory import minimum has been lowered from 1 GiB to 128 MiB by `scripts/prepare-browser-core.mjs`; no instructions or maximum-memory limit are changed. The JavaScript and pthread worker are unmodified. The original package is linked below; the reproducible patch script is included in the repository.

- Package: https://registry.npmjs.org/@ffmpeg/core/-/core-0.11.0.tgz
- Corresponding sources, dependency revisions, patches and build scripts: https://github.com/ffmpegwasm/ffmpeg.wasm-core/tree/v0.11.0
- FFmpeg licensing: https://ffmpeg.org/legal.html
- This FFmpeg build includes GPL codecs (including x264); GPL version 2 or later applies to the compiled core. See COPYING.GPLv2.

The surrounding Sticker Studio interface is separate application code. No video is transmitted to a server by the application.

`../coi-serviceworker.js` is coi-serviceworker v0.1.7 by Guido Zuidhof and contributors (MIT), from https://github.com/gzuidhof/coi-serviceworker. It supplies COOP/COEP response headers within the application scope for hosts such as GitHub Pages.
