#!/usr/bin/env node

/* eslint-disable no-await-in-loop */

// import primitives
import {once} from "events";
// import modules
import {fileStreamer} from "../file.streamer.js";

(async() => {

    try {

        // log PID
        console.debug(`process started with PID ${ process.pid }.`);

        const
            // file
            files = process.argv.slice(2),
            // reader (4 bytes)
            streamer = new fileStreamer({bufSize: 4, errorOnMissing: true, closeOnEOF: true});

        streamer
            // attach file streamer handlers
            .on(`reading`, () => console.debug(`file streamer: reading file contents ...`))
            .on(`paused`, () => console.debug(`file streamer: reading paused.`))
            .on(`stopped`, () => console.debug(`file streamer: reading stopped.`))
            .on(`closed`, () => console.debug(`file streamer: file closed.`))
            // mandatory error event handler for EventEmitter (stack trace + exit if missing)
            .on(`error`, err => console.debug(`error: file streamer emitted ${ err.message }.`));

        for (const file of files) {

            // open in promise mode
            await streamer.promise(`open`, file);

            streamer
                // stream file contents
                .stream()
                // attach readable stream handlers
                .on(`end`, () => console.debug(`file streamer: readable stream received EOF.`))
                .on(`close`, () => console.debug(`file streamer: readable stream closed.`))
                .on(`error`, err => console.debug(`file streamer: readable stream emitted error ${ err.message }.`))
                // pipe
                .pipe(process.stdout);

            // readable will be wiped out and file will auto close on EOF, thus wait for
            // the file streamer to emit the 'closed' event before proceeding to next file
            await once(streamer, `closed`);
        }

    } catch (err) {
        // write to stderr
        console.error(`error occured: ${ err.message }.\n`);
    }

})();