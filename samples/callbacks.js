#!/usr/bin/env node

// import modules
import {fileStreamer} from "../file.streamer.js";

try {

    // log PID
    console.debug(`process started with PID ${ process.pid }.`);

    const
        // file
        [ file ] = process.argv.slice(2),
        // reader (4 bytes)
        streamer = new fileStreamer({bufSize: 4, errorOnMissing: true, closeOnEOF: false});

    streamer
        // attach file streamer handlers
        .on(`reading`, () => console.debug(`file streamer: reading file contents ...`))
        .on(`paused`, () => console.debug(`file streamer: reading paused.`))
        .on(`stopped`, () => console.debug(`file streamer: reading stopped.`))
        .on(`closed`, () => console.debug(`file streamer: file closed.`))
        // mandatory error event handler for EventEmitter (stack trace + exit if missing)
        .on(`error`, err => console.debug(`error: file streamer emitted ${ err.message }.`));

    // open
    streamer.open(file)
        .on(`file`, fstr => {
            console.debug(`file ${ fstr.fileName } opened for streaming.`);
            fstr
                // stream file contents
                .stream()
                // attach readable stream handlers
                .on(`end`, () => console.debug(`file streamer: readable stream received EOF.`))
                .on(`close`, () => console.debug(`file streamer: readable stream closed.`))
                .on(`error`, err => console.debug(`file streamer: readable stream emitted error ${ err.message }.`))
                // pipe
                .pipe(process.stdout);
        });

    // exit process
    process.on(`SIGTERM`, () => {
        console.debug(`received SIGTERM, stopping and exiting.`);
        // close
        streamer
            .unstream()
            .close();
    });

} catch (err) {
    // write to stderr
    console.error(`error occured: ${ err.message }.\n`);
}