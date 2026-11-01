FROM emscripten/emsdk:3.1.64
COPY lame-3.100.tar.gz /tmp/lame.tar.gz
RUN echo 'ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e  /tmp/lame.tar.gz' | sha256sum -c -
RUN mkdir -p /src && tar -xf /tmp/lame.tar.gz -C /src --strip-components=1
WORKDIR /src
RUN emconfigure ./configure --disable-frontend --disable-shared --enable-static --disable-nasm --disable-decoder --disable-analyzer-hooks --host=none CFLAGS=-O3 && emmake make -j2
COPY lame-bridge.c /src/lame-bridge.c
RUN emcc -O3 -I/src/include /src/lame-bridge.c /src/libmp3lame/.libs/libmp3lame.a -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=worker -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=268435456 -sFILESYSTEM=0 -sEXPORTED_FUNCTIONS=_init_lame,_encode_samples,_flush_lame,_close_lame,_malloc,_free -sEXPORTED_RUNTIME_METHODS=cwrap -o /src/lame.js
CMD ["sh","-c","cp /src/lame.js /src/lame.wasm /out/"]
