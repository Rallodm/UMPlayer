/* script.js - player logic with improvements:
   - loop & shuffle
   - draggable/interactive progress thumb (scrubbing)
   - theme toggle
   - revokeObjectURL on unload
   - stop previous playback when switching
   - basic localStorage playlist persistence
*/
class MediaPlayer {
  constructor() {
    this.currentMedia = null;
    this.playlist = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.loop = false;
    this.shuffle = false;
    this.objectUrls = new Set();

    this.initElements();
    this.bindEvents();
    this.restoreState();
  }

  initElements() {
    this.mediaDisplay = document.getElementById('mediaDisplay');
    this.dropZone = document.getElementById('dropZone');
    this.controls = document.getElementById('controls');
    this.playBtn = document.getElementById('playBtn');
    this.prevBtn = document.getElementById('prevBtn');
    this.nextBtn = document.getElementById('nextBtn');
    this.muteBtn = document.getElementById('muteBtn');
    this.progressBar = document.getElementById('progressBar');
    this.progressFill = document.getElementById('progressFill');
    this.thumb = document.getElementById('thumb');
    this.volumeSlider = document.getElementById('volumeSlider');
    this.timeDisplay = document.getElementById('timeDisplay');
    this.fileInput = document.getElementById('fileInput');
    this.playlistEl = document.getElementById('playlist');
    this.mediaInfo = document.getElementById('mediaInfo');
    this.fileNameEl = document.getElementById('fileName');
    this.fileTypeEl = document.getElementById('fileType');
    this.fileSizeEl = document.getElementById('fileSize');
    this.loopBtn = document.getElementById('loopBtn');
    this.shuffleBtn = document.getElementById('shuffleBtn');
    this.chooseBtn = document.getElementById('chooseBtn');
    this.loading = document.getElementById('loading');
    this.themeToggle = document.getElementById('themeToggle');
    this.ghLink = document.getElementById('ghLink');

    // update GitHub link (placeholder - set when packaging)
    this.ghLink.href = 'https://github.com/your-username/universal-media-player-pro';
  }

  bindEvents() {
    this.dropZone.addEventListener('click', ()=> this.fileInput.click());
    this.dropZone.addEventListener('dragover', this.handleDragOver.bind(this));
    this.dropZone.addEventListener('dragleave', this.handleDragLeave.bind(this));
    this.dropZone.addEventListener('drop', this.handleDrop.bind(this));
    this.fileInput.addEventListener('change', e => this.handleFiles(e.target.files));
    this.playBtn.addEventListener('click', ()=> this.togglePlay());
    this.prevBtn.addEventListener('click', ()=> this.playPrevious());
    this.nextBtn.addEventListener('click', ()=> this.playNext());
    this.muteBtn.addEventListener('click', ()=> this.toggleMute());
    this.volumeSlider.addEventListener('input', e => this.setVolume(e.target.value));
    this.progressBar.addEventListener('click', e => this.seek(e));
    this.loopBtn.addEventListener('click', ()=> this.toggleLoop());
    this.shuffleBtn.addEventListener('click', ()=> this.toggleShuffle());
    this.chooseBtn.addEventListener('click', ()=> this.fileInput.click());
    this.themeToggle.addEventListener('click', ()=> this.toggleTheme());

    // progress thumb dragging
    this.thumbDragging = false;
    this.thumb.addEventListener('mousedown', e => this.startThumbDrag(e));
    window.addEventListener('mousemove', e => this.onThumbMove(e));
    window.addEventListener('mouseup', e => this.endThumbDrag(e));
    // touch support
    this.thumb.addEventListener('touchstart', e => this.startThumbDrag(e));
    window.addEventListener('touchmove', e => this.onThumbMove(e));
    window.addEventListener('touchend', e => this.endThumbDrag(e));

    // keyboard
    document.addEventListener('keydown', e => this.handleKeyboard(e));

    // revoke object URLs on unload
    window.addEventListener('beforeunload', ()=> this.cleanupUrls());
  }

  handleDragOver(e){
    e.preventDefault();
    this.dropZone.classList.add('dragover');
  }
  handleDragLeave(e){
    e.preventDefault();
    this.dropZone.classList.remove('dragover');
  }
  handleDrop(e){
    e.preventDefault();
    this.dropZone.classList.remove('dragover');
    this.handleFiles(e.dataTransfer.files);
  }

  handleFiles(files){
    const mediaFiles = Array.from(files).filter(file =>
      file.type.startsWith('video/') ||
      file.type.startsWith('audio/') ||
      file.type.startsWith('image/')
    );
    if(mediaFiles.length === 0){ this.showError('No supported media files found'); return; }

    // append to playlist rather than replace
    this.playlist = this.playlist.concat(mediaFiles);
    if(this.playlist.length === 0) return;
    if(this.currentMedia === null) {
      this.currentIndex = 0;
      this.loadMedia(this.playlist[0]);
    }
    this.updatePlaylist();
    this.saveState();
  }

