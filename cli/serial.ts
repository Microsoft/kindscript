/// <reference path="../typings/globals/node/index.d.ts"/>

import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import * as querystring from 'querystring';
import * as nodeutil from './nodeutil';
import * as server from './server';
import * as util from 'util';
import * as commandParser from './commandparser';

import U = pxt.Util;
import Cloud = pxt.Cloud;

class Serial {
    buf = new U.PromiseBuffer<Buffer>()
    isclosed = false;
    partialBuf: Buffer;
    partialPos = 0;
    lock = new U.PromiseQueue()
    openpromise: Promise<void>;

    constructor(public info: server.SerialPortInfo) {
        let SerialPort = require("serialport");
        info.port = new SerialPort(info.comName, {
            baudrate: 115200,
            autoOpen: false
        }); // this is the openImmediately flag [default is true]
        this.openpromise = new Promise<void>((resolve, reject) => {
            info.port.open((error: any) => {
                if (error) {
                    console.log('failed to open: ' + error);
                    reject(error)
                } else {
                    console.log(`serial: connected to ${info.comName} by ${info.manufacturer} (${info.pnpId})`);
                    info.opened = true;
                    info.port.on('data', (buffer: Buffer) => {
                        // console.log("S: " + buffer.toString("hex"))
                        this.buf.push(buffer)
                    });
                    info.port.on('error', () => this.close())
                    info.port.on('close', () => this.close())
                    resolve()
                }
            });
        })
    }

    writeAsync(buf: string | Buffer) {
        if (typeof buf == "string")
            buf = new Buffer(buf as string, "utf8")
        return this.openpromise
            .then(() => this.isclosed ? Promise.reject(new Error("closed (write)")) : null)
            .then(() => new Promise<void>((resolve, reject) => {
                this.info.port.write(buf, (err: any) => {
                    if (err) reject(err)
                    else resolve()
                })
            }))
    }

    readBlockingAsync(size: number) {
        let res = new Buffer(size)
        let i = 0
        if (this.partialBuf) {
            for (i = 0; i < size; ++i) {
                if (this.partialPos >= this.partialBuf.length) {
                    this.partialBuf = null
                    break
                }
                res[i] = this.partialBuf[this.partialPos++]
            }
        }
        if (i >= size) return Promise.resolve(res)
        let loop = (): Promise<Buffer> =>
            this.readCoreAsync()
                .then(buf => {
                    let j = 0
                    while (i < size) {
                        if (j >= buf.length) break
                        res[i++] = buf[j++]
                    }
                    if (i >= size) {
                        if (j < buf.length) {
                            this.partialBuf = buf
                            this.partialPos = j
                        }
                        return res
                    }
                    return loop()
                })
        return this.lock.enqueue("main", loop)
    }

    readCoreAsync() {
        if (this.isclosed)
            return Promise.reject<Buffer>(new Error("closed (read core)"))
        return this.buf.shiftAsync()
    }

    close() {
        this.buf.drain()
        if (this.isclosed) return
        this.isclosed = true
        this.info.port.close()
    }
}

let samd21flash = [
    0xb5f02180, 0x68184b1a, 0x681c4b1a, 0x685a4b1a, 0x605a430a, 0x3c014a19,
    0x7d1dd329, 0x07ed4916, 0x2520d5fb, 0x830d35ff, 0x61cd0845, 0x800d4d14,
    0x07c97d19, 0x4913d5fc, 0x468c0005, 0x37ff1c57, 0x80194911, 0x07c97d19,
    0x2100d5fc, 0x506e5856, 0x29403104, 0x4661d1fa, 0x35403240, 0x7d198019,
    0xd5fc07c9, 0xd1eb4297, 0x30ff3001, 0xbdf0e7d3, 0x20006000, 0x20006004,
    0x41004000, 0x20006008, 0xffffa502, 0xffffa504, 0xffffa544,
    // code ends
    0x20007ff0, // stack
    0x20008000 - 512 + 1 // start address (+1 for Thumb)
]

function sambaCmd(ch: string, addr: number, len?: number) {
    let r = ch + addr.toString(16)
    if (len != null)
        r += "," + len.toString(16)
    return r + "#"
}
export function flashSerialAsync(c: commandParser.ParsedCommand) {
    let SerialPort = require("serialport");
    let listAsync: () => Promise<server.SerialPortInfo[]> = Promise.promisify(SerialPort.list) as any

    let f = fs.readFileSync(c.arguments[0])
    let blocks = pxtc.UF2.parseFile(f as any)
    let goCmd = ""
    let s: Serial

    let writeMemAsync = (addr: number, buf: Buffer) =>
        s.writeAsync(sambaCmd("S", addr, buf.length))
            .then(() => s.writeAsync(buf))

    let pingAsync = () =>
        s.writeAsync(sambaCmd("R", 0, 4))
            .then(() => s.readBlockingAsync(4))

    let writeBlockAsync = (b: pxtc.UF2.Block) => {
        let hd = new Buffer(8)
        pxt.HF2.write32(hd, 0, b.targetAddr)
        pxt.HF2.write32(hd, 4, 1)
        return writeMemAsync(0x20006000, Buffer.concat([hd, b.data as any]))
            .then(() => s.writeAsync(goCmd))
            .then(pingAsync)
            .then(() => {
                // console.log("written at " + b.targetAddr)
            })
    }

    return listAsync()
        .then(ports => {
            let p = ports.filter(p => /Arduino|Adafruit/i.test(p.manufacturer))[0]
            s = new Serial(p)
            return pxt.HF2.onlyChangedBlocksAsync(blocks, (addr, len) => {
                return s.writeAsync(sambaCmd("R", addr, len * 4))
                    .then(() => s.readBlockingAsync(len * 4))
            })
                .then(lessBlocks => {
                    console.log(`flash ${blocks.length} pages -> ${lessBlocks.length} pages`)
                    let writeBuf = new Buffer(samd21flash.length * 4)
                    for (let i = 0; i < samd21flash.length; i++)
                        pxt.HF2.write32(writeBuf, i * 4, samd21flash[i])
                    let code = samd21flash[samd21flash.length - 1] - 1
                    goCmd = sambaCmd("G", code + writeBuf.length - 8)
                    return writeMemAsync(code, writeBuf)
                        .then(() => Promise.mapSeries(lessBlocks, writeBlockAsync))
                        .then(() => {
                            console.log("all done")
                            s.close()
                        })
                })
        })
}