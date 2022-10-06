// import primitives
import process from "node:process";
import {Buffer} from "node:buffer";
import {EventEmitter} from "node:events";
import {promisify} from "node:util";
import {Readable} from "node:stream";
import {open, read, close, watch, access, constants} from "node:fs";

const
    // max highWaterMark value for readable stream
    MAX_STREAMABLE_BUFFER_SIZE = 16384,
    // open file
    ACTION_OPEN_FILE = `open`,
    // close file
    ACTION_CLOSE_FILE = `close`;

class FileStreamer extends EventEmitter {

    constructor({fileName = null, bufSize = MAX_STREAMABLE_BUFFER_SIZE, errorOnMissing = false, closeOnEOF = false} = {}) {
        // superclass constructor
        super();
        // store file name
        this.fileName = fileName;
        // store bytes to read
        this.bufSize = bufSize;
        // emit error if file goes missing
        this.errorOnMissing = errorOnMissing;
        // close as soon as EOF is true (emulate createReadStream)
        this.closeOnEOF = closeOnEOF;
        // store file descriptor
        this.fileDesc = null;
        // store readable
        this.readable = null;
        // read cache
        this.cachedRead = null;
        // store state (init to false, will switch to true as soon as push operations on readable return false)
        this.suspended = false;
        // store file watcher
        this.watchr = null;
    }

    promise(action, fileName) {
        // wrap file opening / closing in a promise
        return new Promise((resolve, reject) => {
            switch (action) {
            case ACTION_OPEN_FILE :
                this.open(fileName, resolve, reject);
                break;
            case ACTION_CLOSE_FILE :
                this.unstream().close(resolve, reject);
                break;
            default :
                reject(new Error(`no action was specified as to opening/closing specified file.`));
                break;
            }
        });
    }

    watch() {
        try {
            // detect targeted file changes
            this.watchr = watch(this.fileName, {
                // don't prevent process from exiting
                persistent: true,
                // filename encoding
                encoding: `utf8`,
                // non recursive
                recursive: false
            })
                // reset readable on change
                .on(`change`, e => {
                    // emit error if file suddenly disappears (RENAME IS EMITTED ON PROCESS EXIT 😡)
                    // if (e === `rename`)
                    if (e === `change`) {
                        // push access into the next tick queue to have its callback immediately assume
                        // priority over any I/O callback pushed into the message queue through an immediate
                        process.nextTick(r => access(r.fileName, constants.R_OK, err => {
                            if (err) {
                                // emit 'error' event
                                r.emit(`error`, err);
                                // unwatch
                                r.unwatch();
                            }
                        }), this);
                    }
                })
                // emit 'error' event
                .on(`error`, err => this.emit(`error`, err));
        } catch (err) {
            // emit 'error' event
            this.emit(`error`, err);
        }
    }

    unwatch() {
        try {
            // stop watching targeted file (fs.FSWatcher is not exported, so we have to settle for a downgraded test)
            if (this.watchr !== null) {
                // discard
                this.watchr.unref();
                // close
                this.watchr.close();
                // reset
                this.watchr = null;
            }
        } catch (err) {
            // emit 'error' event
            this.emit(`error`, err);
        }
    }

    open(fileName, resolve, reject) {

        if (fileName && typeof fileName === `string`)
            // set filename
            this.fileName = fileName;

        if (this.errorOnMissing === true)
            // set file watcher
            this.watch();
        else
            // else, reset
            this.unwatch();

        // open file
        setImmediate(async r => {
            try {
                const
                    // open read-only
                    fileDesc = await promisify(open)(fileName, `r`, 0o444);
                // set file name
                r.fileName = fileName;
                // store fd
                r.fileDesc = fileDesc;
                // resolve / emit 'file' event
                return resolve && typeof resolve === `function` ? resolve(r) : r.emit(`file`, r);
            } catch (err) {
                // reject / emit 'error' event
                return reject && typeof reject === `function` ? reject(err) : r.emit(`error`, err);
            }
        }, this);

        // return this for chaining
        return this;
    }

