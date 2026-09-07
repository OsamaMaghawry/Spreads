// Homepage animations: streamed ticks on the hero cards, the broker/DeltaMint wipe, the phone toggle and
// card flips, the screener replay and the trade-ticket replay. Loaded with defer by index.html.

(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var money = function (n) { var s = '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return n < 0 ? '−' + s : '+' + s; };

  // ---- hero cards: streamed spot ticks (the real dashboard overlays the stream onto every card)
  if (!reduce) {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.card[data-live]')).map(function (c) {
      return { el: c, base: +c.dataset.spot, spot: +c.dataset.spot, min: +c.dataset.min, range: +c.dataset.range, pl: +c.dataset.pl, sens: +c.dataset.sens,
               spotEl: c.querySelector('[data-spotel]'), spotV: c.querySelector('[data-spotv]'), plV: c.querySelector('[data-plv]') };
    });
    var flash = function (el, up) {
      el.classList.remove('tick-up', 'tick-down'); void el.offsetWidth;
      el.classList.add(up ? 'tick-up' : 'tick-down');
    };
    setInterval(function () {
      var c = cards[Math.floor(Math.random() * cards.length)];
      var drift = (Math.random() - 0.5) * c.base * 0.004;
      var next = Math.max(c.base * 0.99, Math.min(c.base * 1.01, c.spot + drift));
      var up = next >= c.spot; c.spot = next;
      var pct = ((c.spot - c.min) / c.range) * 100;
      c.spotEl.style.left = pct.toFixed(2) + '%';
      c.spotV.textContent = '$' + c.spot.toFixed(2);
      flash(c.spotV, up);
      if (c.sens !== 0) {
        var pl = c.pl + (c.spot - c.base) * c.sens * (c.el.dataset.live === 'amd' ? 70 : 24);
        c.plV.textContent = money(pl);
        c.plV.className = 'v num ' + (pl >= 0 ? 'up' : 'down');
        flash(c.plV, (c.sens > 0) === up);
      }
    }, 650);
  }


  // ---- hero wipe
  var wipe = document.getElementById('wipe'), range = document.getElementById('wipeRange');
  function setX(pct) { pct = Math.max(0, Math.min(100, pct)); wipe.style.setProperty('--x', pct + '%'); range.value = pct; }
  function fromEvent(e) { var r = wipe.getBoundingClientRect(); setX(((e.clientX - r.left) / r.width) * 100); }
  var dragging = false;
  wipe.addEventListener('pointerdown', function (e) { if (e.target === range) return; dragging = true; wipe.setPointerCapture(e.pointerId); fromEvent(e); });
  wipe.addEventListener('pointermove', function (e) { if (dragging) fromEvent(e); });
  wipe.addEventListener('pointerup', function () { dragging = false; });
  wipe.addEventListener('pointercancel', function () { dragging = false; });
  range.addEventListener('input', function () { setX(+range.value); });
  // settle in from the broker side once, so the first frame says "before"
  if (!reduce) { setX(8); setTimeout(function () { wipe.style.transition = '--x .9s ease'; setX(50); setTimeout(function () { wipe.style.transition = ''; }, 950); }, 700); }


  // ---- phone hero: toggle + flips
  var segs = document.querySelectorAll('.seg-b'), panes = document.querySelectorAll('.pane[data-pane]');
  function showView(v) {
    segs.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === v)); });
    panes.forEach(function (p) { p.className = 'pane ' + (p.dataset.pane === v ? 'in' : 'out'); });
  }
  segs.forEach(function (b) { b.addEventListener('click', function () { showView(b.dataset.view); }); });
  if (segs.length) setTimeout(function () { showView('dm'); }, reduce ? 0 : 1800);
  document.querySelectorAll('[data-flip]').forEach(function (b) {
    b.addEventListener('click', function () { document.getElementById(b.dataset.flip).classList.toggle('on'); });
  });


  // ---- screener replay: defaults → cursor to Scan → batches of 4 stream rows → cursor to Trade
  (function () {
    var app = document.getElementById('scApp'), cur = document.getElementById('scCursor'), ring = document.getElementById('scRing');
    var btn = document.getElementById('scanBtn'), lbl = document.getElementById('scanLbl'), prog = document.getElementById('scProg'),
        spin = document.getElementById('scSpin'), status = document.getElementById('scStatus'), count = document.getElementById('scCount'),
        bar = document.getElementById('scBar'), empty = document.getElementById('scEmpty'), wrap = document.getElementById('scTableWrap'), rows = document.getElementById('scRows');
    var RADAR = btn.querySelector('svg').outerHTML;
    var CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/></svg>';
    var STOP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6"/></svg>';
    // TOP50 order, batches of 4 — which batch each result arrives in
    var results = [
      { b: 2, t: 'AVGO', x: '2026-09-11', st: '335/332.5P', spot: 348.60, d: 0.20, w: 2.5, ror: 28.2, cr: 0.55, mr: 195, earn: true },
      { b: 1, t: 'NVDA', x: '2026-09-11', st: '175/172.5P', spot: 181.42, d: 0.19, w: 2.5, ror: 23.8, cr: 0.48, mr: 202 },
      { b: 2, t: 'TSLA', x: '2026-09-11', st: '330/327.5P', spot: 336.20, d: 0.21, w: 2.5, ror: 22.5, cr: 0.46, mr: 204 },
      { b: 7, t: 'AMD',  x: '2026-09-11', st: '137/135P',   spot: 142.18, d: 0.18, w: 2,   ror: 22.0, cr: 0.36, mr: 164 },
      { b: 2, t: 'META', x: '2026-09-11', st: '735/732P',   spot: 742.32, d: 0.17, w: 3,   ror: 21.0, cr: 0.52, mr: 248 },
      { b: 1, t: 'AAPL', x: '2026-09-11', st: '240/238P',   spot: 246.10, d: 0.16, w: 2,   ror: 19.0, cr: 0.32, mr: 168 },
      { b: 1, t: 'MSFT', x: '2026-09-11', st: '502.5/500P', spot: 511.30, d: 0.15, w: 2.5, ror: 17.9, cr: 0.38, mr: 212 },
      { b: 1, t: 'AMZN', x: '2026-09-11', st: '228/226P',   spot: 233.60, d: 0.16, w: 2,   ror: 17.6, cr: 0.30, mr: 170 },
      { b: 2, t: 'GOOGL',x: '2026-09-11', st: '215/213P',   spot: 220.15, d: 0.14, w: 2,   ror: 16.3, cr: 0.28, mr: 172 },
      { b: 6, t: 'NFLX', x: '2026-09-11', st: '1210/1207.5P', spot: 1236.40, d: 0.15, w: 2.5, ror: 15.6, cr: 0.34, mr: 216 }
    ];
    var m2 = function (n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var timers = [];
    function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
    function moveTo(el, dx, dy) {
      var a = app.getBoundingClientRect(), r = el.getBoundingClientRect();
      cur.style.left = (r.left - a.left + r.width * (dx == null ? .5 : dx)) + 'px';
      cur.style.top = (r.top - a.top + r.height * (dy == null ? .5 : dy)) + 'px';
    }
    function clickAt() {
      cur.classList.remove('click'); void cur.offsetWidth; cur.classList.add('click');
      ring.style.left = cur.style.left; ring.style.top = cur.style.top; ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go');
    }
    function render(shown, fresh) {
      shown.sort(function (a, b) { return b.ror - a.ror; });
      rows.innerHTML = shown.map(function (c, i) {
        return '<tr' + (fresh && fresh.indexOf(c) >= 0 ? ' class="new"' : '') + '><td class="i">' + (i + 1) + '</td><td class="t">' + c.t + (c.earn ? ' <span class="earn">' + CAL + ' Earnings</span>' : '') + '</td><td class="e">' + c.x + '</td><td>' + c.st + '</td><td class="r">' + m2(c.spot) + '</td><td class="r">' + c.d.toFixed(2) + '</td><td class="r">' + m2(c.w) + '</td><td class="r ror">' + c.ror.toFixed(1) + '%</td><td class="r">' + m2(c.cr * 100) + '</td><td class="r">' + m2(c.mr) + '</td><td><button class="tr-btn">Trade</button></td></tr>';
      }).join('');
      count.textContent = shown.length + ' setups ≥ 15% RoR';
    }
    function reset() {
      timers.forEach(clearTimeout); timers = [];
      btn.className = 'scan-btn'; btn.innerHTML = RADAR + ' <span id="scanLbl">Scan 50 tickers</span>';
      prog.hidden = true; spin.hidden = false; bar.style.width = '0'; status.textContent = 'Scanning — 0/50 tickers'; count.textContent = '0 setups ≥ 15% RoR';
      empty.hidden = false; empty.textContent = 'Configure your filters and start a scan.'; wrap.hidden = true; rows.innerHTML = '';
      cur.style.opacity = '0'; cur.style.transition = 'none'; cur.style.left = '62%'; cur.style.top = '62%'; void cur.offsetWidth; cur.style.transition = '';
    }
    function finish() {
      spin.hidden = true; status.textContent = 'Scan complete — 50/50 tickers';
      btn.className = 'scan-btn'; btn.innerHTML = RADAR + ' <span>Scan 50 tickers</span>';
    }
    function play() {
      reset();
      if (reduce) { prog.hidden = false; empty.hidden = true; wrap.hidden = false; bar.style.width = '100%'; render(results.slice()); finish(); return; }
      at(600, function () { cur.style.opacity = '1'; });
      at(900, function () { moveTo(btn, .5, .5); });
      at(2000, function () { btn.classList.add('hover'); });
      at(2300, function () {
        clickAt(); btn.classList.add('press');
        at(120, function () { btn.classList.remove('press', 'hover'); btn.className = 'scan-btn stop'; btn.innerHTML = STOP + ' <span>Stop scan</span>'; });
        prog.hidden = false; empty.textContent = 'Results stream in as tickers are scanned…';
        var shown = [];
        for (var b = 1; b <= 13; b++) (function (b) {
          at(350 + b * 420, function () {
            var done = Math.min(50, b * 4);
            bar.style.width = (done / 50 * 100) + '%';
            status.textContent = 'Scanning — ' + done + '/50 tickers';
            var fresh = results.filter(function (r) { return r.b === b; }); fresh.forEach(function (r) { shown.push(r); });
            if (shown.length) { empty.hidden = true; wrap.hidden = false; render(shown, fresh); }
            if (b === 13) finish();
          });
        })(b);
        at(350 + 13 * 420 + 500, function () { var t = rows.querySelector('.tr-btn'); if (t) moveTo(t, .5, .5); });
        at(350 + 13 * 420 + 1700, function () { var t = rows.querySelector('.tr-btn'); if (t) t.classList.add('hover'); });
        at(350 + 13 * 420 + 2000, function () { var t = rows.querySelector('.tr-btn'); if (t) { clickAt(); t.classList.add('press'); } });
        at(350 + 13 * 420 + 6500, play);
      });
    }
    document.getElementById('scReplay').addEventListener('click', play);
    play();
  })();


  // ---- trade ticket replay: dialog opens → qty stepped → risk meter moves → Submit → Yes, submit → walk log → filled
  (function () {
    var app = document.getElementById('tkApp'), cur = document.getElementById('tkCursor'), ring = document.getElementById('tkRing');
    var ovl = document.getElementById('tkOvl'), dlg = document.getElementById('tkDlg'), idle = document.getElementById('tkIdle'), work = document.getElementById('tkWork');
    var plus = document.getElementById('tkPlus'), qtyV = document.getElementById('tkQtyV'), submit = document.getElementById('tkSubmit'), confirm = document.getElementById('tkConfirm'), yes = document.getElementById('tkYes');
    var st = document.getElementById('tkSt'), lines = document.getElementById('tkLines'), stop = document.getElementById('tkStop');
    var LOADER = st.querySelector('svg').outerHTML;
    var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';
    var EQUITY = 15000, RISK = 195, CREDIT = 55;
    var m2 = function (n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var timers = []; function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
    function moveTo(el, dx, dy) {
      if (dlg.contains(el)) { var want = el.offsetTop - dlg.clientHeight * .55; dlg.scrollTo({ top: Math.max(0, want), behavior: 'smooth' }); }
      setTimeout(function () { var a = app.getBoundingClientRect(), r = el.getBoundingClientRect(); cur.style.left = (r.left - a.left + r.width * (dx == null ? .5 : dx)) + 'px'; cur.style.top = (r.top - a.top + r.height * (dy == null ? .5 : dy)) + 'px'; }, 350);
    }
    function clickAt() { cur.classList.remove('click'); void cur.offsetWidth; cur.classList.add('click'); ring.style.left = cur.style.left; ring.style.top = cur.style.top; ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go'); }
    // RiskMeter: bands from lib/risk.js; the bar is scaled so 70% of equity fills it
    function band(f) { return f >= .7 ? ['severe','Severe','Over 70% of the account on one position.'] : f >= .5 ? ['high','High','Over half the account on one position.'] : f >= .25 ? ['elevated','Elevated','Over a quarter of the account on one position.'] : f >= .1 ? ['notable','Notable','Over a tenth of the account on one position.'] : ['contained','Contained','Under a tenth of the account.']; }
    function setQty(q) {
      qtyV.textContent = q;
      document.getElementById('tkQ1').textContent = q; document.getElementById('tkQ1s').textContent = q > 1 ? 's' : '';
      document.getElementById('tkTotC').textContent = m2(CREDIT * q); document.getElementById('tkTotR').textContent = m2(RISK * q);
      var f = RISK * q / EQUITY, b = band(f);
      ['tkRm', 'tkRm2'].forEach(function (id) {
        var el = document.getElementById(id); el.className = 'rm ' + b[0];
        el.querySelector('[data-pct]').textContent = (f * 100).toFixed(1) + '%';
        el.querySelector('[data-bar]').style.width = Math.min(f / .7 * 100, 100) + '%';
        el.querySelector('[data-band]').textContent = b[1]; el.querySelector('[data-note]').textContent = b[2];
        el.querySelector('[data-of]').textContent = m2(RISK * q) + ' of ' + m2(EQUITY);
      });
      submit.textContent = 'Submit — open ' + q + ' spread' + (q > 1 ? 's' : '') + ' (walk) on Paper account';
      document.getElementById('tkSummary').textContent = 'Limit order starting at $0.63 credit, conceding toward the bid but never below $0.55 · open ' + q + ' AVGO spread' + (q > 1 ? 's' : '') + ' on Paper account.';
    }
    // the ticket's own log lines, in the walk's real wording
    var log = [
      'Submitting limit order at $0.63 credit…',
      'Walking from $0.63 down to no less than $0.55.',
      'Status: accepted',
      'Conceding (step 1): $0.63 → $0.60 credit',
      'Resubmitted at $0.60 credit (b71e…4a)',
      'Status: accepted',
      'Conceding (step 2): $0.60 → $0.58 credit',
      'Resubmitted at $0.58 credit (c204…9f)',
      'Order filled @ $0.58'
    ];
    var clockBase = new Date(2026, 8, 7, 14, 5, 12), tickN = 0, spot = 348.60, ticking = null;
    function tick() {
      tickN++; var t = new Date(clockBase.getTime() + tickN * 1000).toLocaleTimeString('en-US');
      document.getElementById('tkClock').textContent = t; document.getElementById('tkClock2').textContent = t;
      spot = Math.max(347.9, Math.min(349.3, spot + (Math.random() - .5) * .3));
      document.getElementById('tkSpot').textContent = m2(spot);
      var sb = 2.12 + (348.60 - spot) * .2, lb = 1.57 + (348.60 - spot) * .16;
      document.getElementById('tkS').textContent = m2(sb) + ' / ' + m2(sb + .08);
      document.getElementById('tkL').textContent = m2(lb) + ' / ' + m2(lb + .08);
      document.getElementById('tkNet').textContent = m2(sb - lb - .08) + ' / ' + m2(sb + .08 - lb);
    }
    function reset() {
      timers.forEach(clearTimeout); timers = []; clearInterval(ticking);
      ovl.classList.remove('on'); dlg.classList.remove('on');
      idle.hidden = false; work.hidden = true; confirm.hidden = true; submit.hidden = false; submit.className = 'submit'; yes.className = 'yes';
      lines.innerHTML = ''; st.innerHTML = LOADER + '<span>Working order…</span>'; stop.textContent = 'Stop & cancel order'; stop.className = 'stopbtn';
      setQty(1); dlg.scrollTop = 0;
      cur.style.opacity = '0'; cur.style.transition = 'none'; cur.style.left = '50%'; cur.style.top = '60%'; void cur.offsetWidth; cur.style.transition = '';
    }
    function play() {
      reset();
      if (reduce) { ovl.classList.add('on'); dlg.classList.add('on'); setQty(5); idle.hidden = true; work.hidden = false; log.forEach(function (m, i) { var d = document.createElement('div'); d.className = 'in'; d.innerHTML = '<span class="t">' + new Date(clockBase.getTime() + i * 30000).toLocaleTimeString('en-US') + '</span>' + m; lines.appendChild(d); }); st.innerHTML = CHECK + '<span>Order filled</span>'; stop.textContent = 'Done'; stop.className = 'donebtn'; return; }
      at(500, function () { ovl.classList.add('on'); dlg.classList.add('on'); ticking = setInterval(tick, 900); });
      at(1500, function () { cur.style.opacity = '1'; moveTo(plus, .5, .5); });
      for (var i = 1; i <= 4; i++) (function (i) { at(2700 + i * 260, function () { clickAt(); setQty(1 + i); }); })(i);
      at(4400, function () { moveTo(submit, .5, .5); });
      at(5500, function () { submit.classList.add('hover'); });
      at(5800, function () { clickAt(); submit.classList.add('press'); at(140, function () { submit.hidden = true; confirm.hidden = false; }); });
      at(6600, function () { moveTo(yes, .5, .5); });
      at(7600, function () { yes.classList.add('hover'); });
      at(7900, function () {
        clickAt(); yes.classList.add('press');
        at(180, function () { idle.hidden = true; work.hidden = false; dlg.scrollTop = 0; cur.style.opacity = '0'; });
        log.forEach(function (m, i) {
          at(700 + i * 950, function () {
            var d = document.createElement('div'); d.innerHTML = '<span class="t">' + new Date(clockBase.getTime() + tickN * 1000 + i * 30000).toLocaleTimeString('en-US') + '</span>' + m;
            lines.appendChild(d); setTimeout(function () { d.classList.add('in'); }, 30);
            if (i === log.length - 1) { st.innerHTML = CHECK + '<span>Order filled</span>'; stop.textContent = 'Done'; stop.className = 'donebtn'; clearInterval(ticking); }
          });
        });
        at(700 + log.length * 950 + 4500, function () { ovl.classList.remove('on'); dlg.classList.remove('on'); });
        at(700 + log.length * 950 + 5500, play);
      });
    }
    document.getElementById('tkReplay').addEventListener('click', play);
    play();
  })();

})();