  loadMedia(file){
    this.clearError();
    // stop previous
    if(this.currentMedia && (this.currentMedia.tagName === 'AUDIO' || this.currentMedia.tagName === 'VIDEO')) {
      try { this.currentMedia.pause(); } catch(e){}
    }
    // remove element
    if(this.currentMedia){ this.currentMedia.remove(); this.currentMedia = null; }

    const type = (file.type || '').split('/')[0] || 'unknown';
    let el;
    if(type === 'image'){
      el = document.createElement('img');
      this.controls.style.display = 'none';
    } else if(type === 'audio' || type === 'video') {
      el = document.createElement(type);
      el.controls = false;
      el.preload = 'metadata';
      this.controls.style.display = 'block';
    } else {
      this.showError('Unsupported file type');
      return;
    }

    el.className = 'media-element';
    const url = URL.createObjectURL(file);
    el.src = url;
    this.objectUrls.add(url);

    if(type !== 'image'){
      el.addEventListener('loadedmetadata', ()=> this.onMediaLoaded());
      el.addEventListener('timeupdate', ()=> this.updateProgress());
      el.addEventListener('ended', ()=> this.onMediaEnded());
      el.addEventListener('error', (e)=> this.handleMediaError(e));
      // set volume to current slider
      el.volume = this.volumeSlider.value / 100;
    }

    this.currentMedia = el;
    this.mediaDisplay.appendChild(el);
    this.dropZone.classList.add('hidden');
    this.updateMediaInfo(file);
    this.updatePlaylist();
    this.showLoading(false);
  }

  onMediaLoaded(){
    this.updateTimeDisplay();
    // auto-play when a new media loads (optional)
    if(!this.isPlaying){
      // leave paused until user presses play; commentary: we won't auto-play to avoid autoplay policies
    }
  }

  onMediaEnded(){
    if(this.loop){
      this.currentMedia.currentTime = 0;
      this.currentMedia.play();
      return;
    }
    this.playNext();
  }

  handleMediaError(e){
    const err = e?.target?.error;
    let message = 'Unable to play this media file';
    if(err){
      switch(err.code){
        case 1: message='Media playback was aborted'; break;
        case 2: message='Network error while loading media'; break;
        case 3: message='Media decoding failed'; break;
        case 4: message='Media format not supported'; break;
      }
    }
    this.showError(message);
  }

  showError(message){
    this.clearError();
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
      <div class="error-content">
        <div class="error-icon">⚠️</div>
        <div class="error-title">Error</div>
        <div class="error-text">${message}</div>
        <button class="file-btn" id="retryBtn">Try Again</button>
      </div>
    `;
    this.mediaDisplay.appendChild(errorDiv);
    const retry = document.getElementById('retryBtn');
    if(retry) retry.addEventListener('click', ()=> this.clearError());
  }
  clearError(){ const e = this.mediaDisplay.querySelector('.error-message'); if(e) e.remove(); this.dropZone.classList.remove('hidden'); }

  updateMediaInfo(file){
    this.fileNameEl.textContent = file.name;
    this.fileTypeEl.textContent = file.type || 'Unknown';
    this.fileSizeEl.textContent = this.formatFileSize(file.size || 0);
    this.mediaInfo.classList.add('show');
  }

  formatFileSize(bytes){
    if(bytes===0) return '0 Bytes';
    const k = 1024; const sizes=['Bytes','KB','MB','GB'];
    const i = Math.floor(Math.log(bytes)/Math.log(k));
    return parseFloat((bytes/Math.pow(k,i)).toFixed(2)) + ' ' + sizes[i];
  }

  togglePlay(){
    if(!this.currentMedia || this.currentMedia.tagName === 'IMG') return;
    if(this.isPlaying){
      this.currentMedia.pause();
      this.playBtn.innerHTML = '▶';
    } else {
      this.currentMedia.play().catch(e=>{
        console.warn('Playback failed',e);
        this.showError('Unable to play media (autoplay blocked?)');
      });
      this.playBtn.innerHTML = '⏸';
    }
    this.isPlaying = !this.isPlaying;
  }

  playPrevious(){
    if(this.playlist.length===0) return;
    if(this.shuffle){ this.currentIndex = Math.floor(Math.random()*this.playlist.length); }
    else { this.currentIndex = (this.currentIndex -1 + this.playlist.length) % this.playlist.length; }
    this.loadMedia(this.playlist[this.currentIndex]);
    this.saveState();
  }

  playNext(){
    if(this.playlist.length===0) return;
    if(this.shuffle){ this.currentIndex = Math.floor(Math.random()*this.playlist.length); }
    else { this.currentIndex = (this.currentIndex +1) % this.playlist.length; }
    this.loadMedia(this.playlist[this.currentIndex]);
    this.saveState();
  }

  toggleMute(){
    if(!this.currentMedia || this.currentMedia.tagName === 'IMG') return;
    this.currentMedia.muted = !this.currentMedia.muted;
    this.muteBtn.innerHTML = this.currentMedia.muted ? '🔇' : '🔊';
  }

  setVolume(value){
    if(!this.currentMedia || this.currentMedia.tagName === 'IMG') return;
    this.currentMedia.volume = value/100;
  }

  seek(e){
    if(!this.currentMedia || this.currentMedia.tagName === 'IMG') return;
    const rect = this.progressBar.getBoundingClientRect();
    const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    this.currentMedia.currentTime = percent * this.currentMedia.duration;
    this.updateProgress();
  }

  updateProgress(){
    if(!this.currentMedia || this.currentMedia.tagName === 'IMG') return;
    const percent = (this.currentMedia.currentTime / this.currentMedia.duration) * 100;
    this.progressFill.style.width = percent + '%';
    this.updateTimeDisplay();
  }

  updateTimeDisplay(){
    if(!this.currentMedia || this.currentMedia.tagName === 'IMG') return;
    const current = this.formatTime(this.currentMedia.currentTime);
    const duration = this.formatTime(this.currentMedia.duration);
    this.timeDisplay.textContent = `${current} / ${duration}`;
  }

  formatTime(seconds){
    if(isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds/60); const secs = Math.floor(seconds%60);
    return `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
  }

