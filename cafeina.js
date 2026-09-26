/* =====================================================================
 * Laboratório de Cafeteria — cafeína: diário e curva farmacocinética
 * Modelo de 1 compartimento com absorção de 1ª ordem (Bateman):
 *   A(t) = D · ka/(ka−ke) · (e^(−ke·t) − e^(−ka·t))
 * ka ≈ 4 h⁻¹ (pico em ~45 min); ke = ln2 / t½; t½ base 5 h ajustada por
 * fumo, anticoncepcional, gestação, idade e sensibilidade; Vd ≈ 0,6 L/kg.
 * Estimativa educativa — não é orientação médica.
 * ===================================================================== */
(function () {
  'use strict';
  const lab = window.CafeLab, DB = window.CAFE_DB, E = window.Engine;
  const KA = 4.0, VD = 0.6, H = 3600000;

  /* ---------- parâmetros pessoais ---------- */
  const PERFIL_PADRAO = { peso: 70, idade: 30, sensibilidade: 'normal', fumante: false, anticoncepcional: false, gestante: false, dormir: '23:00', meiaVidaManual: '' };
  const SENS = {
    baixa: { nome: 'Baixa (tolero bem)', limiarSono: 100, fatorMeiaVida: 0.9 },
    normal: { nome: 'Normal', limiarSono: 50, fatorMeiaVida: 1 },
    alta: { nome: 'Alta (fico agitado/durmo mal)', limiarSono: 30, fatorMeiaVida: 1.2 }
  };
  function perfil() { const s = lab.state(); s.config.cafeina = Object.assign({}, PERFIL_PADRAO, s.config.cafeina || {}); return s.config.cafeina; }
  function lista() { const s = lab.state(); s.cafeina = s.cafeina || []; return s.cafeina; }
  function parametros(p) {
    p = p || perfil();
    const sens = SENS[p.sensibilidade] || SENS.normal;
    let t12 = 5 * sens.fatorMeiaVida;
    const fat = [];
    if (p.fumante) { t12 *= 0.6; fat.push('fumo acelera o metabolismo (−40 %)'); }
    if (p.anticoncepcional) { t12 *= 1.7; fat.push('anticoncepcional oral quase dobra a meia-vida'); }
    if (p.gestante) { t12 *= 2; fat.push('gestação: meia-vida bem maior e limite de 200 mg/dia'); }
    if (+p.idade >= 65) { t12 *= 1.2; fat.push('acima de 65 anos a eliminação é mais lenta'); }
    if (p.meiaVidaManual) { t12 = +p.meiaVidaManual; fat.length = 0; fat.push('meia-vida definida manualmente'); }
    const peso = Math.max(30, +p.peso || 70);
    let limite = Math.min(400, Math.round(5.7 * peso / 10) * 10);
    if (p.gestante) limite = 200;
    if (+p.idade && +p.idade < 18) limite = Math.min(limite, 3 * peso);
    return { t12: Math.round(t12 * 10) / 10, ke: Math.LN2 / t12, peso, vd: VD * peso, limite: Math.round(limite), doseUnica: Math.round(Math.min(200, 3 * peso)), limiarSono: sens.limiarSono, fatores: fat };
  }

  /* ---------- cinética ---------- */
  function quantidade(ts, par, doses) {
    let a = 0;
    for (const d of doses) {
      const dt = (ts - d.ts) / H;
      if (dt <= 0) continue;
      a += d.mg * KA / (KA - par.ke) * (Math.exp(-par.ke * dt) - Math.exp(-KA * dt));
    }
    return a;
  }
  function horaDormir(p, agora) {
    const [h, m] = String(p.dormir || '23:00').split(':').map(Number);
    const d = new Date(agora); d.setHours(h || 0, m || 0, 0, 0);
    if (d.getTime() < agora - 2 * H) d.setDate(d.getDate() + 1); // já passou: próxima noite
    return d.getTime();
  }
  const dosesRecentes = (agora) => lista().map((x) => ({ ...x, ts: new Date(x.t).getTime() })).filter((x) => x.ts > agora - 48 * H && x.ts <= agora + 24 * H);
  const inicioDoDia = (agora) => { const d = new Date(agora); d.setHours(0, 0, 0, 0); return d.getTime(); };

  function resumo(agora) {
    agora = agora || Date.now();
    const p = perfil(), par = parametros(p), doses = dosesRecentes(agora);
    const dia0 = inicioDoDia(agora);
    const hoje = doses.filter((d) => d.ts >= dia0 && d.ts <= agora).reduce((s, d) => s + d.mg, 0);
    const dormir = horaDormir(p, agora);
    const noCorpo = quantidade(agora, par, doses);
    // pior momento nas 2 primeiras horas de sono (cobre um café tomado perto de deitar)
    const noSono = (ds) => { let mx = 0; for (let t = dormir; t <= dormir + 2 * H; t += 10 * 60000) mx = Math.max(mx, quantidade(t, par, ds)); return mx; };
    const naCama = noSono(doses);
    // horário em que cai abaixo do limiar
    let limpo = null;
    for (let t = agora; t < agora + 36 * H; t += 5 * 60000) if (quantidade(t, par, doses) <= par.limiarSono) { limpo = t; break; }
    // último horário para um café de 100 mg sem passar do limiar no início do sono
    let ultimo = null;
    for (let t = agora; t <= dormir; t += 5 * 60000) { if (noSono(doses.concat([{ mg: 100, ts: t }])) <= par.limiarSono) ultimo = t; else break; }
    const status = naCama <= par.limiarSono ? 'ok' : naCama <= par.limiarSono * 2 ? 'atencao' : 'alto';
    return { p, par, doses, hoje: Math.round(hoje), noCorpo, naCama, dormir, limpo, ultimo, status, agora, dia0 };
  }

  /* ---------- estimativa de cafeína de uma extração ---------- */
  const EFICIENCIA = { espresso: 0.8, moka: 0.85, aeropress: 0.85, 'prensa-francesa': 0.9, clever: 0.92, 'cold-brew': 0.7 };
  function estimarExtracao(g, m, dose) {
    if (!m || !dose) return 0;
    let mgPorG = 12; // arábica ~1,2 %
    if (g && g.especie === 'canephora') mgPorG = 22;
    else if (g && g.especie === 'blend') mgPorG = 15;
    if (g && g.processo === 'descafeinado') mgPorG = 0.3;
    return dose * mgPorG * (EFICIENCIA[m.id] || 0.95);
  }

  const RAPIDOS = [
    { nome: 'Espresso (cafeteria)', mg: 80, ico: '☕' }, { nome: 'Espresso duplo', mg: 150, ico: '☕' },
    { nome: 'Cafezinho de padaria', mg: 50, ico: '🥃' }, { nome: 'Coado 200 ml', mg: 140, ico: '🔻' },
    { nome: 'Cappuccino / latte', mg: 80, ico: '🥛' }, { nome: 'Café com leite 200 ml', mg: 90, ico: '🥛' },
    { nome: 'Cold brew 300 ml', mg: 200, ico: '🧊' }, { nome: 'Café solúvel (1 colher)', mg: 65, ico: '🥄' },
    { nome: 'Descafeinado', mg: 5, ico: '🌙' }, { nome: 'Chá preto 200 ml', mg: 45, ico: '🍵' },
    { nome: 'Chá verde / mate 200 ml', mg: 30, ico: '🍃' }, { nome: 'Chimarrão (cuia cheia)', mg: 85, ico: '🧉' },
    { nome: 'Refrigerante cola (lata)', mg: 35, ico: '🥤' }, { nome: 'Energético 250 ml', mg: 80, ico: '⚡' },
    { nome: 'Energético 473 ml', mg: 150, ico: '⚡' }, { nome: 'Pré-treino (dose)', mg: 200, ico: '🏋️' }
  ];

  const hhmm = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const STATUS = { ok: { ico: '✓', txt: 'Sono protegido', cls: 'ok' }, atencao: { ico: '⚠', txt: 'Pode atrapalhar o sono', cls: 'sobre' }, alto: { ico: '✕', txt: 'Deve atrapalhar o sono', cls: 'danger' } };

  function adicionar(item) {
    lista().push({ id: lab.uid(), t: item.t || new Date().toISOString(), mg: Math.round(item.mg), nome: item.nome, fonte: item.fonte || 'rapido', extracaoId: item.extracaoId || null });
    lab.save();
  }

  /* ---------- gráfico ---------- */
  function grafico(r) {
    const W = 420, Hh = 220, pl = 34, pr = 10, pt = 18, pb = 28;
    const primeira = r.doses.filter((d) => d.ts >= r.dia0).reduce((m, d) => Math.min(m, d.ts), Infinity);
    const x0 = Math.min(r.dia0 + 6 * H, isFinite(primeira) ? primeira - 0.5 * H : Infinity, r.agora - H);
    const x1 = Math.max(r.dormir + 3 * H, r.agora + 2 * H);
    const pts = [];
    for (let t = x0; t <= x1; t += 5 * 60000) pts.push([t, quantidade(t, r.par, r.doses)]);
    const maxY = Math.max(r.par.limiarSono * 2.2, ...pts.map((p) => p[1])) * 1.1;
    const step = maxY > 400 ? 100 : maxY > 160 ? 50 : 25;
    const yMax = Math.ceil(maxY / step) * step;
    const X = (t) => pl + (t - x0) / (x1 - x0) * (W - pl - pr);
    const Y = (v) => pt + (1 - v / yMax) * (Hh - pt - pb);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
    const area = `${d} L${X(x1).toFixed(1)},${Y(0)} L${X(x0).toFixed(1)},${Y(0)} Z`;
    const yTicks = []; for (let v = 0; v <= yMax; v += step) yTicks.push(v);
    const xTicks = []; const hs = new Date(x0); hs.setMinutes(0, 0, 0); const passoH = (x1 - x0) / H > 20 ? 4 : 3;
    for (let t = hs.getTime() + H; t < x1; t += H) if (new Date(t).getHours() % passoH === 0) xTicks.push(t);
    const agoraX = X(r.agora), dormirX = X(r.dormir);
    lastChart = { pts, X, Y, x0, x1, W, par: r.par };
    return `<div class="chart-box" id="cfBox"><svg class="chart" id="cfSvg" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Cafeína estimada no corpo ao longo do dia">
      <g class="grid">${yTicks.map((v) => `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${pl - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`).join('')}</g>
      ${xTicks.map((t) => `<text x="${X(t)}" y="${Hh - 10}" text-anchor="middle">${new Date(t).getHours()}h</text>`).join('')}
      <path class="area" d="${area}"/><path class="line" d="${d}"/>
      <line x1="${pl}" x2="${W - pr}" y1="${Y(r.par.limiarSono)}" y2="${Y(r.par.limiarSono)}" class="cf-limiar"/>
      <text x="${pl + 4}" y="${Y(r.par.limiarSono) - 5}" class="cf-lbl">limiar para dormir · ${r.par.limiarSono} mg</text>
      <line x1="${agoraX}" x2="${agoraX}" y1="${pt}" y2="${Y(0)}" class="cf-now"/><text x="${agoraX + 4}" y="${pt + 10}" class="cf-lbl">agora</text>
      <line x1="${dormirX}" x2="${dormirX}" y1="${pt}" y2="${Y(0)}" class="cf-bed"/><text x="${dormirX - 4}" y="${pt + 10}" class="cf-lbl" text-anchor="end">🌙 ${hhmm(r.dormir)}</text>
      <circle cx="${dormirX}" cy="${Y(r.naCama)}" r="5" class="cf-dot"/>
      ${r.doses.filter((x) => x.ts >= x0 && x.ts <= x1).map((x) => `<circle cx="${X(x.ts)}" cy="${Y(0)}" r="4.5" class="cf-dose"><title>${hhmm(x.ts)} · ${lab.esc(x.nome)} · ${x.mg} mg</title></circle>`).join('')}
      <g id="cfHover" style="display:none"><line id="cfHl" y1="${pt}" y2="${Y(0)}" class="cf-cross"/><circle id="cfHd" r="5" class="cf-dot"/></g>
      <rect x="${pl}" y="${pt}" width="${W - pl - pr}" height="${Hh - pt - pb}" fill="transparent" id="cfHit"/>
    </svg><div class="tip" id="cfTip" style="display:none"></div></div>`;
  }
  let lastChart = null;
  function bindHover(root) {
    const svg = root.querySelector('#cfSvg'); if (!svg || !lastChart) return;
    const tip = root.querySelector('#cfTip'), g = root.querySelector('#cfHover'), box = root.querySelector('#cfBox');
    const mover = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * lastChart.W;
      const c = lastChart; let best = c.pts[0], bd = Infinity;
      for (const p of c.pts) { const dd = Math.abs(c.X(p[0]) - px); if (dd < bd) { bd = dd; best = p; } }
      const x = c.X(best[0]), y = c.Y(best[1]);
      g.style.display = ''; root.querySelector('#cfHl').setAttribute('x1', x); root.querySelector('#cfHl').setAttribute('x2', x);
      root.querySelector('#cfHd').setAttribute('cx', x); root.querySelector('#cfHd').setAttribute('cy', y);
      tip.style.display = ''; tip.textContent = `${hhmm(best[0])} · ${Math.round(best[1])} mg no corpo · ${(best[1] / c.par.vd).toFixed(1).replace('.', ',')} mg/L`; window.__posicionarDica(tip, box, x / c.W * r.width, y / svg.viewBox.baseVal.height * r.height);
    };
    const sair = () => { g.style.display = 'none'; tip.style.display = 'none'; };
    const hit = root.querySelector('#cfHit');
    hit.addEventListener('pointermove', mover); hit.addEventListener('pointerdown', mover); hit.addEventListener('pointerleave', sair);
    box.addEventListener('touchmove', mover, { passive: true });
  }

  /* ---------- tela ---------- */
  lab.routes.cafeina = (view) => {
    document.getElementById('title').textContent = 'Cafeína';
    const r = resumo();
    const st = STATUS[r.status];
    const pctDia = Math.min(100, r.hoje / r.par.limite * 100);
    const hoje = r.doses.filter((d) => d.ts >= r.dia0).sort((a, b) => b.ts - a.ts);
    const p = r.p;
    const fala = window.Mascote ? window.Mascote.porCafeina(r) : null;
    view.innerHTML = `
      ${fala ? `<div style="margin-bottom:12px">${window.Mascote.card(fala.humor, fala.texto, { compacto: true })}</div>` : ''}
      <div class="stats">
        <div class="stat"><span class="lbl">Ingerido hoje</span><div class="hero-num">${r.hoje}<small style="font-size:.9rem"> mg</small></div><div class="meter"><div style="width:${pctDia}%"></div></div><small class="muted">limite ${r.par.limite} mg/dia</small></div>
        <div class="stat"><span class="lbl">No corpo agora</span><div class="hero-num">${Math.round(r.noCorpo)}<small style="font-size:.9rem"> mg</small></div><small class="muted">${(r.noCorpo / r.par.vd).toFixed(1).replace('.', ',')} mg/L no sangue</small></div>
        <div class="stat"><span class="lbl">Na hora de dormir (${hhmm(r.dormir)})</span><div class="hero-num">${Math.round(r.naCama)}<small style="font-size:.9rem"> mg</small></div><span class="badge ${st.cls === 'danger' ? 'sobre' : st.cls}">${st.ico} ${st.txt}</span></div>
        <div class="stat"><span class="lbl">Último café de 100 mg até</span><div class="hero-num">${r.ultimo ? hhmm(r.ultimo) : '—'}</div><small class="muted">${r.ultimo ? 'para dormir abaixo do limiar' : 'evite mais cafeína hoje'}</small></div>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="row between"><h3 style="margin:0">Curva estimada no corpo</h3><small class="muted">t½ ${String(r.par.t12).replace('.', ',')} h</small></div>
        ${grafico(r)}
        <small class="muted">${r.limpo ? `Abaixo do limiar de ${r.par.limiarSono} mg a partir das ${hhmm(r.limpo)}.` : ''} Pontos no eixo marcam cada dose.</small>
      </div>
      <div class="section-title"><h2>Lançamento rápido</h2></div>
      <div class="row" style="margin-bottom:8px"><label class="lbl" style="margin:0">Horário</label><input type="datetime-local" id="cfHora" value="${lab.nowLocal()}" style="max-width:220px"></div>
      <div class="quick-grid">${RAPIDOS.map((q, i) => `<button class="quick" data-i="${i}"><span class="qi">${q.ico}</span><span class="qn">${lab.esc(q.nome)}</span><span class="qm">${q.mg} mg</span></button>`).join('')}</div>
      <div class="card soft" style="margin-top:10px"><div class="form-grid">
        <label class="field"><span class="lbl">Outro (nome)</span><input type="text" id="cfNome" placeholder="ex.: café da reunião"></label>
        <label class="field"><span class="lbl">Cafeína (mg)</span><input type="number" id="cfMg" inputmode="numeric" min="1" max="1000"></label>
      </div><button class="btn sm" id="cfAdd">＋ Adicionar</button></div>
      <div class="section-title"><h2>Hoje</h2></div>
      <div class="list">${hoje.length ? hoje.map((d) => `<div class="item" style="cursor:default"><div class="ico">${d.fonte === 'extracao' ? '🧪' : '☕'}</div><div><div class="t">${lab.esc(d.nome)}</div><div class="s">${hhmm(d.ts)}${d.fonte === 'extracao' ? ' · do diário de extrações' : ''}</div></div><div class="right"><div class="score">${d.mg}</div><button class="btn sm ghost" data-del="${d.id}" aria-label="Remover">✕</button></div></div>`).join('') : '<div class="empty">Nenhuma cafeína registrada hoje.</div>'}</div>
      <details class="lib" style="margin-top:16px" ${p._configurado ? '' : 'open'}><summary>Perfil pessoal e parâmetros</summary><div class="body">
        <div class="form-grid">
          <label class="field"><span class="lbl">Peso (kg)</span><input type="number" id="pPeso" value="${p.peso}" inputmode="decimal"></label>
          <label class="field"><span class="lbl">Idade</span><input type="number" id="pIdade" value="${p.idade}" inputmode="numeric"></label>
          <label class="field"><span class="lbl">Sensibilidade à cafeína</span><select id="pSens">${Object.entries(SENS).map(([k, v]) => `<option value="${k}" ${k === p.sensibilidade ? 'selected' : ''}>${v.nome}</option>`).join('')}</select></label>
          <label class="field"><span class="lbl">Hora de dormir</span><input type="time" id="pDormir" value="${p.dormir}"></label>
          <label class="field"><span class="lbl">Meia-vida manual (h)</span><input type="number" id="pT12" value="${p.meiaVidaManual || ''}" step="0.5" placeholder="auto"></label>
          <label class="field"><span class="lbl">Registrar extrações como bebidas</span><select id="pBeb"><option value="1">Tudo</option><option value="0.5">Metade</option><option value="0.25">Um quarto</option><option value="0">Não registrar</option></select></label>
        </div>
        <label class="chk"><input type="checkbox" id="pFum" ${p.fumante ? 'checked' : ''}> Fumante</label>
        <label class="chk"><input type="checkbox" id="pAco" ${p.anticoncepcional ? 'checked' : ''}> Uso anticoncepcional oral</label>
        <label class="chk"><input type="checkbox" id="pGes" ${p.gestante ? 'checked' : ''}> Gestante</label>
        <div class="inline-actions"><button class="btn primary sm" id="pSalvar">Salvar perfil</button></div>
        <p style="margin-top:10px"><small>Meia-vida usada: <strong>${String(r.par.t12).replace('.', ',')} h</strong>${r.par.fatores.length ? ' · ' + r.par.fatores.join('; ') : ''}. Volume de distribuição ${Math.round(r.par.vd)} L. Dose única de referência ${r.par.doseUnica} mg. Limite diário ${r.par.limite} mg (referência EFSA para adultos saudáveis; 200 mg na gestação).</small></p>
        <p><small class="muted">Estimativas educativas baseadas em médias populacionais. A cafeína real varia com a genética (CYP1A2), fígado, medicamentos e o próprio grão. Não substitui orientação médica.</small></p>
      </div></details>`;
    bindHover(view);
    view.querySelector('#pBeb').value = String(lab.state().config.bebidoPadrao != null ? lab.state().config.bebidoPadrao : '1');
    const hora = () => { const v = view.querySelector('#cfHora').value; return v ? new Date(v).toISOString() : new Date().toISOString(); };
    view.querySelectorAll('.quick').forEach((b) => b.onclick = () => { const q = RAPIDOS[+b.dataset.i]; adicionar({ nome: q.nome, mg: q.mg, t: hora() }); avisoDose(q.mg); lab.render(); });
    view.querySelector('#cfAdd').onclick = () => { const mg = +view.querySelector('#cfMg').value; if (!mg) return lab.toast('Informe os mg de cafeína'); adicionar({ nome: view.querySelector('#cfNome').value.trim() || 'Outro', mg, t: hora() }); avisoDose(mg); lab.render(); };
    view.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { const s = lab.state(); s.cafeina = lista().filter((x) => x.id !== b.dataset.del); lab.save(); lab.render(); });
    view.querySelector('#pSalvar').onclick = () => {
      const q = (id) => view.querySelector(id);
      Object.assign(perfil(), { peso: +q('#pPeso').value || 70, idade: +q('#pIdade').value || 30, sensibilidade: q('#pSens').value, dormir: q('#pDormir').value || '23:00', meiaVidaManual: q('#pT12').value, fumante: q('#pFum').checked, anticoncepcional: q('#pAco').checked, gestante: q('#pGes').checked, _configurado: true });
      lab.state().config.bebidoPadrao = +q('#pBeb').value;
      lab.save(); lab.toast('Perfil salvo'); lab.render();
    };
  };
  function avisoDose(mg) {
    const par = parametros();
    if (mg > par.doseUnica) lab.toast(`Dose alta: ${mg} mg em uma vez (referência ${par.doseUnica} mg)`);
    else lab.toast(`+${mg} mg registrados`);
  }

  /* ---------- integrações ---------- */
  lab.hooks.tiles.push(() => {
    const r = resumo(); const st = STATUS[r.status];
    return `<a class="qa-tile cf-home" href="#/cafeina"><span class="qa-ico">💓</span><span class="qa-t">Cafeína: ${r.hoje} mg hoje</span><span class="qa-s">${Math.round(r.noCorpo)} mg no corpo agora</span><span class="badge ${st.cls === 'danger' ? 'sobre' : st.cls}">${st.ico} ${Math.round(r.naCama)} mg às ${hhmm(r.dormir)}</span></a>`;
  });
  lab.hooks.mais.push(() => `<div class="item" onclick="location.hash='#/cafeina'"><div class="ico">💓</div><div><div class="t">Cafeína e sono</div><div class="s">Diário de cafeína, curva no corpo e hora de dormir</div></div><div>›</div></div>`);
  lab.hooks.extracaoSalva.push((x, g, m) => {
    const frac = x.bebido != null ? +x.bebido : 1;
    if (!frac) return;
    const mg = estimarExtracao(g, m, x.dose) * frac;
    if (mg > 0) lista().push({ id: lab.uid(), t: x.data, mg: Math.round(mg), nome: `${g ? g.nome : 'Café'} · ${m.nome}`, fonte: 'extracao', extracaoId: x.id });
  });
  lab.hooks.extracaoExcluida.push((x) => { const s = lab.state(); s.cafeina = lista().filter((c) => c.extracaoId !== x.id); });
  // edição de uma extração: atualiza a cafeína ligada a ela (dose, quanto bebeu, horário)
  lab.hooks.extracaoEditada.push((x, g, m) => {
    const s = lab.state(), frac = x.bebido != null ? +x.bebido : 1;
    const mg = Math.round(estimarExtracao(g, m, x.dose) * frac);
    const item = lista().find((c) => c.extracaoId === x.id);
    if (!frac || mg <= 0) { if (item) s.cafeina = lista().filter((c) => c !== item); return; }
    const dados = { t: x.data, mg, nome: `${g ? g.nome : 'Café'} · ${m.nome}` };
    if (item) Object.assign(item, dados);
    else lista().push(Object.assign({ id: lab.uid(), fonte: 'extracao', extracaoId: x.id }, dados));
  });

  window.CafeCafeina = { estimarExtracao, resumo, parametros, quantidade, adicionar, RAPIDOS };
})();
