# File contents streamer

This module exports a class which, when instantiated and provided with a file / named pipe, will allow the continuous streaming of said file / named pipe contents into a node.js process for as long as needed.

You can think of it as behaving similarly to the node.js primitive [fs.createReadStream()](https://nodejs.org/api/fs.html#fscreatereadstreampath-options). The difference is that the readable stream here will not emit 'end' and terminate itself as soon as EOF is reached. Instead, the file streamer will keep on attempting to read from the specified file/named pipe and pass the bytes to the readable stream until explicitly told to stop.

One noticeable perk it provides is that it allows other processes to keep pushing data into a named pipe until the conditions are met for the pipe contents to be processed, [without the pipe ever blocking](#fifo-block-note) (a file descriptor will be assigned to the named pipe, thus preventing any process writing to it from hanging, until the close() method is called and closes the file descriptor).

## Install

```sh
npm install @mulekick/file-streamer
```

**IMPORTANT:** This package uses [ESM type modules](https://nodejs.org/api/esm.html#modules-ecmascript-modules).

## Usage
<a id="file-streamer-callback-mode"></a>
Callback mode:

```js
import {fileStreamer} from "@mulekick/file-streamer";

try {
    const
        myFile = `/path/to/my/file`,
        streamer = new fileStreamer(),
        writable = getWritableStreamSomehow(),
        processing = getEventEmitterSomehow();

    // open file
    streamer.open(myFile).on(`file`, () => {
        streamer
            // create readable stream
            .stream()
            // pipe to writable and stream file contents
            .pipe(writable);
    });
    
    // once all processing is done
    processing.on(`done`, () => {
        streamer
            // stop streaming file contents, discard readable stream
            .unstream()
            // close file
            .close();
    });

} catch (err) {
    console.error(err.message);
}
```
<a id="file-streamer-async-mode"></a>
Async mode:

```js
import {fileStreamer} from "@mulekick/file-streamer";
import {once} from "events";

(async() => {
    try {
        const
            myFile = `/path/to/my/file`,
            streamer = new fileStreamer(),
            writable = getWritableStreamSomehow(),
            processing = getEventEmitterSomehow();

        // open file
        await streamer.promise(`open`, myFile);
        
        // create readable stream, pipe to writable and stream file contents
        streamer.stream().pipe(writable);
        
        // once all processing is done
        await once(processing, `done`);

        // stop streaming file contents, discard readable stream, close file
        await streamer.promise(`close`);

    } catch (err) {
        console.error(err.message);
    }
})();
```

`stream()` will return a <code>[stream.Readable](https://nodejs.org/api/stream.html#class-streamreadable)</code> instance that can operate in paused or flowing mode. Note though that it doesn't operate in object mode (in the event you need it, pipe to a <code>[stream.Duplex](https://nodejs.org/api/stream.html#class-streamduplex)</code> and manage object mode there).

## API

<a id="class-file-streamer"></a>

### Class: fileStreamer

### Constructor

### new fileStreamer([options])
- `options` [Options](#file-streamer-options) for the file streamer
- Returns: `fileStreamer`

<a id="file-streamer-options"></a>

### Options

The default values are shown after each option key.

```js
{
    fileName: null,         // path of the file / named pipe to open and read from
    bufSize: 16384,         // max number of bytes to retrieve at each read / highWaterMark value for the readable stream
    errorOnMissing: false,  // set to true to emit an error if the file is renamed or deleted while its content is still being streamed
    closeOnEOF: false       // set to true to automatically discard readable stream and close file when EOF is reached (emulates fs.createReadStream)
}
```

### Methods

### fileStreamer.open(fileName[, resolve, reject])

- `filename` String: the path of the file to open
- `resolve`, `reject` Functions: in the event you want to wrap the open method in your own promises
- Returns: <code>[fileStreamer](#class-file-streamer)</code>

Opens `filename` in read-only mode (`0o444`) and assigns a file descriptor to it.

### fileStreamer.stream()

- Returns: <code>[stream.Readable](https://nodejs.org/api/stream.html#class-streamreadable)</code>

Create a readable stream instance, begins to read from `filename` and pass the data to the readable, making it ready for consumption (`fileStreamer.open` must have been called first, or an error will be emitted).

### fileStreamer.unstream()

- Returns: <code>[fileStreamer](#class-file-streamer)</code>

Stop reading from `filename`, signals EOF to the readable stream, then resets its reference to it.

### fileStreamer.close([resolve, reject])

- `resolve`, `reject` Functions: in the event you want to wrap the open method in your own promises
- Returns: <code>[fileStreamer](#class-file-streamer)</code>

Closes `filename` and resets the references to it and to its file descriptor, thus making the <code>[fileStreamer](#class-file-streamer)</code> ready to open another file (`fileStreamer.unstream` must have been called first, or an error will be emitted).

### fileStreamer.promise(action[, fileName])

- `action` String: what is to be done with the file (either `open` or `close`)
- `filename` String: the path of the file
- Returns: <code>Promise&lt;[fileStreamer](#class-file-streamer)&gt;</code>

Wraps `fileStreamer.open` and `fileStreamer.close` methods into promises to use when streaming file contents in [async mode](#file-streamer-async-mode).

### Events

The following events may be emitted during the life cycle of a <code>[fileStreamer](#class-file-streamer)</code> instance:

| Event fired         | Condition                                                    |
| ------------------- | -------------------------------------------------------------|
| `file   `           | file has been opened and file descriptor was assigned        |
| `reading`           | starting to read from file and pass data to readable         |
| `paused`            | pause file reads after readable highWaterMark was reached    |
| `stopped`           | unstream() was called and readable has been discarded        |
| `closed`            | file has been closed and file descriptor reference was reset |
| `error`             | some error occured                                           |

All callbacks will be passed the emitting <code>[fileStreamer](#class-file-streamer)</code> instance except for the `error` callback which will be passed the emitted error.

## Notes
- [What exactly is EOF ?](https://ruslanspivak.com/eofnotchar/)
<a id="fifo-block-note"></a>
- *"If you watch closely, you'll notice that the first command you run appears to hang. This happens because the other end of the pipe is not yet connected, and so the kernel suspends the first process until the second process opens the pipe. In Unix jargon, the process is said to be “blocked”, since it is waiting for something to happen."* (long story is [here](https://www.linuxjournal.com/article/2156))