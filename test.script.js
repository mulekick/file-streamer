// import primitives
import {once} from "events";
// import modules
import {fileStreamer} from "./file.streamer.js";

(async() => {

    // no try/catch because we want the test script to throw the error on fail
    // no error handlers because we want the test script to throw the error on fail

    const
        // file
        [ file ] = process.argv.slice(2),
        // reader (4 bytes)
        streamer = new fileStreamer({bufSize: 4, errorOnMissing: true, closeOnEOF: true});

    // open
    await streamer.promise(`open`, file);

    streamer
        // stream file contents
        .stream()
        // pipe
        .pipe(process.stdout);


    // readable will be wiped out and file will auto close on EOF
    await once(streamer, `closed`);

    // done
    console.debug(`test succeeded, exiting process.`);

})();