    // retrieve readable from file
    stream() {

        if (this.fileDesc === null)
            // no file opened
            throw new Error(`no file descriptor available (file ${ this.fileName } has not been opened yet).`);

        if (this.bufSize > MAX_STREAMABLE_BUFFER_SIZE)
            // limit size of buffered data
            throw new RangeError(`buffer size for file descriptor reads must be below ${ MAX_STREAMABLE_BUFFER_SIZE } bytes if reads are to be streamed.`);

        // setup readable - use arrow functions so as to retrieve enclosing lexical context's this
        this.readable = new Readable({
            // stream chunk by chunk
            highWaterMark: this.bufSize,
            // pass raw buffers
            encoding: null,
            // pass raw buffers
            objectMode: false,
            // emit close
            emitClose: true,
            // construct implementation
            construct: callback => {
                // emit 'reading' event
                this.emit(`reading`, this);
                // trigger reads
                this.read();
                // begin pushing data
                callback();
            },
            // read implementation
            read: () => {
                // verify state
                if (this.suspended === true) {
                    // reset state
                    this.suspended = false;
                    // emit 'reading' event
                    this.emit(`reading`, this);
                    // trigger reads
                    this.read();
                }
            },
            // destroy implementation
            destroy: (err, callback) => {
                // reset readable
                this.readable = null;
                // exit
                callback(err);
            },
            // auto terminate
            autoDestroy: true
        });

        // return readable for chaining
        return this.readable;
    }

    // read
    read() {
        // start recursive reads
        setImmediate(async r => {
            try {
                // and if the conditions for a read are present ...
                if (r.fileDesc !== null && r.readable instanceof Readable) {
                    const
                        // file / cache (no race condition here)
                        {bytesRead, buffer} = r.cachedRead ?
                            r.cachedRead :
                            await promisify(read)(r.fileDesc, {
                                // read bytes from file
                                buffer: Buffer.alloc(r.bufSize),
                                length: r.bufSize
                            });
                    // eslint-disable-next-line require-atomic-updates
                    r.cachedRead = null;
                    // if readable is gone at this stage because of unstream()
                    if (r.readable instanceof Readable === false) {
                        // emit 'stopped' event
                        r.emit(`stopped`, r);
                        // cache read
                        r.cachedRead = {bytesRead, buffer};
                    // if nothing was read
                    } else if (bytesRead === 0) {
                        // if reads are to stop on EOF
                        if (r.closeOnEOF === true)
                            // stop streaming file contents and close
                            r.unstream().close();
                        // else
                        else
                            // go for more
                            r.read();
                    // if something was read
                    } else {
                        // crop buffer to number of bytes read, push and update readable state
                        r.suspended = !r.readable.push(buffer.subarray(0, bytesRead));
                        // stream demands more writes
                        if (r.suspended === false)
                            // go for more
                            r.read();
                        // push reached HWM
                        else
                            // emit 'paused' event
                            r.emit(`paused`, r);
                    }
                }
            } catch (err) {
                if (r.readable instanceof Readable)
                    // nuke readable
                    r.readable.destroy(err);
                else
                    // emit error
                    r.emit(`error`, err);
            }
        }, this);
    }

    unstream() {
        // if readable is up
        if (this.readable instanceof Readable)
            // Signal EOF (readable will auto destroy)
            this.readable.push(null);
        // return this for chaining
        return this;
    }

    close(resolve, reject) {
        // close file
        setImmediate(async r => {
            try {
                // if readable is up
                if (r.readable instanceof Readable)
                    // throw error to enforce calling 'unstream' first
                    throw new Error(`readable is still reading from ${ r.fileName }, call unstream() first.`);
                // reset read cache
                r.cachedRead = null;
                // close file
                await promisify(close)(r.fileDesc);
                // unwatch
                r.unwatch();
                // reset file name
                r.fileName = null;
                // reset fd
                r.fileDesc = null;
                // resolve / emit 'closed' event
                return resolve && typeof resolve === `function` ? resolve(r) : r.emit(`closed`, r);
            } catch (err) {
                // reject / emit 'error' event
                return reject && typeof reject === `function` ? reject(err) : r.emit(`error`, err);
            }
        }, this);

        // return this for chaining
        return this;
    }

}

// never rename exports in modules
export {FileStreamer};
