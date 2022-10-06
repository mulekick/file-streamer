#!/usr/bin/env node

// *****************************************************
// callbacks.js : streams the contents of the named pipe
// passed as parameter to stdout using FileStreamer's
// callback mode until SIGTERM is received
// ****************************************************

// import modules
import process from "node:process";
import console from "node:console";
import {FileStreamer} from "../file.streamer.js";

try {

    // log PID
    console.debug(`process started with PID ${ process.pid }.`);

    const
        // file
        [ file ] = process.argv.slice(2),
        // file streamer, continue reads on EOF
        streamer = new FileStreamer({bufSize: 128, errorOnMissing: true, closeOnEOF: false});

    streamer
        // attach file streamer handlers
        .on(`reading`, () => console.debug(`file streamer: reading file contents ...`))
        .on(`paused`, () => console.debug(`file streamer: reading paused.`))
        .on(`stopped`, () => console.debug(`file streamer: reading stopped.`))
        .on(`closed`, () => console.debug(`file streamer: file closed.`))
        // attach file streamer error handler
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
                // attach readable stream error handler
                .on(`error`, err => console.debug(`file streamer: readable stream emitted error ${ err.message }.`))
                // pipe
                .pipe(process.stdout);
        });

    // exit process
    process.on(`SIGINT`, () => {
        console.debug(`received SIGINT, stopping and exiting.`);
        // close
        streamer
            .unstream()
            .close();
    });

} catch (err) {
    // write to stderr
    console.error(`error occured: ${ err.message }.\n`);
}