#!/usr/bin/env node

// *****************************************************
// async.js : streams the contents of the named pipe
// passed as parameter to stdout using fileStreamer's
// async mode. Contents is streamed for 20 seconds from
// the first read, then streaming stops for another 20
// seconds, then resumes until SIGTERM is received
// ****************************************************

// import primitives
import process from "node:process";
import console from "node:console";
import {once} from "events";
// import modules
import {fileStreamer} from "../file.streamer.js";

(async() => {

    try {

        // log PID
        console.debug(`process started with PID ${ process.pid }.`);

        const
            // file
            [ file ] = process.argv.slice(2),
            // file streamer, continue reads on EOF
            streamer = new fileStreamer({bufSize: 128, errorOnMissing: true, closeOnEOF: false});

        streamer
            // attach file streamer error handler
            .on(`error`, err => console.debug(`error: file streamer emitted ${ err.message }.`));

        // open
        await streamer.promise(`open`, file);

        streamer
            // stream file contents
            .stream()
            // attach readable stream error handler
            .on(`error`, err => console.debug(`file streamer: readable stream emitted error ${ err.message }.`))
            // pipe
            .pipe(process.stdout);

        // set 20 seconds timeout
        await new Promise(resolve => {
            setTimeout(() => resolve(), 20000);
        });

        // log
        console.debug(`removing readable. new readable will be up in 20 seconds...\n`);

        streamer
            // stop reads, destroy readable stream
            .unstream();

        // set 20 seconds timeout
        await new Promise(resolve => {
            setTimeout(() => resolve(), 20000);
        });

        // log
        console.debug(`initializing new readable and resuming reads...\n`);

        streamer
            // stream file contents (streaming will resume from FD current position)
            .stream()
            // attach readable stream error handler
            .on(`error`, err => console.debug(`file streamer: readable stream emitted error ${ err.message }.`))
            // pipe
            .pipe(process.stdout);

        // exit process
        process.on(`SIGINT`, () => console.debug(`received SIGINT, stopping and exiting.`));

        // wait for SIGINT
        await once(process, `SIGINT`);

        // close
        await streamer.promise(`close`);

        // done
        console.debug(`exiting process.`);

    } catch (err) {
        // write to stderr
        console.error(`error occured: ${ err.message }.\n`);
    }

})();
