LAME runtime provenance
=======================
LAME 3.100 is unmodified and licensed LGPL-2.0-or-later. The MP3 bridge is from
@mediabunny/mp3-encoder 1.65.0 (MPL-2.0); only its include path was changed.
No FFmpeg binary is distributed. No shared-memory or multithreaded WASM build is used.

Source: https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz
SHA256: ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e
Build environment: emscripten/emsdk:3.1.64, Linux amd64.

Rebuild with the Dockerfile and bridge in this directory. Put the checked
lame-3.100.tar.gz in the build context alongside them (concatenate source-3.100.part-1
and source-3.100.part-2 to recover the exact checked archive):

    docker build --platform linux/amd64 -t vidfetch-local-lame:3.100 .
    docker run --rm --platform linux/amd64 -v "$PWD/output:/out" vidfetch-local-lame:3.100

The resulting lame.js and lame.wasm replace public/local-media/runtime files.
Run npm ci --ignore-scripts then node scripts/local-tools/build.mjs from the
project root to rebuild the separate engine and MP3 workers. You may replace
or modify the LGPL library and relink the same bridge; the JS worker loads the
separate WASM binary. There is no signature check that prevents replacement.
The generated corresponding-source.tar.gz contains the supplied library source,
MPL source forms, this recipe and the integration source. All copyright and
license notices must accompany redistributed versions. No warranty is provided.
