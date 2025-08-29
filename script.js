let wavesurfer = WaveSurfer.create({
  container: '#waveform',
  waveColor: '#ccc',
  progressColor: '#007bff',
  height: 128,
  plugins: [
    WaveSurfer.regions.create()
  ]
});

document.getElementById('audioUpload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    wavesurfer.load(event.target.result);
  };
  reader.readAsDataURL(file);
});

document.getElementById('playPause').addEventListener('click', () => {
  wavesurfer.playPause();
});

// Add default region after audio is ready
wavesurfer.on('ready', () => {
  wavesurfer.enableDragSelection({
    color: 'rgba(0, 123, 255, 0.2)'
  });

  wavesurfer.clearRegions();
  const duration = wavesurfer.getDuration();
  wavesurfer.addRegion({
    start: 0,
    end: duration,
    color: 'rgba(0, 123, 255, 0.2)'
  });
});

// Export trimmed audio as blob (for future backend upload)
document.getElementById('trimExport').addEventListener('click', async () => {
  const region = Object.values(wavesurfer.regions.list)[0];
  if (!region) return alert("No region selected!");

  const start = region.start;
  const end = region.end;

  const buffer = await wavesurfer.backend.buffer;
  const sampleRate = buffer.sampleRate;

  const startSample = Math.floor(start * sampleRate);
  const endSample = Math.floor(end * sampleRate);
  const trimmed = buffer.getChannelData(0).slice(startSample, endSample);

  const newBuffer = wavesurfer.backend.ac.createBuffer(
    1,
    trimmed.length,
    sampleRate
  );
  newBuffer.copyToChannel(trimmed, 0);

  const offlineCtx = new OfflineAudioContext(1, trimmed.length, sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = newBuffer;
  source.connect(offlineCtx.destination);
  source.start();

  const renderedBuffer = await offlineCtx.startRendering();
  const blob = bufferToWave(renderedBuffer, renderedBuffer.length);

  const audioURL = URL.createObjectURL(blob);
  const audioElement = document.getElementById('exportedAudio');
  audioElement.src = audioURL;
  audioElement.style.display = 'block';

  // Optional: prepare for upload to backend
  console.log("Trimmed audio blob ready:", blob);
});

// Converts audio buffer to WAV Blob
function bufferToWave(abuffer, len) {
  const numOfChan = abuffer.numberOfChannels;
  const length = len * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [], i, sample, offset = 0, pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4);

  // write interleaved data
  for(i = 0; i < abuffer.numberOfChannels; i++)
    channels.push(abuffer.getChannelData(i));

  while(pos < length) {
    for(i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([buffer], { type: "audio/wav" });

  function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
}
