#!/usr/bin/env node

// *****************************************************
// cat.js : emulates bash shell's cat [file] utility by
// successively streaming contents of files passed as
// parameters to stdout using fileStreamer's async mode
// ****************************************************

// import primitives
import process from "node:process";
import console from "node:console";
import {once} from "events";
// import modules
import {fileStreamer} from "../file.streamer.js";

/* eslint-disable no-await-in-loop */

(async() => {

    try {

        // log PID
        console.debug(`process started with PID ${ process.pid }.`);

        const
            // file paths
            files = process.argv.slice(2),
            // file streamer, auto close file on EOF
            streamer = new fileStreamer({bufSize: 128, errorOnMissing: true, closeOnEOF: true});

        streamer
            // attach file streamer error handler
            .on(`error`, err => console.debug(`error: file streamer emitted ${ err.message }`));

        // sequentially stream multiple files
        for (const file of files) {

            // open in async mode
            await streamer.promise(`open`, file);

            streamer
                // stream file contents
                .stream()
                // attach readable stream error handler
                .on(`error`, err => console.debug(`file streamer: readable stream emitted error ${ err.message }`))
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