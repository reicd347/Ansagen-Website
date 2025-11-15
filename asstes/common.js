// Common sample data and audio helpers
const ICONS = {
  'Bus':'🚌', 'U-Bahn':'🚇', 'Tram':'🚊', 'S-Bahn':'🚆'
};

// Demo station list - in real usage ergänze hier die echten Dateien in assets/audio/stations/*.mp3
const SAMPLE_DATA = {
  stations: [
    {id:'m_hbf', name:'München Hbf', audio:'m_hbf.mp3', types:['S-Bahn','Tram','U-Bahn']},
    {id:'marienplatz', name:'Marienplatz', audio:'marienplatz.mp3', types:['S-Bahn','U-Bahn']},
    {id:'sendlinger', name:'Sendlinger Tor', audio:'sendlinger_tor.mp3', types:['U-Bahn','Tram']},
    {id:'gabelsberger', name:'Gabelsbergerstr.', audio:'gabelsberger.mp3', types:['Bus']}
  ],
  // example lines structure: lines['U1'] = { routes: [ [stationId,...], [stationId,...] ] }
  lines: {
    'U1': { routes: [ ['marienplatz','sendlinger'], ['sendlinger','marienplatz'] ] },
    '62': { routes: [ ['gabelsberger','m_hbf'] ] }
  },
  findStationById(id){ return this.stations.find(s=>s.id===id) || null }
};

// Audio utilities: fetch, decode and concatenate into a WAV Blob
async function fetchAudioBuffer(url, audioCtx){
  const resp = await fetch(url);
  if(!resp.ok) throw new Error('Audio file nicht gefunden: '+url);
  const arrayBuffer = await resp.arrayBuffer();
  return await audioCtx.decodeAudioData(arrayBuffer);
}

async function concatAudioFilesToWavBlob(urls){
  const AudioContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext || window.AudioContext;
  if(!AudioContextClass) throw new Error('WebAudio API wird nicht unterstützt.');
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // load buffers serially to avoid heavy parallel fetch
  const buffers = [];
  for(const u of urls){
    const buf = await fetchAudioBuffer(u, audioCtx);
    buffers.push(buf);
  }

  // compute total length
  const sampleRate = 48000; // choose standard
  let totalLength = 0;
  for(const b of buffers) totalLength += Math.floor(b.duration * sampleRate);

  const offline = new OfflineAudioContext(1, totalLength, sampleRate);
  let offset = 0;
  for(const b of buffers){
    // mixdown to mono
    const tmp = offline.createBufferSource();
    const mixed = offline.createBuffer(1, Math.floor(b.duration * sampleRate), sampleRate);
    // simple mixdown (average channels)
    for(let ch=0; ch< b.numberOfChannels; ch++){
      const data = b.getChannelData(ch);
      const target = mixed.getChannelData(0);
      for(let i=0;i<data.length;i++) target[i] = (target[i] || 0) + data[i]/b.numberOfChannels;
    }
    const bufSource = offline.createBufferSource();
    bufSource.buffer = mixed;
    bufSource.connect(offline.destination);
    bufSource.start(offset / sampleRate);
    offset += mixed.length;
  }

  const rendered = await offline.startRendering();
  // convert to WAV
  const wav = audioBufferToWav(rendered);
  return new Blob([wav], {type:'audio/wav'});
}

// from https://github.com/Jam3/audiobuffer-to-wav (small adapted helper)
function audioBufferToWav(buffer, opt){
  opt = opt || {}
  var numChannels = buffer.numberOfChannels
  var sampleRate = buffer.sampleRate
  var format = opt.float32 ? 3 : 1
  var bitDepth = format === 3 ? 32 : 16
  var result
  if (numChannels === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1))
  } else {
    result = buffer.getChannelData(0)
  }
  return encodeWAV(result, numChannels, sampleRate, bitDepth, format)
}

function interleave(inputL, inputR){
  var length = inputL.length + inputR.length
  var result = new Float32Array(length)
  var index = 0
  var inputIndex = 0
  while (index < length){
    result[index++] = inputL[inputIndex]
    result[index++] = inputR[inputIndex]
    inputIndex++
  }
  return result
}

function encodeWAV(samples, numChannels, sampleRate, bitDepth, format){
  var bytesPerSample = bitDepth / 8
  var blockAlign = numChannels * bytesPerSample
  var buffer = new ArrayBuffer(44 + samples.length * bytesPerSample)
  var view = new DataView(buffer)
  /* RIFF identifier */ writeString(view, 0, 'RIFF')
  /* file length */ view.setUint32(4, 36 + samples.length * bytesPerSample, true)
  /* RIFF type */ writeString(view, 8, 'WAVE')
  /* format chunk identifier */ writeString(view, 12, 'fmt ')
  /* format chunk length */ view.setUint32(16, 16, true)
  /* sample format (raw) */ view.setUint16(20, format === 3 ? 3 : 1, true)
  /* channel count */ view.setUint16(22, numChannels, true)
  /* sample rate */ view.setUint32(24, sampleRate, true)
  /* byte rate (sample rate * block align) */ view.setUint32(28, sampleRate * blockAlign, true)
  /* block align (channel count * bytes per sample) */ view.setUint16(32, blockAlign, true)
  /* bits per sample */ view.setUint16(34, bitDepth, true)
  /* data chunk identifier */ writeString(view, 36, 'data')
  /* data chunk length */ view.setUint32(40, samples.length * bytesPerSample, true)
  if (bitDepth === 16){
    floatTo16BitPCM(view, 44, samples)
  } else {
    writeFloat32(view, 44, samples)
  }
  return buffer
}

function floatTo16BitPCM(output, offset, input){
  for (var i = 0; i < input.length; i++, offset += 2){
    var s = Math.max(-1, Math.min(1, input[i]))
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }
}
function writeFloat32(output, offset, input){
  for (var i = 0; i < input.length; i++, offset += 4){
    output.setFloat32(offset, input[i], true)
  }
}

function writeString(view, offset, string){
  for (var i = 0; i < string.length; i++){
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

function triggerDownload(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 60000);
}

// helper to find station by id
SAMPLE_DATA.findStationById = function(id){ return this.stations.find(s=>s.id===id) || {id:'?',name:id,audio:'placeholder.mp3'} }

// small DOM escape
function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;') }
