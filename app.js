/* WordLoop — бесконечный тренажёр слов с ИИ. Чистый JS, без сборки. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var LANGS = [
    { code: 'ru', label: 'Русский', en: 'Russian', voice: 'ru-RU' },
    { code: 'uz', label: "O'zbekcha", en: 'Uzbek', voice: 'uz-UZ' },
    { code: 'en', label: 'English', en: 'English', voice: 'en-US' },
    { code: 'tr', label: 'Türkçe', en: 'Turkish', voice: 'tr-TR' },
    { code: 'de', label: 'Deutsch', en: 'German', voice: 'de-DE' },
    { code: 'es', label: 'Español', en: 'Spanish', voice: 'es-ES' },
    { code: 'fr', label: 'Français', en: 'French', voice: 'fr-FR' },
    { code: 'it', label: 'Italiano', en: 'Italian', voice: 'it-IT' },
    { code: 'pt', label: 'Português', en: 'Portuguese', voice: 'pt-BR' },
    { code: 'kk', label: 'Қазақша', en: 'Kazakh', voice: 'kk-KZ' },
    { code: 'az', label: 'Azərbaycanca', en: 'Azerbaijani', voice: 'az-AZ' },
    { code: 'ka', label: 'ქართული', en: 'Georgian', voice: 'ka-GE' },
    { code: 'uk', label: 'Українська', en: 'Ukrainian', voice: 'uk-UA' },
    { code: 'pl', label: 'Polski', en: 'Polish', voice: 'pl-PL' },
    { code: 'ar', label: 'العربية', en: 'Arabic', voice: 'ar-SA' },
    { code: 'fa', label: 'فارسی', en: 'Persian', voice: 'fa-IR' },
    { code: 'hi', label: 'हिन्दी', en: 'Hindi', voice: 'hi-IN' },
    { code: 'zh', label: '中文', en: 'Chinese', voice: 'zh-CN' },
    { code: 'ja', label: '日本語', en: 'Japanese', voice: 'ja-JP' },
    { code: 'ko', label: '한국어', en: 'Korean', voice: 'ko-KR' }
  ];

  var PRESETS = {
    verbs: [
      'to achieve', 'to explore', 'to overcome', 'to notice', 'to hesitate',
      'to encourage', 'to maintain', 'to struggle', 'to appreciate', 'to distinguish'
    ],
    travel: [
      'boarding pass', 'flight delay', 'customs declaration', 'luggage claim',
      'round-trip ticket', 'layover', 'seatbelt', 'emergency exit', 'currency exchange', 'shuttle bus'
    ],
    it: [
      'refactoring', 'pipeline', 'deployment', 'latency', 'concurrency',
      'deadlock', 'payload', 'dependency', 'throughput', 'endpoint'
    ],
    advanced: [
      'serendipity', 'ephemeral', 'ubiquitous', 'resilience', 'eloquent',
      'ambiguity', 'tenacious', 'profound', 'meticulous', 'pragmatic'
    ]
  };

  var BUILTIN_DICT = {
    'hello': 'привет', 'world': 'мир', 'sunshine': 'солнечный свет', 'weather': 'погода',
    'journey': 'путешествие', 'brave': 'храбрый', 'quiet': 'тихий', 'to achieve': 'достигать',
    'to borrow': 'одалживать', 'narrow': 'узкий', 'to explain': 'объяснять', 'advice': 'совет',
    'to waste': 'тратить впустую', 'deep': 'глубокий', 'to notice': 'замечать', 'to remember': 'помнить',
    'apple': 'яблоко', 'house': 'дом', 'cat': 'кошка', 'dog': 'собака', 'car': 'машина',
    'resilience': 'стрессоустойчивость', 'serendipity': 'счастливая случайность',
    'ephemeral': 'мимолётный', 'ubiquitous': 'вездесущий', 'eloquent': 'красноречивый'
  };

  var CFG_KEY = 'wordloop.cfg';
  var SESSION_KEY = 'wordloop.session';
  var SOUND_KEY = 'wordloop.sound';
  var CHUNK = 35;

  var state = {
    cfg: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '', target: 'ru', dir: 'mixed' },
    serverAvailable: true,
    serverHasKey: false,
    soundEnabled: true,
    cancelled: false,
    cards: [],
    queue: [],
    current: null,
    curSide: 'fwd',
    revealed: false,
    round: 1,
    passLeft: 0,
    known: 0,
    forgot: 0,
    answers: 0,
    startedAt: 0,
    elapsed: 0,
    timer: null
  };

  /* ---------------- Sound & Speech Synthesis ---------------- */

  var audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    return audioCtx;
  }

  function playTone(freq, type, duration, gainVal) {
    if (!state.soundEnabled) return;
    try {
      var ctx = getAudioCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainVal || 0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  function playFlipSound() { playTone(340, 'sine', 0.1, 0.08); }
  function playSuccessSound() {
    playTone(523, 'triangle', 0.12, 0.12);
    setTimeout(function () { playTone(659, 'triangle', 0.2, 0.12); }, 80);
  }
  function playForgotSound() {
    playTone(240, 'sine', 0.14, 0.1);
    setTimeout(function () { playTone(180, 'sine', 0.22, 0.1); }, 70);
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    try { localStorage.setItem(SOUND_KEY, state.soundEnabled ? '1' : '0'); } catch (e) {}
    updateSoundUI();
    toast(state.soundEnabled ? 'Звук включён 🔊' : 'Звук выключен 🔇', 'ok', 1400);
    if (state.soundEnabled) playSuccessSound();
  }

  function updateSoundUI() {
    var b = $('btnSound');
    if (b) {
      b.textContent = state.soundEnabled ? '🔊' : '🔇';
      b.classList.toggle('active', state.soundEnabled);
    }
  }

  function speakText(text, langCode) {
    if (!state.soundEnabled) return;
    if (!('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      var ut = new SpeechSynthesisUtterance(text);
      var targetLang = langByCode(langCode);
      ut.lang = (targetLang && targetLang.voice) || 'en-US';
      ut.rate = 0.95;
      window.speechSynthesis.speak(ut);
    } catch (e) {}
  }

  /* ---------------- utils ---------------- */

  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  var toastTimer = null;
  function toast(msg, type, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast ' + (type || '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 3200);
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }

  function chunk(arr, n) {
    var out = [];
    for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  function langByCode(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return LANGS[i];
    return LANGS[0];
  }

  function saveCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(state.cfg)); } catch (e) {}
    updateApiStatus();
  }

  function loadCfg() {
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        Object.keys(o || {}).forEach(function (k) { if (state.cfg[k] !== undefined) state.cfg[k] = o[k]; });
      }
      var s = localStorage.getItem(SOUND_KEY);
      if (s !== null) state.soundEnabled = s === '1';
    } catch (e) {}
  }

  function saveSession() {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        cards: state.cards, dir: state.cfg.dir, round: state.round, at: Date.now()
      }));
      $('resumeBox').hidden = false;
    } catch (e) {}
  }

  /* ---------------- pre-filter & pair parser ---------------- */

  var PAIR_REGEX = /\s*[:=]\s+|\s+[-—–]\s+|\t+/;

  function parseInput(text) {
    var lines = String(text || '').split(/[\n\r,;|•]+/);
    var seen = Object.create(null);
    var items = [];
    var dropped = 0;

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i].replace(/^\s*[-*–—]?\s*[\d.)]+\s*/, '').replace(/\s+/g, ' ').trim();
      if (!raw) continue;
      if (!/[\p{L}]/u.test(raw)) { dropped++; continue; }
      if (/^https?:\/\/\S+$/i.test(raw) || /[\w.]+@[\w.]+/.test(raw)) { dropped++; continue; }
      if (raw.length > 180) { dropped++; continue; }

      // Check if line contains a delimiter: "word - translation"
      var pair = raw.split(PAIR_REGEX);
      if (pair.length >= 2 && pair[0].trim() && pair[1].trim()) {
        var orig = pair[0].trim();
        var trans = pair.slice(1).join(' ').trim();
        var k = orig.toLowerCase();
        if (seen[k]) { dropped++; continue; }
        seen[k] = 1;
        items.push({ original: orig, translation: trans, hint: '', pretranslated: true });
      } else {
        var single = raw.trim();
        var k2 = single.toLowerCase();
        if (seen[k2]) { dropped++; continue; }
        seen[k2] = 1;
        items.push({ original: single, translation: '', hint: '', pretranslated: false });
      }
    }
    return { items: items, dropped: dropped };
  }

  /* ---------------- AI & Translation ---------------- */

  function systemPrompt(targetEn) {
    return 'You are the engine of WordLoop vocabulary trainer.\n' +
      'Input: list of words/phrases.\n' +
      'Tasks:\n' +
      '1. FILTER: drop junk, duplicates, numbers, urls, single letters. Keep useful words/phrases.\n' +
      '2. TRANSLATE every item into ' + targetEn + '.\n' +
      '3. If item is already in ' + targetEn + ', keep it unchanged.\n' +
      '4. Add "hint": a short mnemonic or memory hook (3-8 words) in ' + targetEn + ' that makes it easy to remember.\n' +
      'Answer STRICT JSON only:\n' +
      '{"items":[{"original":"...","translation":"...","hint":"..."}]}';
  }

  function numbered(items) {
    return items.map(function (x, i) { return (i + 1) + '. ' + x.original; }).join('\n');
  }

  function parseItems(text) {
    if (!text) return [];
    var t = String(text).replace(/```(?:json)?/gi, '').trim();

    function attempt(s) {
      try {
        var o = JSON.parse(s);
        if (Array.isArray(o)) return o;
        if (o && Array.isArray(o.items)) return o.items;
        if (o && Array.isArray(o.results)) return o.results;
        if (o && Array.isArray(o.data)) return o.data;
      } catch (e) {}
      return null;
    }

    var got = attempt(t);
    if (!got) {
      var i = t.indexOf('{'), j = t.lastIndexOf('}');
      if (i >= 0 && j > i) got = attempt(t.slice(i, j + 1));
    }
    if (!got) {
      var a = t.indexOf('['), b = t.lastIndexOf(']');
      if (a >= 0 && b > a) got = attempt(t.slice(a, b + 1));
    }
    if (!got) return [];

    return got
      .map(function (o) {
        if (typeof o === 'string') return { original: o, translation: '', hint: '' };
        var orig = o.original || o.word || o.source || o.text || o.ru || '';
        var tr = o.translation || o.translated || o.target || o.tr || o.en || '';
        return { original: String(orig).trim(), translation: String(tr).trim(), hint: String(o.hint || o.note || '').trim() };
      })
      .filter(function (o) { return o.original; });
  }

  function pickText(json) {
    if (json && json.text) return json.text;
    if (json && json.choices && json.choices[0] && json.choices[0].message) return json.choices[0].message.content;
    return '';
  }

  async function checkServerStatus() {
    try {
      var r = await fetch('/api/ai', { method: 'GET' });
      if (r.ok) {
        var d = await r.json();
        state.serverHasKey = Boolean(d.serverKeyConfigured);
        state.serverAvailable = true;
      } else {
        state.serverAvailable = false;
      }
    } catch (e) {
      state.serverAvailable = false;
    }
    updateApiStatus();
  }

  function updateApiStatus() {
    var ind = $('statusIndicator');
    var summ = $('apiSummaryStatus');
    if (state.serverHasKey) {
      if (ind) { ind.textContent = '● Vercel ИИ онлайн'; ind.className = 'status-indicator'; }
      if (summ) { summ.textContent = 'Серверный ключ'; summ.className = 'api-summary-status'; }
    } else if (state.cfg.apiKey) {
      if (ind) { ind.textContent = '● Браузерный API ключ'; ind.className = 'status-indicator'; }
      if (summ) { summ.textContent = 'Ключ браузера'; summ.className = 'api-summary-status'; }
    } else {
      if (ind) { ind.textContent = '⚡ Бесплатный авто-режим'; ind.className = 'status-indicator warn'; }
      if (summ) { summ.textContent = 'Автономно'; summ.className = 'api-summary-status'; }
    }
  }

  async function callAI(messages) {
    var body = JSON.stringify({ messages: messages, model: state.cfg.model, temperature: 0.2 });

    /* 1) Прокси на Vercel (серверный ключ) */
    if (state.serverAvailable) {
      try {
        var r = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body
        });
        if (r.ok) {
          var j = await r.json();
          var txt = pickText(j);
          if (txt) return txt;
          throw new Error('Пустой ответ от сервера');
        }
        var err = {};
        try { err = await r.json(); } catch (e) {}
        if (r.status === 404 || r.status === 501 || err.code === 'no-key') {
          state.serverAvailable = false;
        } else {
          throw new Error(err.error || ('Серверный API ответил ' + r.status));
        }
      } catch (e) {
        if (e instanceof TypeError) state.serverAvailable = false;
        else throw e;
      }
    }

    /* 2) Напрямую по ключу пользователя */
    var cfg = state.cfg;
    if (cfg.apiKey) {
      var url = String(cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions';
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
        body: JSON.stringify({ model: cfg.model || 'gpt-4o-mini', messages: messages, temperature: 0.2 })
      });
      if (!res.ok) {
        var e2 = {};
        try { e2 = await res.json(); } catch (e) {}
        var msg = (e2.error && (e2.error.message || e2.error)) || ('API вернул ' + res.status);
        throw new Error(typeof msg === 'string' ? msg : 'API вернул ' + res.status);
      }
      var data = await res.json();
      var out = pickText(data);
      if (!out) throw new Error('Пустой ответ модели');
      return out;
    }

    throw new Error('no-key');
  }

  /* Free translation fallback engine (MyMemory API + Local dictionary) */
  async function translateSingleFree(word, targetCode) {
    var lower = word.toLowerCase().trim();
    if (targetCode === 'ru' && BUILTIN_DICT[lower]) {
      return BUILTIN_DICT[lower];
    }
    try {
      var isCyrillic = /[а-яё]/i.test(word);
      var srcCode = isCyrillic ? 'ru' : 'en';
      var pair = srcCode + '|' + (targetCode || 'ru');
      var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(word) + '&langpair=' + pair;
      var res = await fetch(url);
      if (res.ok) {
        var json = await res.json();
        if (json && json.responseData && json.responseData.translatedText) {
          var t = json.responseData.translatedText.trim();
          // Filter out identical or noisy matches
          if (t && t.toLowerCase() !== lower) return t;
        }
      }
    } catch (e) {}
    return BUILTIN_DICT[lower] || '—';
  }

  async function translateBatchFree(items, targetCode) {
    var out = [];
    var total = items.length;
    for (var i = 0; i < total; i++) {
      if (state.cancelled) return null;
      var item = items[i];
      setLoad(
        Math.round(((i + 1) / total) * 100),
        'Перевод без API (' + (i + 1) + ' из ' + total + ')…',
        'Карточка: ' + item.original
      );
      var tr = await translateSingleFree(item.original, targetCode);
      out.push({
        original: item.original,
        translation: tr,
        hint: 'ассоциация: ' + item.original
      });
      // Small pause to be gentle on free API
      if (i < total - 1) await new Promise(function (r) { setTimeout(r, 90); });
    }
    return out;
  }

  function setLoad(pct, step, count) {
    $('loadBar').style.width = Math.max(4, Math.min(100, pct)) + '%';
    if (step) $('loadStep').textContent = step;
    $('loadCount').textContent = count || '';
  }

  async function buildCards(parsedItems) {
    var target = langByCode(state.cfg.target);
    var readyCards = [];
    var needTranslation = [];

    parsedItems.forEach(function (it) {
      if (it.pretranslated) readyCards.push(it);
      else needTranslation.push(it);
    });

    if (!needTranslation.length) {
      setLoad(100, 'Все пары уже переведены!', 'Готово карточек: ' + readyCards.length);
      await new Promise(function (r) { setTimeout(r, 200); });
      return readyCards;
    }

    // Try AI first if key exists
    var canTryAI = state.serverHasKey || Boolean(state.cfg.apiKey);
    if (canTryAI) {
      try {
        var parts = chunk(needTranslation, CHUNK);
        var aiCards = [];
        for (var i = 0; i < parts.length; i++) {
          if (state.cancelled) return null;
          setLoad(
            Math.round((i / parts.length) * 90) + 5,
            parts.length > 1 ? ('ИИ переводит часть ' + (i + 1) + ' из ' + parts.length) : 'ИИ фильтрует и переводит слова…',
            'Обработано: ' + aiCards.length + ' / ' + needTranslation.length
          );

          var text = await callAI([
            { role: 'system', content: systemPrompt(target.en) },
            { role: 'user', content: numbered(parts[i]) }
          ]);
          var parsed = parseItems(text);
          var got = Object.create(null);
          parsed.forEach(function (p) { got[p.original.toLowerCase()] = p; });

          parts[i].forEach(function (src) {
            var p = got[src.original.toLowerCase()];
            if (p) aiCards.push({ original: p.original, translation: p.translation || '—', hint: p.hint || '' });
            else aiCards.push({ original: src.original, translation: '—', hint: '' });
          });
        }
        return readyCards.concat(aiCards);
      } catch (err) {
        if (err.message !== 'no-key') {
          console.warn('AI call failed, falling back to free translator:', err);
        }
      }
    }

    // Fallback: Free translation
    toast('Перевожу через бесплатный авто-переводчик ⚡', 'ok', 3000);
    var freeCards = await translateBatchFree(needTranslation, state.cfg.target);
    if (!freeCards) return null;
    return readyCards.concat(freeCards);
  }

  /* ---------------- demo ---------------- */

  var DEMO = [
    ['serendipity', 'счастливая случайность', 'нежданная удачная находка'],
    ['to remember', 'помнить', 're + member — «собрать в памяти»'],
    ['journey', 'путешествие', 'long trip, путь вперёд'],
    ['brave', 'храбрый', 'смелый перед опасностью'],
    ['quiet', 'тихий', 'полная тишина'],
    ['to achieve', 'достигать', 'цель + усилие = результат'],
    ['weather', 'погода', 'солнце, дождь, ветер'],
    ['to borrow', 'одалживать', 'взять взаймы и вернуть'],
    ['narrow', 'узкий', 'мало места по бокам'],
    ['to explain', 'объяснять', 'сделать кристально понятным'],
    ['resilience', 'стрессоустойчивость', 'умение держать удар и восстанавливаться'],
    ['to waste', 'тратить впустую', 'время или деньги на ветер'],
    ['deep', 'глубокий', 'дно океана или глубокая мысль'],
    ['to notice', 'замечать', 'взгляд зацепился за деталь']
  ];

  function demoCards() {
    return DEMO.map(function (d) { return { original: d[0], translation: d[1], hint: d[2] }; });
  }

  /* ---------------- training ---------------- */

  function startTraining(cards, resume) {
    if (!cards || !cards.length) { toast('Не найдено ни одного слова 🤔', 'err'); return; }

    state.cards = cards.map(function (c, i) {
      return { id: i, original: c.original, translation: c.translation, hint: c.hint || '', streak: 0, fails: 0 };
    });
    state.queue = shuffle(state.cards.map(function (c) { return c.id; }));
    state.current = null;
    state.revealed = false;
    state.round = resume ? (resume.round || 1) : 1;
    state.passLeft = state.cards.length;
    state.known = 0; state.forgot = 0; state.answers = 0;
    state.startedAt = Date.now(); state.elapsed = 0;

    show('screen-train');
    $('topPill').hidden = false;
    $('topPill').textContent = state.cards.length + ' карточек';
    nextCard(true);
    startTimer();
    saveSession();
    if (!resume) toast('Колода готова: ' + state.cards.length + ' слов. Погнали! 🚀', 'ok');
  }

  function nextCard(first) {
    if (state.passLeft <= 0) {
      state.round++;
      state.passLeft = state.cards.length;
      // В новом раунде забытые слова выходят первыми
      state.queue.sort(function (a, b) {
        return (state.cards[b].fails - state.cards[a].fails) || (Math.random() - 0.5);
      });
      toast('Раунд ' + state.round + ' 🔁 Забытые слова идут первыми!', 'ok', 2500);
      playSuccessSound();
    }

    if (!state.queue.length) state.queue = shuffle(state.cards.map(function (c) { return c.id; }));
    state.current = state.cards[state.queue.shift()];
    state.revealed = false;

    if (state.cfg.dir === 'mixed') state.curSide = Math.random() < 0.5 ? 'fwd' : 'rev';
    else state.curSide = state.cfg.dir;

    renderCard();
    if (!first) {
      var card = $('card');
      card.classList.remove('pop');
      void card.offsetWidth;
      card.classList.add('pop');
    }
    renderStats();
  }

  function renderCard() {
    var c = state.current;
    if (!c) return;
    var fwd = state.curSide === 'fwd';
    var target = langByCode(state.cfg.target);

    $('cardWord').textContent = fwd ? c.original : c.translation;
    $('cardTrans').textContent = fwd ? c.translation : c.original;
    $('cardSub').textContent = fwd
      ? 'вспомни перевод, потом переверни'
      : 'назови слово, потом переверни';
    $('cardHint').textContent = c.hint ? ('💡 ' + c.hint) : '';
    $('cardBadge').textContent = fwd ? 'оригинал' : target.label;
    $('cardBadgeBack').textContent = fwd ? target.label : 'оригинал';

    $('card').classList.remove('flipped');
    updateRows();
  }

  function updateRows() {
    $('rowHidden').hidden = state.revealed;
    $('rowShown').hidden = !state.revealed;
  }

  function reveal() {
    if (state.revealed || !state.current) return;
    state.revealed = true;
    $('card').classList.add('flipped');
    playFlipSound();
    updateRows();
  }

  function speakCurrent() {
    if (!state.current) return;
    var fwd = state.curSide === 'fwd';
    if (!state.revealed) {
      speakText(fwd ? state.current.original : state.current.translation, fwd ? 'en' : state.cfg.target);
    } else {
      speakText(fwd ? state.current.translation : state.current.original, fwd ? state.cfg.target : 'en');
    }
  }

  function answer(knew) {
    var c = state.current;
    if (!c) return;

    state.answers++;
    if (knew) {
      state.known++;
      c.streak++;
      playSuccessSound();
    } else {
      state.forgot++;
      c.streak = 0;
      c.fails++;
      playForgotSound();
    }

    var delay = knew ? Math.min(6, 2 + c.streak * 2) : 1;
    state.queue.splice(Math.min(state.queue.length, delay), 0, c.id);
    state.passLeft--;

    state.revealed = false;
    $('card').classList.remove('flipped');
    setTimeout(function () { nextCard(false); }, 180);
    renderStats();
  }

  function renderStats() {
    $('stRound').textContent = state.round;
    $('stKnown').textContent = state.known;
    $('stForgot').textContent = state.forgot;
    $('stAcc').textContent = state.answers ? Math.round((state.known / state.answers) * 100) + '%' : '—';
    $('stLeft').textContent = state.queue.length + (state.current ? 1 : 0);
  }

  function fmtTime(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function startTimer() {
    clearInterval(state.timer);
    state.timer = setInterval(function () {
      if ($('summary').hidden === false) return;
      if (!$('screen-train').classList.contains('active')) return;
      state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
      $('stTime').textContent = fmtTime(state.elapsed);
    }, 1000);
  }

  /* ---------------- summary ---------------- */

  function showSummary() {
    state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    var acc = state.answers ? Math.round((state.known / state.answers) * 100) : 0;
    var mastered = state.cards.filter(function (c) { return c.streak >= 2 && c.fails === 0; }).length;

    $('summaryGrid').innerHTML =
      '<div><b>' + state.answers + '</b><span>ответов</span></div>' +
      '<div><b>' + acc + '%</b><span>точность</span></div>' +
      '<div><b>' + state.round + '</b><span>раунд</span></div>' +
      '<div><b>' + state.known + '</b><span>знал</span></div>' +
      '<div><b>' + state.forgot + '</b><span>забыл</span></div>' +
      '<div><b>' + fmtTime(state.elapsed) + '</b><span>время</span></div>';

    var msg;
    if (!state.answers) msg = 'Сессия только началась. Возвращайся в цикл в любой момент!';
    else if (acc >= 90) msg = 'Отличная память! ' + mastered + ' слов запомнились на автомате.';
    else if (acc >= 65) msg = 'Хороший прогресс — цикл вернул забытые слова, закрепление идёт полным ходом.';
    else msg = 'Всё по плану: забыл → карточка перевернулась → слово вернулось в очередь.';
    $('summaryMsg').textContent = msg;

    $('summary').hidden = false;
  }

  function hideSummary() {
    $('summary').hidden = true;
    state.startedAt = Date.now() - state.elapsed * 1000;
  }

  function statsText() {
    var acc = state.answers ? Math.round((state.known / state.answers) * 100) : 0;
    return 'WordLoop 🔁: ' + state.cards.length + ' карточек · ' + state.answers + ' ответов · ' +
      acc + '% точность · раунд ' + state.round + ' · время ' + fmtTime(state.elapsed);
  }

  /* ---------------- pipeline ---------------- */

  async function start() {
    var raw = $('input').value;
    var parsed = parseInput(raw);
    if (!parsed.items.length) {
      toast('Вставь слова или нажми один из примеров 👀', 'err');
      $('input').focus();
      return;
    }

    state.cancelled = false;
    show('screen-loading');
    $('loadTitle').textContent = 'Обрабатываю твой список слов…';
    setLoad(8, 'Анализирую список и фильтрую дубликаты', 'Отобрано: ' + parsed.items.length + (parsed.dropped ? ' · отсеяно: ' + parsed.dropped : ''));

    try {
      var cards = await buildCards(parsed.items);
      if (state.cancelled) { show('screen-setup'); return; }
      if (!cards || !cards.length) throw new Error('Не удалось сформировать карточки.');
      setLoad(100, 'Готово!', 'Карточек: ' + cards.length);
      await new Promise(function (r) { setTimeout(r, 350); });
      startTraining(cards);
    } catch (e) {
      show('screen-setup');
      toast(e.message || 'Ошибка генерации тренировки', 'err', 5000);
      $('apiBox').open = true;
    }
  }

  /* ---------------- init ---------------- */

  function init() {
    loadCfg();
    updateSoundUI();
    checkServerStatus();

    var sel = $('targetLang');
    LANGS.forEach(function (l) {
      var o = document.createElement('option');
      o.value = l.code; o.textContent = l.label;
      sel.appendChild(o);
    });
    sel.value = state.cfg.target;
    $('cfgBaseUrl').value = state.cfg.baseUrl;
    $('cfgModel').value = state.cfg.model;
    $('cfgKey').value = state.cfg.apiKey;
    setDir(state.cfg.dir);

    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (s && s.cards && s.cards.length) $('resumeBox').hidden = false;
    } catch (e) {}

    updateInputStat();

    /* setup events */
    $('input').addEventListener('input', updateInputStat);
    $('btnClear').addEventListener('click', function () {
      $('input').value = '';
      updateInputStat();
      $('input').focus();
    });

    $('btnPaste').addEventListener('click', async function () {
      try {
        var t = await navigator.clipboard.readText();
        if (!t) return toast('Буфер пуст', 'err');
        $('input').value = ($('input').value ? $('input').value.replace(/\s*$/, '\n') : '') + t;
        updateInputStat();
        toast('Слова вставлены из буфера', 'ok', 1400);
      } catch (e) {
        toast('Браузер ограничил доступ к буферу — нажми Ctrl+V в поле', 'err', 4000);
      }
    });

    /* Preset chips */
    document.querySelectorAll('.preset-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.preset;
        if (PRESETS[key]) {
          $('input').value = PRESETS[key].join('\n');
          updateInputStat();
          toast('Загружен набор «' + btn.textContent + '»', 'ok', 1800);
        }
      });
    });

    /* Provider chips */
    document.querySelectorAll('.prov-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.prov-chip').forEach(function (c) { c.classList.remove('active'); });
        btn.classList.add('active');
        var p = btn.dataset.prov;
        if (p === 'free') {
          $('cfgKey').value = '';
          state.cfg.apiKey = '';
          toast('Включён бесплатный авто-перевод без ключа', 'ok');
        } else if (p === 'openai') {
          $('cfgBaseUrl').value = 'https://api.openai.com/v1';
          $('cfgModel').value = 'gpt-4o-mini';
          $('cfgKey').focus();
          toast('Выбран OpenAI. Введи свой ключ sk-...', 'ok');
        } else if (p === 'groq') {
          $('cfgBaseUrl').value = 'https://api.groq.com/openai/v1';
          $('cfgModel').value = 'llama-3.3-70b-versatile';
          $('cfgKey').focus();
          toast('Выбран Groq (быстрый бесплатный API)', 'ok');
        } else if (p === 'openrouter') {
          $('cfgBaseUrl').value = 'https://openrouter.ai/api/v1';
          $('cfgModel').value = 'google/gemini-2.5-flash';
          $('cfgKey').focus();
          toast('Выбран OpenRouter', 'ok');
        }
      });
    });

    sel.addEventListener('change', function () { state.cfg.target = sel.value; saveCfg(); });
    $('dirSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-dir]');
      if (b) setDir(b.dataset.dir);
    });

    $('btnSaveCfg').addEventListener('click', function () {
      state.cfg.baseUrl = $('cfgBaseUrl').value.trim() || 'https://api.openai.com/v1';
      state.cfg.model = $('cfgModel').value.trim() || 'gpt-4o-mini';
      state.cfg.apiKey = $('cfgKey').value.trim();
      saveCfg();
      toast('Настройки сохранены 💾', 'ok');
    });

    $('btnResetCfg').addEventListener('click', function () {
      state.cfg.baseUrl = 'https://api.openai.com/v1';
      state.cfg.model = 'gpt-4o-mini';
      state.cfg.apiKey = '';
      $('cfgBaseUrl').value = state.cfg.baseUrl;
      $('cfgModel').value = state.cfg.model;
      $('cfgKey').value = '';
      saveCfg();
      toast('Сброшено к авто-режиму', 'ok');
    });

    $('btnStart').addEventListener('click', start);
    $('btnDemo').addEventListener('click', function () {
      state.cfg.target = 'ru'; $('targetLang').value = 'ru'; saveCfg();
      toast('Демо-колода загружена!', 'ok');
      startTraining(demoCards());
    });

    $('btnResume').addEventListener('click', function () {
      try {
        var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        if (s && s.cards && s.cards.length) {
          if (s.dir) setDir(s.dir);
          startTraining(s.cards, s);
        }
      } catch (e) { toast('Сессия не восстановилась', 'err'); }
    });

    $('btnCancel').addEventListener('click', function () {
      state.cancelled = true;
      show('screen-setup');
    });

    $('btnSound').addEventListener('click', toggleSound);

    $('btnSettings').addEventListener('click', function () {
      show('screen-setup');
      $('apiBox').open = true;
      setTimeout(function () { $('apiBox').scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120);
    });

    $('logoHome').addEventListener('click', function (e) {
      e.preventDefault();
      if ($('screen-train').classList.contains('active')) showSummary();
      else show('screen-setup');
    });

    /* Card face speak buttons */
    $('btnSpeakFront').addEventListener('click', function (e) {
      e.stopPropagation();
      if (state.current) speakText($('cardWord').textContent, state.curSide === 'fwd' ? 'en' : state.cfg.target);
    });
    $('btnSpeakBack').addEventListener('click', function (e) {
      e.stopPropagation();
      if (state.current) speakText($('cardTrans').textContent, state.curSide === 'fwd' ? state.cfg.target : 'en');
    });
    $('btnSpeakCur').addEventListener('click', speakCurrent);

    /* Training buttons */
    $('btnReveal').addEventListener('click', reveal);
    $('btnKnew').addEventListener('click', function () { answer(true); });
    $('btnForgot').addEventListener('click', function () { answer(false); });
    $('btnKnew2').addEventListener('click', function () { answer(true); });
    $('card').addEventListener('click', reveal);
    $('btnExit').addEventListener('click', showSummary);

    $('btnShuffle').addEventListener('click', function () {
      shuffle(state.queue);
      toast('Очередь перемешана ⤨', 'ok', 1400);
      renderStats();
    });

    $('btnDirCycle').addEventListener('click', function () {
      var order = ['mixed', 'fwd', 'rev'];
      var next = order[(order.indexOf(state.cfg.dir) + 1) % order.length];
      setDir(next); saveCfg();
      toast('Направление: ' + ({ mixed: 'смешанное', fwd: 'слово → перевод', rev: 'перевод → слово' })[next], 'ok', 1800);
    });

    /* Summary buttons */
    $('btnContinue').addEventListener('click', hideSummary);
    $('btnNewSet').addEventListener('click', function () {
      hideSummary();
      clearInterval(state.timer);
      $('topPill').hidden = true;
      show('screen-setup');
    });
    $('btnCopyStats').addEventListener('click', async function () {
      try {
        await navigator.clipboard.writeText(statsText());
        toast('Статистика скопирована в буфер 📋', 'ok');
      } catch (e) { toast('Не удалось скопировать', 'err'); }
    });

    /* Global keyboard shortcuts */
    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input,textarea,select')) return;
      var k = e.key;

      if ($('screen-train').classList.contains('active') && $('summary').hidden) {
        if (k === ' ' || k === 'Enter' || k === 'ArrowDown') {
          e.preventDefault();
          state.revealed ? answer(true) : reveal();
        } else if (k === '1' || k === 'ArrowLeft') {
          e.preventDefault();
          state.revealed ? answer(false) : reveal();
        } else if (k === '2' || k === 'ArrowRight') {
          e.preventDefault();
          answer(true);
        } else if (k === 's' || k === 'S' || k === 'ы' || k === 'Ы') {
          e.preventDefault();
          speakCurrent();
        } else if (k === 'm' || k === 'M' || k === 'ь' || k === 'Ь') {
          e.preventDefault();
          toggleSound();
        } else if (k === 'Escape') {
          e.preventDefault();
          showSummary();
        }
      } else if (!$('summary').hidden && k === 'Escape') {
        hideSummary();
      }
    });
  }

  function setDir(dir) {
    state.cfg.dir = dir;
    document.querySelectorAll('#dirSeg button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.dir === dir);
    });
    saveCfg();
  }

  var statTimer = null;
  function updateInputStat() {
    clearTimeout(statTimer);
    statTimer = setTimeout(function () {
      var p = parseInput($('input').value);
      $('inputStat').textContent = p.items.length + ' ' + plural(p.items.length, ['слово', 'слова', 'слов']) +
        (p.dropped ? ' · отброшено ' + p.dropped : '');
    }, 180);
  }

  function plural(n, forms) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  }

  document.addEventListener('DOMContentLoaded', init);
})();
