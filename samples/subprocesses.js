#!/usr/bin/env node

// *****************************************************
// subprocesses.js : prints the output of multiple commands
// to stdout from named pipe passed as parameter
// ****************************************************

// import primitives
import process from "node:process";
import console from "node:console";
import {execFile} from "child_process";
// import modules
import {fileStreamer} from "../file.streamer.js";


try {

    // log PID
    console.debug(`process started with PID ${ process.pid }.`);

    const
        // file
        [ file ] = process.argv.slice(2),
        // file streamer, continue reads on EOF
        streamer = new fileStreamer({bufSize: 128, errorOnMissing: true, closeOnEOF: true});

    streamer
        // attach file streamer error handler
        .on(`error`, err => console.debug(`error: file streamer emitted ${ err.message }.`));

    // open
    streamer.open(file)
        .on(`file`, fstr => {
            fstr
                // stream file contents
                .stream()
                // attach readable stream error handler
                .on(`error`, err => console.debug(`file streamer: readable stream emitted error ${ err.message }.`))
                // pipe
                .pipe(process.stdout);
        });

    // spawn commands whose outputs are redirected to file
    execFile(`${ process.cwd() }/subprocess.sh`, [ `.`, file ]);
    execFile(`${ process.cwd() }/subprocess.sh`, [ `..`, file ]);
    execFile(`${ process.cwd() }/subprocess.sh`, [ `/`, file ]);

} catch (err) {
    // write to stderr
    console.error(`error occured: ${ err.message }.\n`);
}