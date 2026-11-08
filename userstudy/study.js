/* Public study UI. Method identities are deliberately absent from this file. */
(() => {
  'use strict';
  const config = window.SWIM_STUDY_CONFIG;
  const app = document.getElementById('app');
  const letters = ['A', 'B', 'C'];
  const sequence = [...config.clips.slice(0, 8).map(c => c.id), 'attention', ...config.clips.slice(8).map(c => c.id), 'review'];
  const storageKey = 'swim.study.' + config.version + (config.collector ? '' : '.preview');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const blank = () => ({version: config.version, id: crypto.randomUUID(), nonce: crypto.randomUUID(), startedAt: new Date().toISOString(), consent: false, swimming: '', technical: '', answers: {}, attention: '', comments: '', step: 0, receipt: null, pendingBody: null, reviewEdit: null, revision: 0, resumeCount: 0});
  let state = blank(), storageWorks = true, screen = 'intro', cleanup = () => {}, submitting = false;
  let collectionProblem = '';
  const completeRank = rank => Array.isArray(rank) && rank.length === 3 && letters.every(l => rank.includes(l));
  const countAnswers = () => config.clips.filter(c => completeRank(state.answers[c.id]?.rank)).length;
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (raw && raw.version === config.version && /^[a-f0-9-]{36}$/i.test(raw.id) && /^[a-f0-9-]{36}$/i.test(raw.nonce)) {
      state = {...blank(), ...raw, answers: raw.answers && typeof raw.answers === 'object' ? raw.answers : {}};
      state.step = Math.max(0, Math.min(sequence.length - 1, Number(state.step) || 0));
      for (const clip of config.clips) {
        const a = state.answers[clip.id];
        if (!a) continue;
        if (!Array.isArray(a.rank) || a.rank.some(l => !letters.includes(l)) || new Set(a.rank).size !== a.rank.length || a.rank.length > 3) a.rank = [];
        a.watchedSeconds = Math.max(0, Number(a.watchedSeconds) || 0);
      }
    }
  } catch { storageWorks = false; }
  let resuming = state.consent, progressTimer;
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch { storageWorks = false; }
  }
  function trackProgress(status = 'active', immediate = false) {
    if (!config.collector || !state.consent || state.receipt || state.pendingBody) return;
    clearTimeout(progressTimer);
    const send = () => {
      state.revision = (Number(state.revision) || 0) + 1; save();
      const body = JSON.stringify({kind:'progress',version:config.version,id:state.id,nonce:state.nonce,consent:true,
        startedAt:state.startedAt,status,ranked:countAnswers(),step:sequence[state.step],resumeCount:state.resumeCount,revision:state.revision});
      fetch(config.collector, {method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body,keepalive:true}).catch(() => {});
    };
    if (immediate) send(); else progressTimer = setTimeout(send, 750);
  }
  function beginStudy() {
    if (resuming) {state.resumeCount = (Number(state.resumeCount) || 0) + 1; resuming = false;}
    goTo(state.step);
  }
  function newScreen() { cleanup(); cleanup = () => {}; app.innerHTML = ''; }
  function goTo(step) {
    state.step = Math.max(0, Math.min(sequence.length - 1, step)); save(); screen = 'study'; render();
    window.scrollTo({top: 0, behavior: 'instant'}); app.focus({preventScroll: true});
    trackProgress();
  }
  function notice() {
    if (!config.collector) return '<div class="notice notice-warning" role="status"><strong>Preview</strong> · This study is not yet accepting responses. You can explore the videos and ranking interface.</div>';
    if (collectionProblem) return '<div class="notice notice-error" role="status">The submission service is temporarily unavailable. Your progress is saved on this device. <button class="button button-small" id="retry-connection" type="button">Retry connection</button></div>';
    return '';
  }
  function field(name, title, options) {
    return '<fieldset><legend>' + title + '</legend><div class="choices">' + options.map(([value, label]) => '<label class="choice"><input required type="radio" name="' + name + '" value="' + value + '" ' + (state[name] === value ? 'checked' : '') + '><span>' + label + '</span></label>').join('') + '</div></fieldset>';
  }
  function renderIntro() {
    newScreen();
    document.getElementById('header-status').textContent = '16 videos · About 10 minutes';
    app.innerHTML = '<section class="intro"><div id="collection-notice">' + notice() + '</div>' +
      '<p class="eyebrow">A study of movement and water</p><h1>SWIM Motion Quality<br>Ablation Study</h1>' +
      '<div class="intro-copy"><p>Each video shows three simulated characters (A, B, and C) performing the same swimming stroke in the same pool. Watch each video to the end, preferably in full screen, and replay as needed.</p><p>Rank the characters from most to least natural, considering their movements and interaction with the water. Use each letter once. The method assigned to each letter varies across videos.</p><p>There are no right or wrong answers. We do not collect names or email addresses. We record anonymous progress to identify incomplete sessions.</p></div>' +
      '<div class="study-facts"><div class="fact"><strong>16 videos</strong><span>8 seconds each</span></div><div class="fact"><strong>Rank A, B, C</strong><span>Most to least natural</span></div><div class="fact"><strong>About 10 minutes</strong><span>Replay as needed</span></div></div>' +
      (state.consent ? '<div class="notice resume-notice"><span>Continue where you left off: <strong>' + countAnswers() + ' of 16</strong> videos ranked.</span><button class="button button-small" id="resume">Resume study</button></div>' : '') +
      '<form id="welcome-form" class="form-section"><h2>Before you begin</h2>' +
      field('swimming', 'What is your swimming experience?', [['none','No swimming experience'],['recreational','Recreational swimming'],['experienced','Competitive swimming, coaching, or lifeguarding']]) +
      field('technical', 'Do you have experience in computer graphics, robotics, or reinforcement learning?', [['none','No'],['some','Some (coursework or personal projects)'],['professional','Yes (research or professional experience)']]) +
      '<label class="consent"><input type="checkbox" name="consent" required ' + (state.consent ? 'checked' : '') + '><span>I have read the study description and agree to participate. I can stop at any time.</span></label>' +
      '<div class="form-actions"><span class="small-note">For the clearest view, use a laptop or desktop.<br>To continue later, return on the same device and browser.</span><button class="button button-primary" type="submit">' + (config.collector ? 'Start study' : 'Preview study') + ' <span aria-hidden="true">→</span></button></div></form>' +
      (!storageWorks ? '<p class="storage-warning">Progress cannot be saved in this browser. Keep this tab open until you submit.</p>' : '') + '</section>';
    document.getElementById('welcome-form').addEventListener('submit', e => {
      e.preventDefault(); const values = new FormData(e.currentTarget);
      state.swimming = values.get('swimming'); state.technical = values.get('technical'); state.consent = values.get('consent') === 'on'; save(); beginStudy();
    });
    document.getElementById('resume')?.addEventListener('click', beginStudy);
    document.getElementById('retry-connection')?.addEventListener('click', checkCollection);
  }
  function progress() {
    const count = countAnswers();
    return '<div class="progress-wrap"><div class="progress-label"><span>Progress</span><span>' + count + ' / 16 ranked</span></div><div class="progress" role="progressbar" aria-label="Videos ranked" aria-valuemin="0" aria-valuemax="16" aria-valuenow="' + count + '"><span style="width:' + count / 16 * 100 + '%"></span></div></div>';
  }
  function renderVideo(id) {
    newScreen();
    const clip = config.clips.find(c => c.id === id), index = config.clips.indexOf(clip);
    const answer = state.answers[id] ||= {rank: [], watchedSeconds: 0, completedPlays: 0};
    document.getElementById('header-status').textContent = 'Video ' + (index + 1) + ' of 16';
    app.innerHTML = '<section class="study"><div class="study-top"><div class="study-heading"><h1>Video ' + String(index + 1).padStart(2, '0') + ' <span style="color:var(--muted);font-weight:400">/ 16</span></h1><p>' + escape(clip.stroke) + ' · 8 seconds · Side view</p></div>' + progress() + '</div>' +
      '<div class="study-layout"><div><div class="player" id="player"><div class="video-stage" id="video-stage"><video id="study-video" autoplay muted playsinline webkit-playsinline preload="auto" poster="posters/' + id + '.jpg" aria-label="Characters A, B, and C performing ' + escape(clip.stroke.toLowerCase()) + '"><source src="' + escape(config.mediaBase + id + '.mp4') + '" type="video/mp4"></video><span class="player-loader" id="video-loading">Loading video…</span><button type="button" class="player-play" id="tap-play" hidden>Tap to play</button><div class="player-error" id="video-error" hidden>Video could not load. <button class="button button-small" id="reload-video">Try again</button> <a href="' + escape(config.mediaBase + id + '.mp4') + '" target="_blank" rel="noopener">Open video</a></div></div>' +
      '<div class="controls"><button class="button button-small" id="play" type="button">Play</button><button class="button button-small" id="replay" type="button">Replay</button><input class="timeline" id="timeline" type="range" min="0" max="8" step="0.01" value="0" aria-label="Video position"><span class="time" id="time">0.0 / 8.0 s</span><button class="button button-small" id="fullscreen" type="button">Full screen</button></div>' +
      '<div class="view-controls"><span class="view-label">View</span>' + ['All','A','B','C'].map((l,i) => '<button type="button" class="view-button" data-panel="' + (i - 1) + '" aria-pressed="' + (i === 0) + '" aria-label="' + (i === 0 ? 'View all characters' : 'Enlarge character ' + l) + '">' + l + '</button>').join('') + '<button class="view-button" id="enlarge" aria-pressed="false" type="button">Larger view</button><span class="quality-label">Original quality · 50 fps · 1× speed</span></div></div>' +
      '<p class="video-note">Watch the full video. Use A, B, or C above to inspect one character, then return to All to compare.</p></div><aside class="rank-panel" id="rank-panel" aria-label="Rank the characters"></aside></div></section>';
    const video = document.getElementById('study-video'), player = document.getElementById('player'), stage = document.getElementById('video-stage');
    const play = document.getElementById('play'), timeline = document.getElementById('timeline'), time = document.getElementById('time');
    const loading = document.getElementById('video-loading'), videoError = document.getElementById('video-error'), tapPlay = document.getElementById('tap-play');
    let lastTime = 0, lastSave = 0;
    let disposed = false;
    video.muted = true; video.defaultMuted = true; video.playsInline = true;
    const playVideo = () => video.play().catch(error => {
      if (disposed || error.name === 'AbortError') return;
      play.textContent = 'Play'; loading.hidden = true;
      if (error.name === 'NotAllowedError') tapPlay.hidden = false; else videoError.hidden = false;
    });
    tapPlay.addEventListener('click', playVideo);
    play.addEventListener('click', () => video.paused ? playVideo() : video.pause());
    video.addEventListener('click', () => video.paused ? playVideo() : video.pause());
    document.getElementById('replay').addEventListener('click', () => {video.currentTime = 0; lastTime = 0; playVideo();});
    document.getElementById('reload-video').addEventListener('click', () => {videoError.hidden = true; loading.hidden = false; video.load(); playVideo();});
    video.addEventListener('loadeddata', () => {loading.hidden = true;});
    video.addEventListener('waiting', () => {loading.hidden = false;});
    video.addEventListener('playing', () => {loading.hidden = true; tapPlay.hidden = true; play.textContent = 'Pause';});
    video.addEventListener('pause', () => {play.textContent = 'Play'; save();});
    video.addEventListener('error', () => {loading.hidden = true; videoError.hidden = false;});
    video.querySelector('source').addEventListener('error', () => {loading.hidden = true; videoError.hidden = false;});
    video.addEventListener('ended', () => {answer.completedPlays = Math.min(10000, (answer.completedPlays || 0) + 1); play.textContent = 'Play'; save();});
    video.addEventListener('seeking', () => {lastTime = video.currentTime;});
    video.addEventListener('timeupdate', () => {
      const delta = video.currentTime - lastTime;
      if (!document.hidden && !video.seeking && delta > 0 && delta < 1) answer.watchedSeconds = Math.min(3600, answer.watchedSeconds + delta);
      lastTime = video.currentTime; timeline.value = String(video.currentTime);
      time.textContent = video.currentTime.toFixed(1) + ' / 8.0 s';
      if (Date.now() - lastSave > 1500) {save(); lastSave = Date.now();}
    });
    timeline.addEventListener('input', () => {video.currentTime = Number(timeline.value); lastTime = video.currentTime;});
    document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => {
      const panel = Number(button.dataset.panel); stage.classList.toggle('focused', panel >= 0);
      if (panel >= 0) {
        const cropHeight = clip.panelHeight + 24;
        stage.style.setProperty('--focus-ratio', String(2112 / cropHeight));
        stage.style.setProperty('--focus-height', (2046 / cropHeight * 100) + '%');
        stage.style.setProperty('--focus-top', (-(clip.panelY[panel] - 12) / cropHeight * 100) + '%');
      }
      document.querySelectorAll('[data-panel]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    }));
    document.getElementById('enlarge').addEventListener('click', e => {const expanded = stage.classList.toggle('enlarged'); e.currentTarget.setAttribute('aria-pressed', String(expanded)); e.currentTarget.textContent = expanded ? 'Fit view' : 'Larger view';});
    document.getElementById('fullscreen').addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (player.requestFullscreen) await player.requestFullscreen();
        else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
        else {stage.classList.add('enlarged'); player.scrollIntoView({block:'start'});}
      } catch {stage.classList.add('enlarged');}
    });
    const fs = () => {const b = document.getElementById('fullscreen'); if (b) b.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';};
    document.addEventListener('fullscreenchange', fs);
    const visibility = () => {if (document.hidden) video.pause();};
    document.addEventListener('visibilitychange', visibility);
    const loadingTimeout = setTimeout(() => {if (!disposed && video.paused && !videoError.hidden) return; if (!disposed && video.paused) {loading.hidden = true; tapPlay.hidden = false;}}, 6000);
    cleanup = () => {disposed = true; clearTimeout(loadingTimeout); video.pause(); save(); document.removeEventListener('fullscreenchange', fs); document.removeEventListener('visibilitychange', visibility); video.removeAttribute('src'); video.querySelector('source')?.remove(); video.load();};
    renderRanking(id);
    playVideo();
  }
  function renderRanking(id) {
    const answer = state.answers[id]; const rank = answer.rank;
    const editing = state.reviewEdit?.clip === id;
    document.getElementById('rank-panel').innerHTML = '<p class="eyebrow">Your impression</p><h2>Which looks most natural?</h2><p>Rank the characters from most to least natural, considering their movements and interaction with the water.</p>' +
      '<div class="rank-prompt" role="status">' + (rank.length === 0 ? 'Choose the most natural character.' : rank.length === 1 ? 'Now choose the second most natural.' : 'Your ranking is complete.') + '</div>' +
      '<div class="letter-buttons">' + letters.map(l => '<button class="letter-button" type="button" data-letter="' + l + '" aria-label="Rank character ' + l + '" aria-pressed="' + rank.includes(l) + '" ' + (rank.includes(l) || rank.length === 3 ? 'disabled' : '') + '>' + l + '</button>').join('') + '</div>' +
      '<ol class="ranking-list">' + ['1st (most natural)','2nd','3rd (least natural)'].map((label,i) => '<li class="rank-row"><span>' + label + '</span><strong>' + (rank[i] || '·') + '</strong></li>').join('') + '</ol>' +
      '<div class="ranking-tools"><button type="button" class="button button-quiet" id="reset-rank" ' + (!rank.length ? 'disabled' : '') + '>Reset ranking</button></div>' +
      '<div class="rank-actions"><button type="button" class="button" id="previous">' + (editing ? 'Cancel' : 'Back') + '</button><button type="button" class="button button-primary" id="next" ' + (!completeRank(rank) ? 'disabled' : '') + '>' + (editing ? 'Save and return' : id === 'clip16' ? 'Review answers' : 'Next video') + ' <span aria-hidden="true">→</span></button></div><div class="saved-note">' + (storageWorks ? 'Progress saved in this browser' : 'Keep this tab open. Progress cannot be saved in this browser.') + '</div>';
    document.querySelectorAll('[data-letter]').forEach(b => b.addEventListener('click', () => {
      answer.rank.push(b.dataset.letter);
      if (answer.rank.length === 2) answer.rank.push(letters.find(l => !answer.rank.includes(l)));
      save(); trackProgress(); renderRanking(id);
      const wrap = document.querySelector('.progress-wrap'); if (wrap) wrap.outerHTML = progress();
      if (completeRank(answer.rank)) document.getElementById('next').focus({preventScroll: true});
    }));
    document.getElementById('reset-rank').addEventListener('click', () => {answer.rank = []; save(); trackProgress(); renderRanking(id); const wrap = document.querySelector('.progress-wrap'); if (wrap) wrap.outerHTML = progress();});
    document.getElementById('next').addEventListener('click', () => editing ? finishEdit(false) : goTo(state.step + 1));
    document.getElementById('previous').addEventListener('click', () => {if (editing) finishEdit(true); else if (state.step === 0) {screen = 'intro'; render(); window.scrollTo(0,0);} else goTo(state.step - 1);});
  }
  function beginEdit(id) {
    state.reviewEdit = {clip:id,originalRank:[...(state.answers[id]?.rank || [])],scrollY:window.scrollY};
    goTo(sequence.indexOf(id));
  }
  function finishEdit(cancel) {
    const edit = state.reviewEdit;
    if (cancel) state.answers[edit.clip].rank = edit.originalRank;
    state.reviewEdit = null;
    goTo(sequence.indexOf('review'));
    window.scrollTo(0, edit.scrollY || 0);
    document.querySelector('[data-edit="' + edit.clip + '"]')?.focus({preventScroll:true});
  }
  function renderAttention() {
    newScreen(); document.getElementById('header-status').textContent = 'Halfway through';
    app.innerHTML = '<section class="narrow"><p class="eyebrow">A quick check</p><h1>Halfway through</h1><p>You have ranked the first eight videos. Please select B below.</p><form id="attention-form">' + field('attention', 'Attention check: please select B.', letters.map(l => [l,l])).replace('class="choices"','class="choices attention-choices"') + '<div class="form-actions"><button class="button" type="button" id="back-attention">Back</button><button class="button button-primary" type="submit">Continue</button></div></form></section>';
    document.getElementById('back-attention').addEventListener('click', () => goTo(state.step - 1));
    document.getElementById('attention-form').addEventListener('submit', e => {e.preventDefault(); state.attention = new FormData(e.currentTarget).get('attention'); save(); goTo(state.step + 1);});
  }
  function renderReview() {
    newScreen(); document.getElementById('header-status').textContent = 'Review your answers';
    app.innerHTML = '<section class="narrow"><div id="collection-notice">' + notice() + '</div><p class="eyebrow">One last look</p><h1>Review your rankings</h1><p>Each order runs from most to least natural. You can revisit any video before submitting.</p><div class="review-list">' + config.clips.map((c,i) => '<div class="review-row"><span>Video ' + String(i+1).padStart(2,'0') + '</span><span class="rank-badges">' + escape((state.answers[c.id]?.rank || []).join(' › ') || 'Not ranked') + '</span><button type="button" data-edit="' + c.id + '">Edit</button></div>').join('') + '</div><label for="comments"><strong>Comments (optional)</strong></label><textarea class="text-area" id="comments" maxlength="2000" placeholder="Anything you would like to share?">' + escape(state.comments) + '</textarea><div id="submit-status" role="status"></div><div class="form-actions"><button type="button" class="button" id="back-review">Back</button><button type="button" class="button button-primary" id="submit" ' + (!config.collector || countAnswers() !== 16 || !letters.includes(state.attention) ? 'disabled' : '') + '>Submit responses</button></div><p class="small-note">' + (config.collector ? 'Your rankings are sent only when you submit. Keep this page open until you see a confirmation.' : 'Preview only. No responses will be submitted.') + '</p></section>';
    document.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => beginEdit(b.dataset.edit)));
    document.getElementById('back-review').addEventListener('click', () => beginEdit('clip16'));
    document.getElementById('comments').addEventListener('input', e => {state.comments = e.target.value; save();});
    document.getElementById('submit').addEventListener('click', submit);
    document.getElementById('retry-connection')?.addEventListener('click', checkCollection);
    if (state.pendingBody) {
      document.querySelectorAll('[data-edit],#back-review,#comments').forEach(e => e.disabled = true);
      document.getElementById('submit').textContent = 'Retry submission';
      document.getElementById('submit-status').innerHTML = '<p class="notice">Your submission has not been confirmed. Retry to finish saving the same responses.</p>';
    }
  }
  function makePayload() {
    return {version:config.version,id:state.id,nonce:state.nonce,startedAt:state.startedAt,consent:state.consent,swimming:state.swimming,technical:state.technical,attention:state.attention,comments:state.comments,
      answers:config.clips.map(c => ({clip:c.id,rank:[...state.answers[c.id].rank],watchedSeconds:Math.round((state.answers[c.id].watchedSeconds || 0)*10)/10,completedPlays:state.answers[c.id].completedPlays || 0}))};
  }
  function jsonp(action, params = {}) {
    return new Promise((resolve, reject) => {
      const callback = 'swim_' + crypto.randomUUID().replaceAll('-','');
      const url = new URL(config.collector, location.href); url.searchParams.set('action', action); url.searchParams.set('callback', callback);
      Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
      const script = document.createElement('script'); script.src = url.href;
      let timer;
      const clear = () => {clearTimeout(timer); script.remove(); delete window[callback];};
      window[callback] = data => {clear(); resolve(data);};
      script.onerror = () => {clear(); reject(new Error('Connection failed'));};
      timer = setTimeout(() => {clear(); reject(new Error('Connection timed out'));}, 20000);
      document.head.appendChild(script);
    });
  }
  async function checkCollection() {
    if (!config.collector) return;
    try {const result = await jsonp('health'); if (result.ready !== true || result.version !== config.version || result.protocol !== 2) throw new Error('Not ready'); collectionProblem = '';}
    catch {collectionProblem = 'unavailable';}
    const banner = document.getElementById('collection-notice');
    if (banner) {banner.innerHTML = notice(); document.getElementById('retry-connection')?.addEventListener('click', checkCollection);}
  }
  async function submit() {
    if (submitting || !config.collector || countAnswers() !== 16 || !letters.includes(state.attention)) return;
    submitting = true; save();
    clearTimeout(progressTimer);
    const button = document.getElementById('submit'), status = document.getElementById('submit-status');
    button.disabled = true; button.textContent = 'Saving responses…'; status.innerHTML = '';
    document.querySelectorAll('[data-edit],#back-review,#comments').forEach(e => e.disabled = true);
    try {
      const body = state.pendingBody || JSON.stringify(makePayload());
      state.pendingBody = body; save();
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
      const payloadHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 25000);
      try {await fetch(config.collector, {method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body,signal:controller.signal});}
      finally {clearTimeout(timeout);}
      let receipt;
      for (let i=0; i<4; i++) {
        receipt = await jsonp('receipt', {id:state.id,nonce:state.nonce});
        if (receipt.accepted) break;
        await new Promise(r => setTimeout(r, 1200 * (i+1)));
      }
      if (!receipt?.accepted || receipt.id !== state.id || receipt.payloadHash !== payloadHash) throw new Error('Saving could not be confirmed');
      state.receipt = {id:receipt.id,submittedAt:receipt.submittedAt}; save(); renderSuccess();
    } catch {
      status.innerHTML = '<div class="notice notice-error">We could not confirm that your responses were saved. Your answers are still on this device. Please try again. Retrying will not create a duplicate.</div>';
      button.disabled = false; button.textContent = 'Retry submission';
    } finally {submitting = false;}
  }
  function renderSuccess() {
    newScreen(); document.getElementById('header-status').textContent = 'Study complete';
    app.innerHTML = '<section class="narrow"><div class="success-symbol" aria-hidden="true">✓</div><p class="eyebrow">Study complete</p><h1>Thank you for participating.</h1><p>Your responses have been saved. You can now close this page.</p><p class="small-note">Submission reference</p><span class="receipt">' + escape(state.receipt.id) + '</span></section>';
  }
  function render() {
    if (state.receipt) return renderSuccess();
    if (state.pendingBody) return renderReview();
    if (screen === 'intro') return renderIntro();
    const step = sequence[state.step];
    if (step === 'attention') renderAttention(); else if (step === 'review') renderReview(); else renderVideo(step);
  }
  document.addEventListener('visibilitychange', () => {save(); trackProgress(document.hidden ? 'paused' : 'active', true);});
  window.addEventListener('pagehide', () => {save(); trackProgress('paused', true);});
  // Heartbeats support inactivity estimates, without sending unfinished rankings.
  setInterval(() => {if (!document.hidden && screen === 'study') trackProgress();}, 60000);
  render(); checkCollection();
})();