  updatePlaylist(){
    if(this.playlist.length <= 1){ this.playlistEl.classList.remove('show'); this.playlistEl.innerHTML=''; return; }
    this.playlistEl.innerHTML = '';
    this.playlist.forEach((file, idx) => {
      const item = document.createElement('div');
      item.className = 'playlist-item' + (idx===this.currentIndex ? ' active' : '');
      item.innerHTML = `<span>${idx+1}. ${file.name}</span><button class="small-btn" data-idx="${idx}">Play</button>`;
      item.querySelector('button').addEventListener('click', (e)=> {
        const i = Number(e.target.dataset.idx);
        this.currentIndex = i; this.loadMedia(this.playlist[i]); this.saveState();
      });
      this.playlistEl.appendChild(item);
    });
    this.playlistEl.classList.add('show');
  }

  handleKeyboard(e){
    if(!this.currentMedia || this.currentMedia.tagName === 'IMG') return;
    switch(e.key){
      case ' ': e.preventDefault(); this.togglePlay(); break;
      case 'ArrowLeft': this.currentMedia.currentTime = Math.max(0,this.currentMedia.currentTime - 5); break;
      case 'ArrowRight': this.currentMedia.currentTime = Math.min(this.currentMedia.duration, this.currentMedia.currentTime + 5); break;
      case 'ArrowUp': this.volumeSlider.value = Math.min(100, Number(this.volumeSlider.value) + 10); this.setVolume(this.volumeSlider.value); break;
      case 'ArrowDown': this.volumeSlider.value = Math.max(0, Number(this.volumeSlider.value) - 10); this.setVolume(this.volumeSlider.value); break;
    }
  }

  toggleLoop(){ this.loop = !this.loop; this.loopBtn.style.opacity = this.loop ? '1' : '0.7'; }
  toggleShuffle(){ this.shuffle = !this.shuffle; this.shuffleBtn.style.opacity = this.shuffle ? '1' : '0.7'; }

  // Thumb dragging handlers
  startThumbDrag(e){
    e.preventDefault();
    this.thumbDragging = true;
  }
  onThumbMove(e){
    if(!this.thumbDragging || !this.currentMedia || this.currentMedia.tagName === 'IMG') return;
    const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
    const rect = this.progressBar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    this.progressFill.style.width = (pct*100) + '%';
    // don't update time yet until mouseup to avoid stutter
  }
  endThumbDrag(e){
    if(!this.thumbDragging) return;
    this.thumbDragging = false;
    if(!this.currentMedia || this.currentMedia.tagName === 'IMG') return;
    const clientX = (e.changedTouches ? e.changedTouches[0].clientX : e.clientX);
    const rect = this.progressBar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    this.currentMedia.currentTime = pct * this.currentMedia.duration;
  }

  saveState(){
    try{
      // Only save minimal metadata (names/types) to avoid storing large binary data.
      const meta = this.playlist.map(f => ({name:f.name, type:f.type, size:f.size}));
      localStorage.setItem('ump_playlist_meta', JSON.stringify(meta));
      localStorage.setItem('ump_index', String(this.currentIndex));
    }catch(e){}
  }

  restoreState(){
    // We only restore index and display; re-uploading files is required to actually play again.
    try{
      const meta = JSON.parse(localStorage.getItem('ump_playlist_meta') || 'null');
      const idx = Number(localStorage.getItem('ump_index') || '0');
      if(Array.isArray(meta) && meta.length>0){
        // show an info that playlist was saved (not auto-loaded due to security)
        // optional: show saved playlist names in UI
        this.playlistEl.innerHTML = '<div class="playlist-item">Previously saved playlist (reopen files to play)</div>';
        this.playlistEl.classList.add('show');
      }
      this.currentIndex = isFinite(idx) ? idx : 0;
    }catch(e){}
  }

  cleanupUrls(){
    this.objectUrls.forEach(u => {
      try{ URL.revokeObjectURL(u); }catch(e){}
    });
    this.objectUrls.clear();
  }

  showLoading(state=true){ this.loading.classList.toggle('hidden', !state); }

  // simple helper to show errors for user (non-blocking)
  showErrorMessage(text){
    console.error(text);
  }
}

// initialize global
const player = new MediaPlayer();

// Expose helper for dev/testing
window.player = player;
