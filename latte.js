/* =====================================================================
 * Laboratório de Cafeteria — Treino de latte art (balanço da jarra)
 * Usa o acelerômetro do celular (DeviceMotion) para transformar o
 * balanço lateral da jarra numa onda, compara com um padrão-alvo que
 * desce na tela e pontua ritmo, constância, uniformidade e sincronia.
 * Sem sensor, dá para treinar arrastando o dedo na tela.
 * ===================================================================== */
(function () {
  'use strict';
  const lab = window.CafeLab;
  const PADROES = [
    { id: 'rosetta', nome: 'Rosetta completa', dur: 14, desc: 'Base parada, balanço que estreita enquanto você recua, e o corte final.' },
    { id: 'constante', nome: 'Balanço constante', dur: 20, desc: 'Ritmo e largura iguais do começo ao fim.' },
    { id: 'w3', nome: '3 balanços', dur: 20, desc: 'Grupos de 3 balanços com uma pausa curta.' },
    { id: 'w5', nome: '5 balanços', dur: 20, desc: 'Grupos de 5 balanços com uma pausa curta.' },
    { id: 'w7', nome: '7 balanços', dur: 20, desc: 'Grupos de 7: resistência e controle.' },
    { id: 'aleatorio', nome: 'Aleatório', dur: 20, desc: 'Grupos e larguras variando, como numa jarra de verdade.' }
  ];
  const cfg = () => { const s = lab.state(); s.config.latte = Object.assign({ padrao: 'rosetta', freq: 4, largura: 60, velocidade: 50, metronomo: true, modo: 'auto' }, s.config.latte || {}); return s.config.latte; };
  const hist = () => { const s = lab.state(); s.latte = s.latte || []; return s.latte; };

  /* ---------- padrão-alvo: valor −1…1 no tempo t (s) ---------- */
  function gerarAlvo(padrao, f, dur, seed) {
    let rnd = seed || 7; const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    const grupos = [];
    if (padrao === 'aleatorio') { let t = 0; while (t < dur) { const n = 2 + Math.floor(rand() * 6), a = 0.55 + rand() * 0.45; grupos.push({ t0: t, n, a }); t += n / f + 0.5; } }
    return function (t) {
      if (t < 0 || t > dur) return 0;
      const s = Math.sin(2 * Math.PI * f * t);
      switch (padrao) {
        case 'constante': return s;
        case 'rosetta': {
          if (t < 1.5 || t > 12.2) return 0;
          const k = (t - 1.5) / (12.2 - 1.5);
          return Math.sin(2 * Math.PI * f * (t - 1.5)) * (1 - 0.65 * k);
        }
        case 'aleatorio': {
          const g = grupos.filter((x) => x.t0 <= t).pop(); if (!g) return 0;
          const dt = t - g.t0; return dt < g.n / f ? g.a * Math.sin(2 * Math.PI * f * dt) : 0;
        }
        default: { // w3/w5/w7
          const n = +padrao.slice(1), ciclo = n / f + 0.5, dt = t % ciclo;
          return dt < n / f ? Math.sin(2 * Math.PI * f * dt) : 0;
        }
      }
    };
  }

  /* ---------- análise ---------- */
  function analisar(amostras, alvo, f, dur) {
    const dt = 0.02, N = Math.floor(dur / dt);
    const u = new Float32Array(N), g = new Float32Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const t = i * dt;
      while (j < amostras.length - 2 && amostras[j + 1].t < t) j++;
      const a = amostras[j], b = amostras[j + 1] || a;
      u[i] = a && b ? (b.t === a.t ? a.v : a.v + (b.v - a.v) * Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)))) : 0;
      g[i] = alvo(t);
    }
    // meios-ciclos (cruzamentos por zero com histerese) só onde o alvo balança
    const ativo = (i) => Math.abs(g[i]) > 0.05 || Math.abs(alvo(i * dt + 0.1)) > 0.05;
    const cruz = [], picos = []; let lado = 0, pico = 0, tAtivo = 0;
    for (let i = 0; i < N; i++) {
      if (!ativo(i)) continue;
      tAtivo += dt;
      const v = u[i]; pico = Math.max(pico, Math.abs(v));
      const novo = v > 0.15 ? 1 : v < -0.15 ? -1 : lado;
      if (novo !== lado && lado !== 0) { cruz.push(i * dt); picos.push(pico); pico = 0; }
      lado = novo;
    }
    const fUser = tAtivo ? cruz.length / 2 / tAtivo : 0;
    const per = []; for (let i = 1; i < cruz.length; i++) { const p = cruz[i] - cruz[i - 1]; if (p < 1) per.push(p); }
    const cv = (a) => { if (a.length < 3) return 1; const m = a.reduce((s, x) => s + x, 0) / a.length; const sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); return m ? sd / m : 1; };
    const ritmo = Math.max(0, 1 - Math.abs(fUser - f) / f * 2);
    const constancia = Math.max(0, 1 - cv(per) * 2.5);
    const uniformidade = Math.max(0, 1 - cv(picos.slice(1)) * 2);
    // sincronia: melhor correlação com atraso de até 0,35 s
    let melhor = 0;
    for (let lag = 0; lag <= 0.35 / dt; lag++) {
      let su = 0, sg = 0, sug = 0;
      for (let i = 0; i + lag < N; i++) { const a = u[i + lag], b = g[i]; su += a * a; sg += b * b; sug += a * b; }
      const c = su && sg ? sug / Math.sqrt(su * sg) : 0; if (c > melhor) melhor = c;
    }
    const sincronia = Math.max(0, melhor);
    const score = Math.round(100 * (0.3 * ritmo + 0.25 * constancia + 0.2 * uniformidade + 0.25 * sincronia));
    return { score, fUser: Math.round(fUser * 10) / 10, ritmo, constancia, uniformidade, sincronia, u, dt };
  }

  /* ---------- desenho da rosetta a partir do seu traço ---------- */
  function desenharXicara(cv, res, padrao) {
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 6;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#efe4d6'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    const grad = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 0.92);
    grad.addColorStop(0, '#b77a4a'); grad.addColorStop(1, '#6b3f22');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, R * 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R * 0.88, 0, Math.PI * 2); ctx.clip();
    const u = res.u, n = u.length, dt = res.dt, y0 = cy + R * 0.6, y1 = cy - R * 0.5;
    const leite = 'rgba(252,246,238,.96)';
    ctx.fillStyle = leite; ctx.strokeStyle = leite; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // picos de cada meio-balanço (tempo e largura reais do seu movimento)
    const picos = []; let lado = 0, best = 0, tb = 0;
    for (let i = 0; i < n; i++) {
      const v = u[i], nv = v > 0.15 ? 1 : v < -0.15 ? -1 : lado;
      if (nv !== lado && lado !== 0) { picos.push({ t: tb, a: best }); best = 0; }
      if (Math.abs(v) > best) { best = Math.abs(v); tb = i * dt; }
      lado = nv;
    }
    const k = Math.max(1, Math.ceil(picos.length / 11));
    const folhas = picos.filter((_, i) => i % k === 0).slice(0, 11);
    // base (primeira gota) em formato de gota
    ctx.beginPath(); ctx.ellipse(cx, y0 + R * 0.06, R * 0.22, R * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    if (folhas.length) {
      const tA = folhas[0].t, tB = folhas[folhas.length - 1].t || tA + 1;
      folhas.forEach((f, idx) => {
        const kk = folhas.length > 1 ? (f.t - tA) / (tB - tA || 1) : 0;
        const y = y0 - (y0 - y1) * kk;
        const larg = R * 0.66 * (1 - 0.6 * kk) * Math.min(1.15, Math.max(0.3, f.a));
        const esp = Math.max(5, R * 0.1 * (1 - 0.5 * kk));
        ctx.beginPath();                                       // folha: "U" preenchido
        ctx.moveTo(cx - larg, y - esp * 0.6);
        ctx.quadraticCurveTo(cx, y + esp * 1.6, cx + larg, y - esp * 0.6);
        ctx.quadraticCurveTo(cx, y + esp * 0.2, cx - larg, y - esp * 0.6);
        ctx.fill();
        void idx;
      });
    }
    // corte
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, y1 - R * 0.08); ctx.lineTo(cx, y0 + R * 0.12); ctx.stroke();
    ctx.restore();
  }

  /* ---------- áudio (metrônomo) ---------- */
  let actx = null;
  function tick(forte) { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), gg = actx.createGain(); o.frequency.value = forte ? 1320 : 880; gg.gain.setValueAtTime(forte ? 0.12 : 0.06, actx.currentTime); gg.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.05); o.connect(gg); gg.connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.06); } catch (e) { /* */ } }

  /* ---------- tela ---------- */
  lab.routes.latte = (view) => {
    document.getElementById('title').textContent = 'Treino de latte art';
    const c = cfg(), h = hist();
    const melhor = h.filter((x) => x.padrao === c.padrao).reduce((m, x) => Math.max(m, x.score), 0);
    const ult = h.slice(-20);
    view.innerHTML = `
      ${window.Mascote ? window.Mascote.card(h.length ? 'torcendo' : 'feliz', h.length ? `Seu recorde em <strong>${PADROES.find((p) => p.id === c.padrao).nome}</strong> é ${melhor || '—'} pontos. Bora bater?` : 'Segure o celular como o cabo da jarra, tela para cima, e balance o punho para os lados. Eu te ajudo com o ritmo!', { compacto: true }) : ''}
      <div class="card" style="margin-top:12px">
        <div class="form-grid">
          <label class="field"><span class="lbl">Padrão</span><select id="lPad">${PADROES.map((p) => `<option value="${p.id}" ${p.id === c.padrao ? 'selected' : ''}>${p.nome}</option>`).join('')}</select></label>
          <label class="field"><span class="lbl">Entrada</span><select id="lModo"><option value="auto" ${c.modo === 'auto' ? 'selected' : ''}>Acelerômetro (celular)</option><option value="toque" ${c.modo === 'toque' ? 'selected' : ''}>Dedo na tela</option></select></label>
        </div>
        <small class="muted" id="lDesc"></small>
        <div class="range-row" style="margin-top:10px"><span class="lbl">Ritmo (Hz)</span><input type="range" id="lFreq" min="2" max="6" step="0.5" value="${c.freq}" oninput="this.nextElementSibling.value=this.value"><output>${c.freq}</output></div>
        <div class="range-row"><span class="lbl">Largura da onda</span><input type="range" id="lLarg" min="20" max="100" step="5" value="${c.largura}" oninput="this.nextElementSibling.value=this.value"><output>${c.largura}</output></div>
        <div class="range-row"><span class="lbl">Velocidade</span><input type="range" id="lVel" min="20" max="100" step="5" value="${c.velocidade}" oninput="this.nextElementSibling.value=this.value"><output>${c.velocidade}</output></div>
        <label class="chk"><input type="checkbox" id="lMet" ${c.metronomo ? 'checked' : ''}> Metrônomo</label>
      </div>
      <div class="latte-scope" id="lScope">
        <canvas id="lCanvas"></canvas>
        <div class="latte-hud"><span id="lHz">— Hz</span><span id="lTempo">0,0 s</span><span id="lSync">sincronia —</span></div>
        <div class="latte-msg" id="lMsg">Toque em <strong>Começar</strong>. A linha tracejada é o alvo: ela desce até a linha do agora e você acompanha com o balanço.</div>
      </div>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="lGo">▶ Começar</button><button class="btn" id="lStop" disabled>■ Parar</button></div>
      <div id="lRes"></div>
      <div class="section-title"><h2>Histórico</h2></div>
      ${ult.length ? `<div class="card">${sparkline(ult)}<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Quando</th><th>Padrão</th><th>Hz</th><th>Pontos</th></tr></thead><tbody>${ult.slice().reverse().slice(0, 10).map((x) => `<tr><td>${lab.fmtData(x.t)}</td><td>${lab.esc((PADROES.find((p) => p.id === x.padrao) || {}).nome || x.padrao)}</td><td>${String(x.fUser).replace('.', ',')} / ${String(x.freq).replace('.', ',')}</td><td><strong>${x.score}</strong></td></tr>`).join('')}</tbody></table></div></div>` : '<div class="empty">Nenhum treino ainda.</div>'}
      <details class="lib" style="margin-top:14px"><summary>Como treinar</summary><div class="body">
        <p>1. Segure o celular na horizontal da palma, tela para cima, como se fosse o cabo da jarra. Para mais realismo, prenda o celular na jarra com um elástico e coloque água dentro.</p>
        <p>2. O balanço vem do punho, não do braço. Mantenha o cotovelo parado e faça movimentos curtos para os lados.</p>
        <p>3. Comece em 3–4 Hz com o metrônomo. Ritmo constante vale mais que velocidade.</p>
        <p>4. Na <em>rosetta completa</em>: 1,5 s parado (base), balance enquanto recua (a onda estreita) e termine com o corte parado.</p>
        <p>No iPhone, o navegador pede permissão para o sensor de movimento, e o app precisa estar em https (GitHub Pages).</p>
      </div></details>`;

    const q = (s) => view.querySelector(s);
    const upd = () => { const p = PADROES.find((x) => x.id === q('#lPad').value); q('#lDesc').textContent = `${p.desc} Duração ${p.dur} s.`; };
    q('#lPad').onchange = upd; upd();
    const salvarCfg = () => Object.assign(cfg(), { padrao: q('#lPad').value, modo: q('#lModo').value, freq: +q('#lFreq').value, largura: +q('#lLarg').value, velocidade: +q('#lVel').value, metronomo: q('#lMet').checked });

    const canvas = q('#lCanvas'), scope = q('#lScope');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    function ajustar() { const r = scope.getBoundingClientRect(); canvas.width = r.width * dpr; canvas.height = r.height * dpr; }
    ajustar();

    let sess = null;
    function desenhar(agora) {
      const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
      const css = getComputedStyle(document.documentElement);
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, yNow = H * 0.62, pps = (sess ? sess.vel : 50) * 6 * dpr, amp = (W / 2 - 12 * dpr) * ((sess ? sess.larg : 60) / 100);
      // grade
      ctx.strokeStyle = css.getPropertyValue('--border'); ctx.lineWidth = 1;
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(cx + k * amp / 2, 0); ctx.lineTo(cx + k * amp / 2, H); ctx.stroke(); }
      ctx.strokeStyle = css.getPropertyValue('--text-2'); ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(0, yNow); ctx.lineTo(W, yNow); ctx.stroke();
      if (!sess) return;
      const t = agora;
      // alvo (futuro acima, passado abaixo)
      ctx.strokeStyle = css.getPropertyValue('--muted'); ctx.lineWidth = 2 * dpr; ctx.setLineDash([6 * dpr, 5 * dpr]); ctx.beginPath();
      for (let y = 0; y <= H; y += 3 * dpr) { const tt = t + (yNow - y) / pps; const x = cx + sess.alvo(tt) * amp; y ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); ctx.setLineDash([]);
      // seu traço (abaixo do agora)
      ctx.strokeStyle = css.getPropertyValue('--accent'); ctx.lineWidth = 3 * dpr; ctx.lineJoin = 'round'; ctx.beginPath();
      let first = true;
      for (let i = sess.amostras.length - 1; i >= 0; i--) { const a = sess.amostras[i]; const y = yNow + (t - a.t) * pps; if (y > H + 10) break; const x = cx + a.v * amp; first ? ctx.moveTo(x, y) : ctx.lineTo(x, y); first = false; }
      ctx.stroke();
      const v = sess.v; ctx.fillStyle = css.getPropertyValue('--accent'); ctx.beginPath(); ctx.arc(cx + v * amp, yNow, 7 * dpr, 0, Math.PI * 2); ctx.fill();
    }
    desenhar(0);

    /* entrada: acelerômetro */
    const filtro = { hp: 0, prev: 0, lp: 0, pico: 1.5 };
    function onMotion(e) {
      if (!sess) return;
      sess.sensorOk = true;
      const a = (e.acceleration && e.acceleration.x != null) ? e.acceleration.x : (e.accelerationIncludingGravity ? e.accelerationIncludingGravity.x : 0);
      filtro.hp = 0.92 * (filtro.hp + a - filtro.prev); filtro.prev = a;        // passa-alta (~1 Hz)
      filtro.lp = filtro.lp + 0.45 * (filtro.hp - filtro.lp);                  // suaviza
      const d = -filtro.lp;                                                    // deslocamento ∝ −aceleração
      filtro.pico = Math.max(1.2, filtro.pico * 0.995, Math.abs(d));           // ganho automático
      sess.entrada(Math.max(-1.2, Math.min(1.2, d / filtro.pico)));
    }
    /* entrada: dedo */
    function onPointer(e) { if (!sess || sess.modo !== 'toque') return; const r = canvas.getBoundingClientRect(); const amp = r.width / 2 * (sess.larg / 100); sess.entrada(Math.max(-1.2, Math.min(1.2, (e.clientX - r.left - r.width / 2) / amp))); }
    canvas.addEventListener('pointermove', onPointer); canvas.addEventListener('pointerdown', onPointer);

    async function comecar() {
      salvarCfg(); lab.save();
      const c2 = cfg(), p = PADROES.find((x) => x.id === c2.padrao);
      let modo = c2.modo === 'toque' ? 'toque' : 'sensor';
      if (modo === 'sensor' && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try { if ((await DeviceMotionEvent.requestPermission()) !== 'granted') { lab.toast('Sem permissão para o sensor: usando o dedo na tela'); modo = 'toque'; } } catch (e) { modo = 'toque'; }
      }
      if (modo === 'sensor' && typeof DeviceMotionEvent === 'undefined') modo = 'toque';
      sess = { modo, padrao: p.id, dur: p.dur, freq: c2.freq, larg: c2.largura, vel: c2.velocidade, met: c2.metronomo, alvo: gerarAlvo(p.id, c2.freq, p.dur, Date.now() % 1000 + 1), amostras: [], v: 0, t0: 0, contagem: 3, sensorOk: false, ultTick: -1 };
      sess.entrada = (v) => { sess.v = v; if (sess.modo === 'sensor' && sess.t0 && !sess.contando) sess.amostras.push({ t: (performance.now() - sess.t0) / 1000, v }); };
      if (modo === 'sensor') window.addEventListener('devicemotion', onMotion);
      q('#lGo').disabled = true; q('#lStop').disabled = false; q('#lRes').innerHTML = '';
      q('#lMsg').innerHTML = modo === 'toque' ? 'Arraste o dedo para os lados na área acima.' : 'Balance o punho para os lados acompanhando a linha tracejada.';
      const inicio = performance.now(); sess.contando = true;
      const loop = () => {
        if (!sess) return;
        const agora = performance.now();
        if (sess.contando) {
          const rest = 3 - (agora - inicio) / 1000;
          q('#lTempo').textContent = `começa em ${Math.ceil(rest)}`;
          if (rest <= 0) { sess.contando = false; sess.t0 = agora; tick(true); }
          desenhar(-Math.max(0, rest));
          if (modo === 'sensor' && agora - inicio > 1500 && !sess.sensorOk) { sess.modo = 'toque'; window.removeEventListener('devicemotion', onMotion); q('#lMsg').innerHTML = 'Sensor de movimento indisponível aqui. Arraste o dedo para os lados.'; }
        } else {
          const t = (agora - sess.t0) / 1000;
          if (sess.met) { const k = Math.floor(t * sess.freq); if (k !== sess.ultTick && Math.abs(sess.alvo(t + 0.02)) > 0.01) { sess.ultTick = k; tick(k % 4 === 0); } }
          if (sess.modo === 'toque') sess.amostras.push({ t, v: sess.v });
          const rec = sess.amostras.filter((a) => a.t > t - 2);
          let cz = 0, ld = 0; rec.forEach((a) => { const nv = a.v > 0.15 ? 1 : a.v < -0.15 ? -1 : ld; if (nv !== ld && ld) cz++; ld = nv; });
          q('#lHz').textContent = `${(cz / 2 / Math.min(2, Math.max(0.5, t))).toFixed(1).replace('.', ',')} Hz`;
          q('#lTempo').textContent = `${t.toFixed(1).replace('.', ',')} / ${sess.dur} s`;
          q('#lSync').textContent = Math.abs(sess.alvo(t)) < 0.02 ? 'segure parado' : 'balance';
          desenhar(t);
          if (t >= sess.dur) return terminar(true);
        }
        sess.raf = requestAnimationFrame(loop);
      };
      sess.raf = requestAnimationFrame(loop);
    }
    function terminar(completo) {
      if (!sess) return;
      cancelAnimationFrame(sess.raf); window.removeEventListener('devicemotion', onMotion);
      const s = sess; sess = null;
      q('#lGo').disabled = false; q('#lStop').disabled = true;
      if (!completo || s.amostras.length < 20) { q('#lMsg').innerHTML = 'Treino interrompido.'; desenhar(0); return; }
      const res = analisar(s.amostras, s.alvo, s.freq, s.dur);
      hist().push({ t: new Date().toISOString(), padrao: s.padrao, freq: s.freq, fUser: res.fUser, score: res.score, ritmo: +res.ritmo.toFixed(2), constancia: +res.constancia.toFixed(2), uniformidade: +res.uniformidade.toFixed(2), sincronia: +res.sincronia.toFixed(2), modo: s.modo });
      lab.save();
      const pc = (x) => Math.round(x * 100);
      const fala = window.Mascote ? window.Mascote.porLatte(res.score) : null;
      q('#lRes').innerHTML = `<div class="card latte-res" style="margin-top:12px">
        <div class="latte-res-top"><canvas id="lCup" width="360" height="360"></canvas><div><div class="hero-num">${res.score}<small style="font-size:.9rem"> pts</small></div><small class="muted">${res.fUser.toString().replace('.', ',')} Hz de ${s.freq.toString().replace('.', ',')} Hz alvo</small></div></div>
        <div class="kv" style="margin-top:10px">
          <div><span class="lbl">Ritmo</span><div class="v">${pc(res.ritmo)}%</div></div><div><span class="lbl">Constância</span><div class="v">${pc(res.constancia)}%</div></div>
          <div><span class="lbl">Uniformidade</span><div class="v">${pc(res.uniformidade)}%</div></div><div><span class="lbl">Sincronia</span><div class="v">${pc(res.sincronia)}%</div></div>
        </div>
        ${fala ? `<div style="margin-top:10px">${window.Mascote.card(fala.humor, fala.texto, { compacto: true })}</div>` : ''}
        <div class="inline-actions"><button class="btn primary sm" id="lAgain">Treinar de novo</button><button class="btn sm" id="lHist">Ver histórico</button></div></div>`;
      desenharXicara(q('#lCup'), res, s.padrao);
      q('#lMsg').innerHTML = dica(res);
      q('#lAgain').onclick = () => lab.render();
      q('#lHist').onclick = () => lab.render();
      q('#lRes').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    q('#lGo').onclick = comecar;
    q('#lStop').onclick = () => terminar(false);
    // encerra o treino ao sair da tela
    window.addEventListener('hashchange', function sair() { if (sess) terminar(false); window.removeEventListener('hashchange', sair); });
  };
  function dica(res) {
    const piores = [['ritmo', res.ritmo, 'Seu ritmo ficou fora do alvo. Siga o metrônomo e conte "1-2" a cada balanço.'], ['constancia', res.constancia, 'O intervalo entre balanços variou. Relaxe o punho e mantenha o cotovelo parado.'], ['uniformidade', res.uniformidade, 'A largura mudou muito. Faça movimentos do mesmo tamanho.'], ['sincronia', res.sincronia, 'Você se perdeu do padrão. Olhe a linha tracejada chegando e antecipe.']].sort((a, b) => a[1] - b[1]);
    return `<strong>Dica:</strong> ${piores[0][2]}`;
  }
  function sparkline(xs) {
    const W = 300, H = 60, p = 6, n = xs.length;
    const X = (i) => p + (n === 1 ? (W - 2 * p) / 2 : i * (W - 2 * p) / (n - 1)), Y = (v) => H - p - v / 100 * (H - 2 * p);
    const d = xs.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x.score).toFixed(1)}`).join(' ');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pontuação dos últimos treinos" style="max-width:360px"><line x1="${p}" x2="${W - p}" y1="${Y(70)}" y2="${Y(70)}" class="cf-now"/><path class="line" d="${d}"/>${xs.map((x, i) => `<circle class="cf-dot" cx="${X(i)}" cy="${Y(x.score)}" r="4"><title>${x.score} pts</title></circle>`).join('')}</svg><small class="muted">Últimos ${n} treinos · linha pontilhada = 70 pts</small>`;
  }

  lab.hooks.mais.push(() => `<div class="item" onclick="location.hash='#/latte'"><div class="ico">🥛</div><div><div class="t">Treino de latte art</div><div class="s">Balanço da jarra com o acelerômetro do celular</div></div><div>›</div></div>`);
  lab.hooks.tiles = lab.hooks.tiles || [];
  lab.hooks.tiles.push(() => { const h = hist(); const best = h.reduce((m, x) => Math.max(m, x.score), 0); return `<a class="qa-tile" href="#/latte"><span class="qa-ico">🥛</span><span class="qa-t">Latte art</span><span class="qa-s">${h.length ? `recorde ${best} pts · ${h.length} treino(s)` : 'treine o balanço da jarra'}</span></a>`; });

  window.CafeLatte = { gerarAlvo, analisar, PADROES };
})();
