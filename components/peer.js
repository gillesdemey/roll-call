const waudio = require('./waudio')
const ZComponent = require('./z-component')
const Visuals = require('./visuals')
const Volume = require('./volume')
const znode = require('znode')
const once = require('once')

const random = () => Math.random().toString(36).substring(7)

class Peer extends ZComponent {
  constructor () {
    super()
    this.files = {}
    this.recordStreams = {}
  }
  async attach (peer, swarm) {
    let speakers = swarm.speakers

    this.id = `peer:${peer.publicKey}`
    peer.on('stream', async stream => {
      let audio = waudio(stream)
      audio.connect(speakers)

      this.audio = audio

      peer.meth.on('stream:znode', async stream => {
        this.rpc = await znode(stream, this.api)
      })
      this.rpc = await znode(peer.meth.stream('znode'), this.api)
    })

    let cleanup = once(() => {
      this.parentNode.removeChild(this)
    })
    peer.on('error', cleanup)
    peer.on('close', cleanup)

    this.peer = peer
  }
  set audio (audio) {
    let visuals = new Visuals()
    visuals.audio = audio
    visuals.setAttribute('slot', 'visuals')
    this.appendChild(visuals)

    let volume = new Volume()
    volume.audio = audio
    volume.setAttribute('slot', 'volume')
    this.appendChild(volume)
    this._audio = audio
  }
  get audio () {
    return this._audio
  }
  set rpc (val) {
    // Fastest connection wins.
    if (this._rpc) return
    this._rpc = val
    this.onRPC(val)
  }
  get rpc () {
    return this._rpc
  }
  get api () {
    return {
      setName: name => this.setName(name),
      record: recid => this.record(recid),
      stop: recid => this.stop(recid),
      read: filename => this.read(filename)
    }
  }
  async read (filename) {
    if (!this.files[filename]) throw new Error('No such file.')

    let f = this.files[filename]
    if (f.buffers.length) {
      return f.buffers.shift()
    }
    if (f.closed) {
      return null
    }
    return new Promise((resolve, reject) => {
      f.stream.once('data', () => {
        resolve(this.read(filename))
      })
    })
  }
  async record (recid) {
    let stream = this.audio.record({video: false, audio: true})
    this.recordStreams[recid] = stream
    let filename = random()
    this.files[filename] = {stream, buffers: [], closed: false}
    stream.on('data', chunk => this.files[filename].buffers.push(chunk))
    let cleanup = once(() => {
      this.files[filename].closed = true
      stream.emit('data', null)
    })
    stream.on('end', cleanup)
    stream.on('close', cleanup)
    stream.on('error', cleanup)
    return filename
  }
  async stop (recid) {
    return this.recordStreams[recid].stop()
  }
  get shadow () {
    return `
    <style>
    :host {
      border-radius: 5px;
      border: 1px solid #E0E1E2;
      width: 290px;
      display: flex;
      flex-direction: column;
      border-radius: 5px;
      border: 1px solid #E0E1E2;
      margin: 5px 5px 5px 5px;
    }
    div.peername {
      font-size: 20px;
      font-family: Lato,'Helvetica Neue',Arial,Helvetica;
      color: #3e4347;
      padding-left: 10px;
      padding-bottom: 5px;
    }
    </style>
    <div class="visuals">
      <slot name="visuals"></slot>
    </div>
    <div class="volume">
      <slot name="volume"></slot>
    </div>
    <div class="peername" contenteditable="true">
      <slot name="peername">Peer Name</slot>
    </div>
   `
  }
}

window.customElements.define('roll-call-peer', Peer)

module.exports = Peer
