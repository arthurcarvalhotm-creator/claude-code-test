/* =====================================================================
 * Laboratório de Cafeteria — Timer guiado de preparo
 * Contagem regressiva por etapa, balança-alvo subindo na vazão ideal,
 * barra de progresso por etapa e marcação do fim da drenagem.
 * ===================================================================== */
(function () {
  'use strict';
  const E = window.Engine;
  const L = () => window.CafeLab;

  /* ---------- áudio / vibração / tela ligada ---------- */
  let actx = null;
  function beep(freq, dur, vol) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = freq || 880;
      g.gain.setValueAtTime(vol || 0.15, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (dur || 0.15));
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + (dur || 0.15));
    } catch (e) { /* sem áudio */ }
  }
  const vibrar = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* */ } };
  let wakeLock = null;
  async function manterTela(on) {
    try {
      if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { /* sem wake lock */ }
  }

  const mmss = (s) => { const neg = s < 0; s = Math.abs(Math.round(s)); const m = Math.floor(s / 60), r = s % 60; return `${neg ? '−' : ''}${m}:${String(r).padStart(2, '0')}`; };
  const fmtT = (s) => (s >= 3600 ? E.fmtTempo(s) : mmss(s));

  /* ---------- plano de fases a partir das etapas ---------- */
  function montarFases(cfg) {
    const m = cfg.metodo, esp = E.isEspresso(m);
    const et = cfg.etapas.slice().sort((a, b) => a.t - b.t);
    const fluxo = m.fluxo || 6;
    const alvoFinal = Math.max(et[et.length - 1].t + 15, m.tempoS.padrao);
    let prev = 0;
    return et.map((e, i) => {
      const inicio = e.t;
      const fim = i < et.length - 1 ? et[i + 1].t : alvoFinal;
      const despejo = Math.max(0, (Number(e.acumulado) || 0) - prev);
      let despejoS = 0;
      if (despejo > 0) despejoS = esp ? Math.max(1, fim - inicio) : Math.min(Math.max(3, despejo / fluxo), Math.max(3, (fim - inicio) * 0.85));
      const fase = { i, inicio, fim, despejo: Math.round(despejo * 10) / 10, de: prev, ate: Number(e.acumulado) || prev, despejoS, desc: e.desc || '', final: i === et.length - 1, vazao: despejoS ? despejo / despejoS : 0 };
      prev = fase.ate;
      return fase;
    });
  }

  function open(cfg, onDone) {
    const lab = L();
    const m = cfg.metodo;
    const fases = montarFases(cfg);
    const total = Math.max(cfg.water || 0, ...fases.map((f) => f.ate));
    const esp = E.isEspresso(m);
    const drenagemFinal = !esp && fases[fases.length - 1].despejo === 0 && ['filtrado'].includes(m.tipo);
    const st = { fase: -1, rodando: false, inicioMs: 0, acumuladoMs: 0, shift: 0, marcas: [], drenagemS: null, contagem: 0, fim: false, avisado: {} };

    lab.modal(`
      <div class="timer" id="tmr">
        <div class="sheet-head"><div><h2 style="margin:0">${m.icone} ${lab.esc(m.nome)}</h2><small class="muted">${lab.esc(cfg.grao ? cfg.grao.nome : '')} · ${cfg.dose} g → ${total} g${esp ? ' de bebida' : ''} · ${cfg.tempC} °C${cfg.clicks ? ' · ' + cfg.clicks + ' cl' : ''}</small></div><button class="btn sm ghost" id="tmrX" aria-label="Fechar">✕</button></div>
        <div class="tmr-main">
          <div class="tmr-ring">
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="100" r="88" class="ring-bg"/>
              <circle cx="100" cy="100" r="88" class="ring-pour" id="ringPour" transform="rotate(-90 100 100)"/>
              <circle cx="100" cy="100" r="88" class="ring-fg" id="ringFg" transform="rotate(-90 100 100)"/>
            </svg>
            <div class="ring-txt"><div class="ring-rem" id="tRem">0:00</div><div class="ring-lbl" id="tLbl">pronto</div><div class="ring-tot" id="tTot">total 0:00</div></div>
          </div>
          <div class="tmr-scale" title="Balança alvo">
            <div class="jar"><div class="jar-fill" id="jarFill"></div><div class="jar-mark" id="jarMark"></div></div>
            <div class="scale-read"><strong id="gNow">0</strong><span> g</span></div>
            <small class="muted">alvo <span id="gAlvo">0</span> / ${total} g</small>
          </div>
        </div>
        <div class="tmr-instr" id="tInstr"><strong>Tare a balança com o café no filtro.</strong><br><span class="muted">Toque em Iniciar. Haverá uma contagem de 3 s.</span></div>
        <div class="tmr-flow" id="tFlow"></div>
        <div class="tmr-steps" id="tSteps">${fases.map((f) => `
          <div class="tstep" data-i="${f.i}">
            <div class="tstep-h"><span class="tstep-n">${f.i + 1}</span><span class="tstep-t">${fmtT(f.inicio)}</span><span class="tstep-d">${f.despejo ? `+${f.despejo} g → <strong>${f.ate} g</strong>` : (f.final && drenagemFinal ? 'drenagem' : 'ação')}</span></div>
            <div class="tbar"><div class="tbar-fill"></div></div>
            <div class="tstep-desc">${lab.esc(f.desc)}</div>
          </div>`).join('')}</div>
        <div class="tmr-ctrl">
          <button class="btn primary" id="bPlay">▶ Iniciar</button>
          <button class="btn" id="bNext" disabled>⏭ Próxima etapa</button>
          <button class="btn" id="bDrain" hidden>💧 Drenou</button>
          <button class="btn" id="bDone" disabled>✓ Concluir</button>
        </div>
        <small class="muted" style="display:block;margin-top:8px">A balança mostra o alvo teórico na vazão ideal (${m.fluxo || 6} g/s). Siga o número; se estiver atrás, acelere o despejo.</small>
      </div>`, (sheet) => {
      sheet.classList.add('sheet-full');
      const $ = (s) => sheet.querySelector(s);
      const C = 2 * Math.PI * 88;
      ['#ringFg', '#ringPour'].forEach((id) => { $(id).style.strokeDasharray = C; $(id).style.strokeDashoffset = C; });
      let tick = null;

      const elapsed = () => (st.acumuladoMs + (st.rodando ? performance.now() - st.inicioMs : 0)) / 1000;
      const inicioFase = (i) => fases[i].inicio + (i > 0 ? st.shift : 0);
      const fimFase = (i) => (i < fases.length - 1 ? inicioFase(i + 1) : fases[i].fim + st.shift);

      function entrarFase(i, e) {
        st.fase = i;
        st.marcas[i] = Math.round(e);
        beep(i === 0 ? 1046 : 880, 0.25, 0.2); vibrar([120, 60, 120]);
        const f = fases[i];
        if (f.final && drenagemFinal) $('#bDrain').hidden = false;
      }

      function atualizar() {
        const e = elapsed();
        // contagem inicial
        if (st.contagem > 0) {
          const rest = st.contagem - e;
          if (rest > 0) {
            $('#tRem').textContent = Math.ceil(rest); $('#tLbl').textContent = 'prepare-se'; $('#tTot').textContent = '';
            const k = 'c' + Math.ceil(rest); if (!st.avisado[k]) { st.avisado[k] = 1; beep(660, 0.12); }
            return;
          }
          // fim da contagem: zera o relógio
          st.acumuladoMs = 0; st.inicioMs = performance.now(); st.contagem = 0; entrarFase(0, 0);
          $('#bNext').disabled = false; $('#bDone').disabled = false;
          return atualizar();
        }
        if (st.fase < 0) return;
        // avanço automático
        while (st.fase < fases.length - 1 && e >= inicioFase(st.fase + 1)) entrarFase(st.fase + 1, inicioFase(st.fase + 1));
        const i = st.fase, f = fases[i];
        const ini = inicioFase(i), fim = fimFase(i), dur = Math.max(1, fim - ini), dentro = e - ini;
        // avisos 3-2-1 antes da próxima etapa
        const rest = fim - e;
        if (i < fases.length - 1 && rest <= 3 && rest > 0) { const k = `a${i}_${Math.ceil(rest)}`; if (!st.avisado[k]) { st.avisado[k] = 1; beep(520, 0.1, 0.12); } }
        // água alvo
        const pourFrac = f.despejoS ? Math.min(1, dentro / f.despejoS) : 1;
        const gNow = f.de + (f.ate - f.de) * pourFrac;
        const despejando = f.despejo > 0 && dentro < f.despejoS;
        // anel
        $('#ringFg').style.strokeDashoffset = C * (1 - Math.min(1, dentro / dur));
        $('#ringPour').style.strokeDashoffset = C * (1 - Math.min(1, f.despejoS / dur));
        const finalDren = f.final && drenagemFinal;
        $('#tRem').textContent = finalDren && rest < 0 ? '+' + mmss(-rest) : mmss(Math.max(0, rest));
        $('#tLbl').textContent = despejando ? 'despejando' : finalDren ? (rest > 0 ? 'drenagem alvo' : 'passou do alvo') : f.final ? 'finalize' : 'próxima em';
        $('#tTot').textContent = 'total ' + fmtT(e);
        // balança
        $('#gNow').textContent = Math.round(gNow);
        $('#gAlvo').textContent = Math.round(f.ate);
        $('#jarFill').style.height = (100 * gNow / total) + '%';
        $('#jarMark').style.bottom = (100 * f.ate / total) + '%';
        sheet.querySelector('.tmr-scale').classList.toggle('pouring', despejando);
        // instrução
        const passo = `Etapa ${i + 1}/${fases.length}`;
        let instr;
        if (despejando) instr = `<strong>${passo} · ${f.de ? `Despeje ${f.despejo} g até ${f.ate} g` : `Despeje até ${f.ate} g`}</strong><br>${lab.esc(f.desc)}`;
        else if (finalDren) instr = `<strong>${passo} · Deixe drenar</strong><br>Alvo: terminar entre ${fmtT(m.tempoS.min)} e ${fmtT(m.tempoS.max)}. Toque em <em>Drenou</em> quando o leito secar.`;
        else if (f.final) instr = `<strong>${passo} · ${lab.esc(f.desc) || 'Finalize'}</strong><br>Toque em <em>Concluir</em> ao terminar.`;
        else instr = `<strong>${passo} · ${f.despejo ? 'Aguarde' : lab.esc(f.desc)}</strong><br>${f.despejo ? `Próximo ataque em ${mmss(rest)}${fases[i + 1] && fases[i + 1].despejo ? ` · +${fases[i + 1].despejo} g` : ''}` : 'Próxima ação em ' + mmss(rest)}`;
        $('#tInstr').innerHTML = instr;
        $('#tFlow').innerHTML = despejando && !esp ? `<span class="flow-pill">Vazão ideal <strong>${(f.vazao).toFixed(1).replace('.', ',')} g/s</strong> · ${Math.max(0, Math.ceil(f.despejoS - dentro))} s restantes de despejo</span>` : esp && despejando ? `<span class="flow-pill">Alvo ${f.ate} g em ${fmtT(fim)} · ~${f.vazao.toFixed(1)} g/s</span>` : '';
        // barras por etapa
        sheet.querySelectorAll('.tstep').forEach((el) => {
          const k = +el.dataset.i, fill = el.querySelector('.tbar-fill');
          let p = 0;
          if (k < i) p = 1; else if (k === i) p = Math.min(1, dentro / dur);
          fill.style.width = (p * 100) + '%';
          el.classList.toggle('on', k === i); el.classList.toggle('done', k < i);
        });
        if (st.drenagemS != null && !st.fim) { st.fim = true; }
      }

      function play() {
        if (st.fim) return;
        if (!st.rodando) {
          if (st.fase < 0 && st.contagem === 0) { st.contagem = 3; st.acumuladoMs = 0; }
          st.rodando = true; st.inicioMs = performance.now();
          $('#bPlay').textContent = '⏸ Pausar';
          manterTela(true);
          tick = tick || setInterval(atualizar, 100);
        } else {
          st.acumuladoMs += performance.now() - st.inicioMs; st.rodando = false;
          $('#bPlay').textContent = '▶ Continuar';
        }
        atualizar();
      }
      function proxima() {
        if (st.fase < 0 || st.fase >= fases.length - 1) return;
        const e = elapsed();
        st.shift += e - inicioFase(st.fase + 1);
        entrarFase(st.fase + 1, e);
        atualizar();
      }
      function parar() { clearInterval(tick); tick = null; st.rodando = false; manterTela(false); }
      function concluir() {
        const e = elapsed();
        parar();
        const tempoS = Math.round(st.drenagemS != null ? st.drenagemS : e);
        const etapas = fases.map((f, k) => ({ t: st.marcas[k] != null ? st.marcas[k] : f.inicio, acumulado: f.ate, desc: f.desc }));
        if (st.drenagemS != null && drenagemFinal) etapas[etapas.length - 1].desc = (etapas[etapas.length - 1].desc ? etapas[etapas.length - 1].desc + ' ' : '') + `[fim da drenagem: ${fmtT(st.drenagemS)}]`;
        beep(1318, 0.35, 0.2); vibrar([200, 80, 200]);
        lab.closeModal();
        onDone && onDone({ tempoS, drenagemS: st.drenagemS, etapas });
      }
      $('#bPlay').onclick = play;
      $('#bNext').onclick = proxima;
      $('#bDrain').onclick = () => { st.drenagemS = Math.round(elapsed()); $('#bDrain').hidden = true; concluir(); };
      $('#bDone').onclick = concluir;
      $('#tmrX').onclick = () => { if (st.fase < 0 || window.confirm('Descartar o timer em andamento?')) { parar(); lab.closeModal(); } };
      // fechar tocando fora não deve interromper um preparo
      const bg = sheet.closest('.modal-bg');
      bg.addEventListener('click', (ev) => { if (ev.target === bg) ev.stopImmediatePropagation(); }, true);
      atualizar();
    });
  }

  window.CafeTimer = { open, montarFases };
})();
