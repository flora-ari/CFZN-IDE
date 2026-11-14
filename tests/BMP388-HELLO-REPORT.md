# Mind+ BMP388 hello example verification

Result: PASS for example import, automatic code and actual compilation on the current production build.

Real headless Edge imported examples/mindplus-BMP388-hello.ob through the file chooser into an isolated browser context using a temporary static server for current apps/web/dist. Verified FireBeetle ESP32-E, upload mode, automatic read-only code, the five original connected non-shadow blocks (VM graph exactly matches the example), Serial.begin(9600), Serial.println("hello"), and delay(5 * 1000). All seven assets remain referenced by matching target/type/name and present in the VM-generated archive. Native VM normalizes some sound resource IDs; byte identity of normalized WAV files is not asserted. The source MP sound metadata/header discrepancy is separately recorded by the controller.

Build: succeeded via existing port 3002, job 8e78a365-2749-4faf-bbd6-ff650281bf03, profile firebeetle-esp32e-4mb, moduleIds empty, using the actual generated source. Full logs are in build.json. A duplicate submission during script correction returned HARDWARE_BUSY and created no second job; final verification uses the original successful job.

Limitation: port 5173 remained at editor startup after the 120-second wait. The controller authorized the static-dist fallback, so this does not establish that the development page boots successfully. Initial script readiness checks were corrected after premature null.disabled access. Console warnings about upstream duplicate block definitions are captured in verification.json; there are no uncaught page errors.

A separate 15-second development-page diagnostic found one unfinished request: http://127.0.0.1:5173/openblock-vendor/openblock-gui.js. No failed requests or console error/warning messages were observed in that window; the iframe still displayed the startup message. See startup-network.json. This short sample does not establish why the earlier 120-second startup stalled.

Evidence: tests/evidence/bmp388-hello/{verification.json,generated.ino,imported.png,build.json}. The one-off script is not a new test suite. Final outcome is recorded in verification.json and this report. Own browsers and temporary server closed. No project-library writes, serial ports, uploads, user-service restarts, product/example/VM modifications, or hardware testing.
