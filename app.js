/* =====================================================================
 * Laboratório de Cafeteria — interface (SPA sem dependências)
 * ===================================================================== */
(function () {
  'use strict';
  const DB = window.CAFE_DB, E = window.Engine;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const KEY = 'cafelab.v1';

  /* ---------------- Estado / armazenamento ---------------- */
  let state = load();
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.graos) return s; } catch (e) { /* ignore */ }
    return { graos: [], moedores: [], extracoes: [], config: { tema: 'auto', notaAlvo: 8 } };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Não foi possível salvar (armazenamento cheio ou bloqueado).'); } }
  const grao = (id) => state.graos.find((g) => g.id === id);
  const moedor = (id) => state.moedores.find((m) => m.id === id);
  const extracao = (id) => state.extracoes.find((x) => x.id === id);
  const metodo = (id) => DB.metodo[id];

  /* Histórico grão × método × moedor em ordem cronológica, com diag */
  function historico(graoId, metodoId, moedorId) {
    return state.extracoes
      .filter((x) => x.graoId === graoId && x.metodoId === metodoId && (!moedorId || x.moedorId === moedorId))
      .sort((a, b) => new Date(a.data) - new Date(b.data))
      .map(withDiag);
  }
  function withDiag(x) { const m = metodo(x.metodoId); if (m && !x.diag) x.diag = E.diagnose(x, m); return x; }

  /* ---------------- Utilidades UI ---------------- */
  let toastT;
  function toast(msg) { const t = $('#toast'); t.innerHTML = `<div class="toast">${esc(msg)}</div>`; clearTimeout(toastT); toastT = setTimeout(() => (t.innerHTML = ''), 2600); }
  function fmtData(iso) { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  function fmtDia(iso) { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR'); }
  function nowLocal() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
  function parseTempo(s) {
    s = String(s || '').trim().toLowerCase().replace(',', '.'); if (!s) return null;
    let m;
    if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h$/))) return Math.round(parseFloat(m[1]) * 3600);
    if ((m = s.match(/^(\d+)\s*[:m]\s*(\d{1,2})\s*s?$/))) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    if ((m = s.match(/^(\d+)\s*m(?:in)?$/))) return parseInt(m[1], 10) * 60;
    if ((m = s.match(/^(\d+(?:\.\d+)?)\s*s?$/))) return Math.round(parseFloat(m[1]));
    return null;
  }
  function nomeGrao(g) { return g ? g.nome : '(grão removido)'; }
  function badgeDiag(d) { return d ? `<span class="badge ${d.cor}">${esc(d.rotulo)}</span>` : ''; }
  function chipsSel(name, opts, selected, cls) {
    return `<div class="chips" data-chips="${name}">${opts.map((o) => {
      const id = typeof o === 'string' ? o : o.id, lbl = typeof o === 'string' ? o : o.nome, extra = typeof o === 'string' ? '' : (o.tipo || '');
      return `<button type="button" class="chip ${extra} ${selected.includes(id) ? 'on' : ''} ${cls || ''}" data-v="${esc(id)}" title="${esc(typeof o === 'string' ? '' : o.dica || '')}">${esc(lbl)}</button>`;
    }).join('')}</div>`;
  }
  function chipsVal(root, name) { return $$(`[data-chips="${name}"] .chip.on`, root).map((c) => c.dataset.v); }
  function bindChips(root) { root.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c && !c.classList.contains('static')) { c.classList.toggle('on'); c.dispatchEvent(new CustomEvent('chipchange', { bubbles: true })); } }); }
  function sel(name, opts, val, attrs) { return `<select name="${name}" ${attrs || ''}>${opts.map((o) => `<option value="${esc(o.id)}" ${o.id === val ? 'selected' : ''}>${esc(o.nome)}</option>`).join('')}</select>`; }
  function range(name, lbl, val, min, max, step) { return `<div class="range-row"><span class="lbl">${lbl}</span><input type="range" name="${name}" min="${min}" max="${max}" step="${step || 1}" value="${val}" oninput="this.nextElementSibling.value=this.value"><output>${val}</output></div>`; }
  function confirmar(msg) { return window.confirm(msg); }

  /* ---------------- Modal ---------------- */
  function modal(html, onMount) {
    const m = $('#modal');
    m.innerHTML = `<div class="modal-bg"><div class="sheet" role="dialog" aria-modal="true"><div class="handle"></div>${html}</div></div>`;
    m.querySelector('.modal-bg').addEventListener('click', (e) => { if (e.target.classList.contains('modal-bg')) closeModal(); });
    $$('[data-close]', m).forEach((b) => b.addEventListener('click', closeModal));
    bindChips(m);
    if (onMount) onMount(m.querySelector('.sheet'));
    document.body.style.overflow = 'hidden';
  }
  function closeModal() { $('#modal').innerHTML = ''; document.body.style.overflow = ''; }

  /* ---------------- Router ---------------- */
  const routes = {};
  let histStack = [];
  function go(hash) { location.hash = hash; }
  function parseRoute() {
    const h = location.hash.replace(/^#\/?/, '') || 'inicio';
    const [path, qs] = h.split('?');
    const parts = path.split('/');
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    return { name: parts[0], id: parts[1], q };
  }
  function render() {
    const r = parseRoute();
    const fn = routes[r.name] || routes.inicio;
    const view = $('#view');
    closeModal();
    view.innerHTML = '';
    const top = ['inicio', 'diario', 'nova', 'graos', 'mais'].includes(r.name) && !r.id;
    $('#btnBack').hidden = top;
    $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.route === r.name || (r.name === 'grao' && a.dataset.route === 'graos') || (r.name === 'extracao' && a.dataset.route === 'diario') || (['moedores', 'biblioteca', 'ajustes'].includes(r.name) && a.dataset.route === 'mais')));
    fn(view, r);
    bindChips(view);
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', render);
  $('#btnBack').addEventListener('click', () => { if (history.length > 1) history.back(); else go('#/inicio'); });

  /* ---------------- Tema ---------------- */
  function applyTheme() {
    const t = state.config.tema || 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  }
  $('#btnTheme').addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    state.config.tema = order[(order.indexOf(state.config.tema || 'auto') + 1) % 3];
    save(); applyTheme(); toast(`Tema: ${{ auto: 'automático', light: 'claro', dark: 'escuro' }[state.config.tema]}`);
  });

  /* ======================= INÍCIO ======================= */
  routes.inicio = (view) => {
    $('#title').textContent = 'Laboratório de Cafeteria';
    const ultimas = state.extracoes.slice().sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5).map(withDiag);
    const graosAtivos = state.graos.filter((g) => !g.arquivado);
    const calibs = graosAtivos.map((g) => {
      const porMetodo = {};
      state.extracoes.filter((x) => x.graoId === g.id).forEach((x) => { (porMetodo[x.metodoId] = porMetodo[x.metodoId] || []).push(x); });
      const cal = Object.entries(porMetodo).map(([mid, xs]) => ({ mid, ...E.calibration(xs.sort((a, b) => new Date(a.data) - new Date(b.data)).map(withDiag)) }));
      return { g, cal };
    });
    const total = state.extracoes.length;
    const calibradas = calibs.reduce((n, c) => n + c.cal.filter((x) => x.status === 'calibrado').length, 0);
    const medias = calibs.flatMap((c) => c.cal).filter((c) => c.tentativasAteCalibrar).map((c) => c.tentativasAteCalibrar);
    const mediaTent = medias.length ? (medias.reduce((a, b) => a + b, 0) / medias.length).toFixed(1) : '—';

    view.innerHTML = `
      <div class="stats">
        <div class="stat"><span class="lbl">Extrações</span><div class="hero-num">${total}</div></div>
        <div class="stat"><span class="lbl">Grãos ativos</span><div class="hero-num">${graosAtivos.length}</div></div>
        <div class="stat"><span class="lbl">Receitas calibradas</span><div class="hero-num">${calibradas}</div></div>
        <div class="stat"><span class="lbl">Tentativas até calibrar</span><div class="hero-num">${mediaTent}</div></div>
      </div>
      <div class="row" style="margin-top:14px">
        <a class="btn primary" href="#/nova">＋ Nova extração</a>
        <a class="btn" href="#/graos?novo=1">Cadastrar grão</a>
        ${state.moedores.length ? '' : '<a class="btn" href="#/moedores?novo=1">Cadastrar moedor</a>'}
      </div>
      ${!state.graos.length ? `<div class="card soft" style="margin-top:16px"><h3>Como começar</h3><ol style="margin:0;padding-left:18px;color:var(--text-2)"><li>Cadastre seu <a href="#/moedores?novo=1">moedor</a> (escala de cliques).</li><li>Cadastre o <a href="#/graos?novo=1">grão</a> com região, processo e torra — o app sugere a receita de partida.</li><li>Registre a extração com a nota de xícara e os sinais que percebeu; o motor calcula o ajuste para a próxima.</li></ol></div>` : ''}
      <div class="section-title"><h2>Calibração em andamento</h2></div>
      ${calibs.length ? `<div class="grid">${calibs.map(({ g, cal }) => `
        <div class="card clickable" onclick="location.hash='#/grao/${g.id}'">
          <div class="row between"><h3>${esc(g.nome)}</h3>${cal.some((c) => c.status === 'calibrado') ? '<span class="badge ok">✓ calibrado</span>' : cal.length ? '<span class="badge accent">ajustando</span>' : '<span class="badge">novo</span>'}</div>
          <small>${esc((DB.regiao[g.regiao] || {}).nome || '')} · ${esc((DB.processo[g.processo] || {}).nome.split(' (')[0] || '')} · torra ${esc((DB.torra[g.torra] || {}).nome || '').toLowerCase()}</small>
          ${cal.length ? `<div class="chips" style="margin-top:8px">${cal.map((c) => `<span class="chip static ${c.status === 'calibrado' ? 'on' : ''}">${esc(metodo(c.mid).nome)} · ${c.tentativas}×${c.melhor && c.melhor.nota ? ` · melhor ${c.melhor.nota}` : ''}</span>`).join('')}</div>` : '<small class="muted">Nenhuma extração ainda.</small>'}
        </div>`).join('')}</div>` : '<div class="empty"><div class="big">🫘</div>Nenhum grão cadastrado.</div>'}
      <div class="section-title"><h2>Últimas extrações</h2><a href="#/diario">ver todas</a></div>
      ${ultimas.length ? `<div class="list">${ultimas.map(itemExtracao).join('')}</div>` : '<div class="empty"><div class="big">📓</div>O diário está vazio.</div>'}
    `;
  };

  function itemExtracao(x) {
    const g = grao(x.graoId), m = metodo(x.metodoId);
    return `<div class="item" onclick="location.hash='#/extracao/${x.id}'">
      <div class="ico">${m ? m.icone : '☕'}</div>
      <div><div class="t">${esc(nomeGrao(g))} <small class="muted">· ${esc(m ? m.nome : '')}</small></div>
        <div class="s">${fmtData(x.data)} · ${x.clicks != null ? E.fmtClicks(x.clicks) + ' cl · ' : ''}${x.dose} g · 1:${x.ratio} · ${x.tempC} °C · ${E.fmtTempo(x.tempoS)}</div>
        <div style="margin-top:4px">${badgeDiag(x.diag)}</div></div>
      <div class="right"><div class="score">${x.nota != null && x.nota !== '' ? Number(x.nota).toFixed(1) : '—'}</div><small>nota</small></div>
    </div>`;
  }

  /* ======================= DIÁRIO ======================= */
  routes.diario = (view, r) => {
    $('#title').textContent = 'Diário de extrações';
    const fg = r.q.grao || '', fm = r.q.metodo || '';
    let xs = state.extracoes.slice().map(withDiag);
    if (fg) xs = xs.filter((x) => x.graoId === fg);
    if (fm) xs = xs.filter((x) => x.metodoId === fm);
    xs.sort((a, b) => new Date(b.data) - new Date(a.data));
    view.innerHTML = `
      <div class="row">
        <select id="fGrao" style="flex:1;min-width:140px"><option value="">Todos os grãos</option>${state.graos.map((g) => `<option value="${g.id}" ${g.id === fg ? 'selected' : ''}>${esc(g.nome)}</option>`).join('')}</select>
        <select id="fMet" style="flex:1;min-width:140px"><option value="">Todos os métodos</option>${DB.metodos.map((m) => `<option value="${m.id}" ${m.id === fm ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select>
      </div>
      <div class="list" style="margin-top:12px">${xs.length ? xs.map(itemExtracao).join('') : '<div class="empty"><div class="big">📓</div>Nenhuma extração com esse filtro.</div>'}</div>`;
    const upd = () => go(`#/diario?grao=${$('#fGrao').value}&metodo=${$('#fMet').value}`);
    $('#fGrao').onchange = upd; $('#fMet').onchange = upd;
  };

  /* ======================= DETALHE DA EXTRAÇÃO ======================= */
  routes.extracao = (view, r) => {
    const x = extracao(r.id); if (!x) { view.innerHTML = '<div class="empty">Extração não encontrada.</div>'; return; }
    withDiag(x);
    const g = grao(x.graoId), m = metodo(x.metodoId), md = moedor(x.moedorId);
    $('#title').textContent = 'Extração';
    const hist = historico(x.graoId, x.metodoId, x.moedorId);
    const idx = hist.findIndex((h) => h.id === x.id);
    const antes = hist.slice(0, Math.max(0, idx));
    const reco = E.recommend(x, antes, m, md, g || {});
    view.innerHTML = `
      <div class="card">
        <div class="row between"><div><h2>${esc(nomeGrao(g))}</h2><small>${m.icone} ${esc(m.nome)} · ${md ? esc(md.nome) : 'sem moedor'} · ${fmtData(x.data)}</small></div>
          <div class="right"><div class="hero-num">${x.nota !== '' && x.nota != null ? Number(x.nota).toFixed(1) : '—'}</div><small>nota</small></div></div>
        <div class="kv" style="margin-top:10px">
          ${x.clicks != null ? `<div><span class="lbl">Moagem</span><div class="v">${E.fmtClicks(x.clicks)} cl</div></div>` : ''}
          <div><span class="lbl">Dose</span><div class="v">${x.dose} g</div></div>
          <div><span class="lbl">${E.isEspresso(m) ? 'Bebida' : 'Água'}</span><div class="v">${x.water} g</div></div>
          <div><span class="lbl">Razão</span><div class="v">1:${x.ratio}</div></div>
          <div><span class="lbl">Temperatura</span><div class="v">${x.tempC} °C</div></div>
          <div><span class="lbl">Tempo</span><div class="v">${E.fmtTempo(x.tempoS)}</div></div>
          ${x.tds ? `<div><span class="lbl">TDS / EY</span><div class="v">${x.tds} % / ${x.diag.ey != null ? x.diag.ey + ' %' : '—'}</div></div>` : ''}
        </div>
        ${x.descritores && x.descritores.length ? `<div class="chips" style="margin-top:10px">${x.descritores.map((d) => `<span class="chip static">${esc(d)}</span>`).join('')}</div>` : ''}
        ${x.obs ? `<p class="text-2" style="margin-top:10px">${esc(x.obs)}</p>` : ''}
      </div>

      <div class="card" style="margin-top:12px">
        <h3>Diagnóstico ${badgeDiag(x.diag)}</h3>
        ${barraExtracao(x.diag)}
        ${radar([{ nome: 'Esta extração', v: sens(x), cls: 'a' }])}
        ${x.diag.fatores.length ? `<ul class="factors">${x.diag.fatores.map((f) => `<li>${f.v < 0 ? '🔵' : f.v > 0 ? '🟠' : '⚪'} ${esc(f.t)}${f.forca ? ` (força ${f.forca > 0 ? '↑' : '↓'})` : ''}</li>`).join('')}</ul>` : '<small class="muted">Nenhum sinal de desequilíbrio registrado.</small>'}
      </div>

      ${cardReco(reco, m, x)}

      <div class="row" style="margin-top:12px">
        <button class="btn danger sm" id="del">Excluir</button>
        <button class="btn sm" id="dup">Duplicar como nova</button>
      </div>`;
    $('#del').onclick = () => { if (confirmar('Excluir esta extração?')) { state.extracoes = state.extracoes.filter((e) => e.id !== x.id); save(); toast('Excluída'); go('#/diario'); } };
    $('#dup').onclick = () => go(`#/nova?from=${x.id}&copiar=1`);
  };

  function sens(x) { return { acidez: +x.acidez || 3, docura: +x.docura || 3, amargor: +x.amargor || 3, corpo: +x.corpo || 3, final: +x.final || 3 }; }
  function barraExtracao(d) {
    const pct = 50 + d.indice * 45;
    return `<div class="bar" title="Índice de extração ${d.indice}"><div class="pin" style="left:${pct}%"></div></div><div class="bar-lbl"><span>sub-extração</span><span>equilíbrio</span><span>sobre-extração</span></div>`;
  }
  function cardReco(reco, m, x) {
    const icons = { moagem: '⚙️', temperatura: '🌡️', razão: '⚖️', técnica: '🖐️', nota: 'ℹ️', ok: '✅' };
    const p = reco.prox;
    return `<div class="card reco ${reco.status === 'calibrado' ? 'ok' : reco.diag.cor}" style="margin-top:12px">
      <div class="row between"><h3>Próxima extração</h3><span class="badge ${reco.status === 'calibrado' ? 'ok' : 'accent'}">${reco.status === 'calibrado' ? 'calibrado' : 'ajustando'} · confiança ${Math.round(reco.confianca * 100)} %</span></div>
      ${reco.acoes.map((a) => `<div class="acao"><div class="k">${icons[a.alvo] || '•'}</div><div>${esc(a.txt)}</div></div>`).join('')}
      <div class="kv" style="margin-top:10px">
        ${p.clicks != null ? `<div><span class="lbl">Moagem</span><div class="v">${E.fmtClicks(p.clicks)} cl</div></div>` : ''}
        <div><span class="lbl">Dose</span><div class="v">${p.dose} g</div></div>
        <div><span class="lbl">${E.isEspresso(m) ? 'Bebida' : 'Água'}</span><div class="v">${p.water} g</div></div>
        <div><span class="lbl">Razão</span><div class="v">1:${p.ratio}</div></div>
        ${m.id !== 'cold-brew' ? `<div><span class="lbl">Temperatura</span><div class="v">${p.tempC} °C</div></div>` : ''}
        <div><span class="lbl">Tempo alvo</span><div class="v">${E.fmtTempo(m.tempoS.min)}–${E.fmtTempo(m.tempoS.max)}</div></div>
      </div>
      ${x ? `<div class="inline-actions"><a class="btn primary" href="#/nova?from=${x.id}">Preparar com esta receita →</a></div>` : ''}
    </div>`;
  }

  /* ======================= NOVA EXTRAÇÃO ======================= */
  routes.nova = (view, r) => {
    $('#title').textContent = 'Nova extração';
    if (!state.graos.length) { view.innerHTML = `<div class="empty"><div class="big">🫘</div>Cadastre um grão antes de registrar extrações.<div style="margin-top:12px"><a class="btn primary" href="#/graos?novo=1">Cadastrar grão</a></div></div>`; return; }
    const from = r.q.from ? extracao(r.q.from) : null;
    const copiar = !!r.q.copiar;
    const pre = {
      graoId: (from && from.graoId) || r.q.grao || state.graos[0].id,
      metodoId: (from && from.metodoId) || r.q.metodo || 'v60',
      moedorId: (from && from.moedorId) || r.q.moedor || (state.moedores[0] || {}).id || ''
    };
    view.innerHTML = `
      <form id="fNova" autocomplete="off">
        <div class="card">
          <div class="form-grid">
            <label class="field"><span class="lbl">Grão</span>${sel('graoId', state.graos.filter((g) => !g.arquivado || g.id === pre.graoId).map((g) => ({ id: g.id, nome: g.nome })), pre.graoId)}</label>
            <label class="field"><span class="lbl">Método</span>${sel('metodoId', DB.metodos.map((m) => ({ id: m.id, nome: `${m.icone} ${m.nome}` })), pre.metodoId)}</label>
            <label class="field"><span class="lbl">Moedor</span>${sel('moedorId', [{ id: '', nome: '— sem moedor —' }].concat(state.moedores.map((m) => ({ id: m.id, nome: m.nome }))), pre.moedorId)}</label>
            <label class="field"><span class="lbl">Data e hora</span><input type="datetime-local" name="data" value="${nowLocal()}"></label>
          </div>
        </div>
        <div id="sugestao"></div>
        <div class="card" style="margin-top:12px">
          <h3>Receita executada</h3>
          <div class="form-grid">
            <label class="field"><span class="lbl">Moagem (cliques)</span><input type="number" name="clicks" inputmode="decimal" step="any"><div class="help" id="hClicks"></div></label>
            <label class="field"><span class="lbl">Dose (g)</span><input type="number" name="dose" inputmode="decimal" step="0.1" required></label>
            <label class="field"><span class="lbl" id="lWater">Água (g)</span><input type="number" name="water" inputmode="decimal" step="0.1" required></label>
            <label class="field"><span class="lbl">Razão (1:x)</span><input type="number" name="ratio" inputmode="decimal" step="0.01"><div class="help">Editar recalcula a água.</div></label>
            <label class="field"><span class="lbl">Temperatura (°C)</span><input type="number" name="tempC" inputmode="decimal" step="0.5" required></label>
            <label class="field"><span class="lbl">Tempo de contato</span><input type="text" name="tempo" inputmode="numeric" placeholder="2:45 · 28 · 14h"><div class="help" id="hTempo"></div></label>
            <label class="field"><span class="lbl">TDS % (opcional)</span><input type="number" name="tds" inputmode="decimal" step="0.01" placeholder="refratômetro"></label>
          </div>
        </div>
        <div class="card" style="margin-top:12px">
          <h3>Xícara</h3>
          ${range('acidez', 'Acidez', 3, 1, 5)}
          ${range('docura', 'Doçura', 3, 1, 5)}
          ${range('amargor', 'Amargor', 3, 1, 5)}
          ${range('corpo', 'Corpo', 3, 1, 5)}
          ${range('final', 'Finalização', 3, 1, 5)}
          <div class="lbl" style="margin-top:8px">Sinais percebidos</div>
          ${chipsSel('sinais', DB.sinais, [])}
          <div class="lbl" style="margin-top:12px">Descritores</div>
          ${chipsSel('descritores', DB.descritores, [])}
          <div class="range-row" style="margin-top:12px"><span class="lbl">Nota (0–10)</span><input type="range" name="nota" min="0" max="10" step="0.5" value="7" oninput="this.nextElementSibling.value=this.value"><output>7</output></div>
          <label class="field"><span class="lbl">Observações</span><textarea name="obs" placeholder="bloom, despejos, canal, água usada…"></textarea></label>
        </div>
        <div class="row" style="margin-top:14px"><button class="btn primary block" type="submit">Salvar e diagnosticar</button></div>
      </form>`;
    const f = $('#fNova');
    const F = (n) => f.elements[n];

    function ctx() { return { g: grao(F('graoId').value), m: metodo(F('metodoId').value), md: moedor(F('moedorId').value) }; }
    function aplicarReceita(p) {
      if (p.clicks != null && F('moedorId').value) F('clicks').value = p.clicks;
      F('dose').value = p.dose; F('ratio').value = p.ratio; F('water').value = p.water; F('tempC').value = p.tempC;
      if (p.tempoS && !F('tempo').value) F('tempo').value = E.fmtTempo(p.tempoS).replace(' s', '').replace(' h', 'h');
    }
    function renderSugestao() {
      const { g, m, md } = ctx();
      $('#lWater').textContent = E.isEspresso(m) ? 'Bebida na xícara (g)' : 'Água (g)';
      $('#hTempo').textContent = `Faixa do método: ${E.fmtTempo(m.tempoS.min)}–${E.fmtTempo(m.tempoS.max)}`;
      if (md) { F('clicks').min = md.min; F('clicks').max = md.max; F('clicks').step = md.passo || 1; $('#hClicks').textContent = `${md.nome}: ${md.min}–${md.max}, passo ${md.passo || 1} (${md.direcao === 'maior=fino' ? 'maior = mais fino' : 'menor = mais fino'})`; }
      else $('#hClicks').textContent = 'Cadastre um moedor para receber cliques exatos.';
      const hist = historico(g.id, m.id, md ? md.id : '');
      let html, receita;
      if (hist.length) {
        const ult = hist[hist.length - 1];
        const reco = E.recommend(ult, hist.slice(0, -1), m, md, g);
        receita = reco.prox;
        html = `<div class="card reco ${reco.status === 'calibrado' ? 'ok' : reco.diag.cor}" style="margin-top:12px">
          <div class="row between"><h3>Recomendação (${hist.length} extração(ões) anteriores)</h3><span class="badge ${reco.status === 'calibrado' ? 'ok' : 'accent'}">${reco.status}</span></div>
          <small>Última: ${fmtData(ult.data)} · nota ${ult.nota || '—'} · ${esc(ult.diag.rotulo)}</small>
          ${reco.acoes.map((a) => `<div class="acao"><div class="k">•</div><div>${esc(a.txt)}</div></div>`).join('')}
          <div class="inline-actions"><button class="btn primary sm" type="button" id="usar">Usar esta receita</button><a class="btn sm" href="#/extracao/${ult.id}">Ver última</a></div>
        </div>`;
      } else {
        const sp = E.startingPoint(g, m, md);
        receita = sp;
        html = `<div class="card reco" style="margin-top:12px">
          <div class="row between"><h3>Ponto de partida sugerido</h3><span class="badge accent">1ª extração</span></div>
          <div class="kv">
            ${sp.clicks != null ? `<div><span class="lbl">Moagem</span><div class="v">${E.fmtClicks(sp.clicks)} cl</div></div>` : ''}
            <div><span class="lbl">Dose</span><div class="v">${sp.dose} g</div></div>
            <div><span class="lbl">${E.isEspresso(m) ? 'Bebida' : 'Água'}</span><div class="v">${sp.water} g</div></div>
            <div><span class="lbl">Razão</span><div class="v">1:${sp.ratio}</div></div>
            <div><span class="lbl">Temp.</span><div class="v">${sp.tempC} °C</div></div>
            <div><span class="lbl">Tempo alvo</span><div class="v">${E.fmtTempo(m.tempoS.min)}–${E.fmtTempo(m.tempoS.max)}</div></div>
          </div>
          <ul class="factors" style="margin:8px 0 0;padding-left:18px">${sp.por.map((p) => `<li>${esc(p)}</li>`).join('')}<li>${esc(m.receita)}</li></ul>
          <div class="inline-actions"><button class="btn primary sm" type="button" id="usar">Usar esta receita</button></div>
        </div>`;
      }
      $('#sugestao').innerHTML = html;
      $('#usar').onclick = () => { aplicarReceita(receita); toast('Receita aplicada aos campos'); };
      return receita;
    }
    ['graoId', 'metodoId', 'moedorId'].forEach((n) => F(n).addEventListener('change', () => { const rec = renderSugestao(); if (!F('dose').value) aplicarReceita(rec); }));
    F('ratio').addEventListener('input', () => { const d = +F('dose').value, rt = +F('ratio').value; if (d && rt) F('water').value = E.isEspresso(ctx().m) ? Math.round(d * rt * 10) / 10 : Math.round(d * rt); });
    const recalcRatio = () => { const d = +F('dose').value, w = +F('water').value; if (d && w) F('ratio').value = Math.round((w / d) * 100) / 100; };
    F('dose').addEventListener('input', recalcRatio); F('water').addEventListener('input', recalcRatio);

    const rec0 = renderSugestao();
    if (from) {
      if (copiar) {
        aplicarReceita({ clicks: from.clicks, dose: from.dose, ratio: from.ratio, water: from.water, tempC: from.tempC, tempoS: from.tempoS });
        ['acidez', 'docura', 'amargor', 'corpo', 'final'].forEach((k) => { if (from[k]) { F(k).value = from[k]; F(k).nextElementSibling.value = from[k]; } });
        F('nota').value = from.nota || 7; F('nota').nextElementSibling.value = F('nota').value;
        (from.sinais || []).forEach((s) => { const c = $(`[data-chips="sinais"] .chip[data-v="${s}"]`, f); if (c) c.classList.add('on'); });
        (from.descritores || []).forEach((s) => { const c = $(`[data-chips="descritores"] .chip[data-v="${s}"]`, f); if (c) c.classList.add('on'); });
        F('obs').value = from.obs || '';
      } else {
        aplicarReceita(rec0); F('tempo').value = '';
      }
    } else aplicarReceita(rec0);

    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const { g, m, md } = ctx();
      const tempoS = parseTempo(F('tempo').value);
      if (F('tempo').value && tempoS == null) { toast('Tempo inválido. Use 2:45, 28 ou 14h.'); F('tempo').focus(); return; }
      const dt = F('data').value ? new Date(F('data').value).toISOString() : new Date().toISOString();
      const x = {
        id: uid(), data: dt, graoId: g.id, metodoId: m.id, moedorId: md ? md.id : '',
        clicks: F('clicks').value === '' ? null : +F('clicks').value,
        dose: +F('dose').value, water: +F('water').value, ratio: +F('ratio').value || Math.round((+F('water').value / +F('dose').value) * 100) / 100,
        tempC: +F('tempC').value, tempoS: tempoS, tds: F('tds').value ? +F('tds').value : null,
        acidez: +F('acidez').value, docura: +F('docura').value, amargor: +F('amargor').value, corpo: +F('corpo').value, final: +F('final').value,
        sinais: chipsVal(f, 'sinais'), descritores: chipsVal(f, 'descritores'), nota: +F('nota').value, obs: F('obs').value.trim()
      };
      if (E.isEspresso(m)) x.yieldG = x.water;
      x.diag = E.diagnose(x, m);
      state.extracoes.push(x); save();
      toast('Extração registrada');
      go(`#/extracao/${x.id}`);
    });
  };

  /* ======================= GRÃOS ======================= */
  routes.graos = (view, r) => {
    $('#title').textContent = 'Grãos';
    const gs = state.graos.slice().sort((a, b) => (a.arquivado === b.arquivado ? 0 : a.arquivado ? 1 : -1));
    view.innerHTML = `
      <div class="row between"><h2 style="margin:0">Seus grãos</h2><button class="btn primary sm" id="novo">＋ Novo grão</button></div>
      <div class="list" style="margin-top:12px">${gs.length ? gs.map((g) => {
        const n = state.extracoes.filter((x) => x.graoId === g.id).length;
        return `<div class="item" onclick="location.hash='#/grao/${g.id}'"><div class="ico">🫘</div>
          <div><div class="t">${esc(g.nome)} ${g.arquivado ? '<span class="badge">arquivado</span>' : ''}</div><div class="s">${esc((DB.regiao[g.regiao] || {}).nome || '')} · ${esc(((DB.processo[g.processo] || {}).nome || '').split(' (')[0])} · torra ${esc(((DB.torra[g.torra] || {}).nome || '').toLowerCase())}${g.dataTorra ? ' · torrado em ' + fmtDia(g.dataTorra) : ''}</div></div>
          <div class="right"><div class="score">${n}</div><small>extr.</small></div></div>`;
      }).join('') : '<div class="empty"><div class="big">🫘</div>Nenhum grão cadastrado.</div>'}</div>`;
    $('#novo').onclick = () => formGrao();
    if (r.q.novo) { history.replaceState(null, '', '#/graos'); formGrao(); }
  };

  function formGrao(g) {
    g = g || { regiao: 'sul-de-minas', processo: 'natural', torra: 'media-clara', especie: 'arabica', notas: [] };
    const isNew = !g.id;
    modal(`
      <div class="sheet-head"><h2>${isNew ? 'Novo grão' : 'Editar grão'}</h2><button class="btn sm ghost" data-close>✕</button></div>
      <form id="fGrao">
        <div class="form-grid">
          <label class="field full"><span class="lbl">Nome / lote *</span><input type="text" name="nome" value="${esc(g.nome || '')}" required placeholder="Ex.: Fazenda Santa Inês — Bourbon Amarelo"></label>
          <label class="field"><span class="lbl">Produtor / fazenda</span><input type="text" name="produtor" value="${esc(g.produtor || '')}"></label>
          <label class="field"><span class="lbl">Torrefação</span><input type="text" name="torrefacao" value="${esc(g.torrefacao || '')}"></label>
          <label class="field"><span class="lbl">Região (terroir)</span>${sel('regiao', DB.regioes.map((x) => ({ id: x.id, nome: `${x.nome} (${x.uf})` })), g.regiao)}</label>
          <label class="field"><span class="lbl">Variedade</span><input type="text" name="variedade" value="${esc(g.variedade || '')}" list="dlVar"><datalist id="dlVar"></datalist></label>
          <label class="field"><span class="lbl">Processo</span>${sel('processo', DB.processos.map((x) => ({ id: x.id, nome: x.nome })), g.processo)}</label>
          <label class="field"><span class="lbl">Torra</span>${sel('torra', DB.torras.map((x) => ({ id: x.id, nome: `${x.nome} (Agtron ${x.agtron})` })), g.torra)}</label>
          <label class="field"><span class="lbl">Espécie</span>${sel('especie', [{ id: 'arabica', nome: 'Arábica' }, { id: 'canephora', nome: 'Canephora (conilon/robusta)' }, { id: 'blend', nome: 'Blend' }], g.especie)}</label>
          <label class="field"><span class="lbl">Data da torra</span><input type="date" name="dataTorra" value="${esc(g.dataTorra || '')}"></label>
          <label class="field"><span class="lbl">Altitude (m)</span><input type="number" name="altitude" value="${esc(g.altitude || '')}" inputmode="numeric"></label>
          <label class="field"><span class="lbl">Dose padrão (g, opcional)</span><input type="number" name="dosePadrao" value="${esc(g.dosePadrao || '')}" inputmode="decimal" step="0.1"></label>
        </div>
        <div class="card soft" id="perfilRegiao" style="margin:4px 0 12px"></div>
        <div class="lbl">Perfil sensorial esperado (1–5)</div>
        ${range('acidez', 'Acidez', g.acidez || 3, 1, 5)}
        ${range('corpo', 'Corpo', g.corpo || 3, 1, 5)}
        ${range('docura', 'Doçura', g.docura || 4, 1, 5)}
        <div class="lbl" style="margin-top:8px">Notas do rótulo / perfil</div>
        ${chipsSel('notas', DB.descritores, g.notas || [])}
        <label class="field" style="margin-top:12px"><span class="lbl">Observações</span><textarea name="obs">${esc(g.obs || '')}</textarea></label>
        <div class="sheet-foot">${isNew ? '' : '<button type="button" class="btn danger" id="delGrao">Excluir</button>'}<button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
      </form>`, (sheet) => {
      const f = $('#fGrao', sheet);
      const F = (n) => f.elements[n];
      function perfil() {
        const reg = DB.regiao[F('regiao').value];
        $('#perfilRegiao', sheet).innerHTML = `<strong>${esc(reg.nome)}</strong> · ${reg.altitude[0]}–${reg.altitude[1]} m<br><small>${esc(reg.perfil)}</small><br><small class="muted">Métodos indicados: ${reg.metodos.map((m) => metodo(m).nome).join(', ')}</small>`;
        $('#dlVar', sheet).innerHTML = reg.variedades.map((v) => `<option value="${esc(v)}">`).join('');
        if (reg.id === 'conilon-capixaba' || reg.id === 'rondonia') F('especie').value = 'canephora';
      }
      F('regiao').addEventListener('change', () => {
        perfil();
        const reg = DB.regiao[F('regiao').value];
        ['acidez', 'corpo', 'docura'].forEach((k) => { F(k).value = reg[k]; F(k).nextElementSibling.value = reg[k]; });
        $$('[data-chips="notas"] .chip', sheet).forEach((c) => c.classList.toggle('on', reg.notas.includes(c.dataset.v)));
      });
      perfil();
      if (isNew) { const reg = DB.regiao[g.regiao]; $$('[data-chips="notas"] .chip', sheet).forEach((c) => c.classList.toggle('on', reg.notas.includes(c.dataset.v))); ['acidez', 'corpo', 'docura'].forEach((k) => { F(k).value = reg[k]; F(k).nextElementSibling.value = reg[k]; }); }
      const del = $('#delGrao', sheet);
      if (del) del.onclick = () => { if (confirmar('Excluir o grão e TODAS as suas extrações?')) { state.graos = state.graos.filter((x) => x.id !== g.id); state.extracoes = state.extracoes.filter((x) => x.graoId !== g.id); save(); closeModal(); toast('Grão excluído'); go('#/graos'); } };
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const o = { ...g, id: g.id || uid(), nome: F('nome').value.trim(), produtor: F('produtor').value.trim(), torrefacao: F('torrefacao').value.trim(), regiao: F('regiao').value, variedade: F('variedade').value.trim(), processo: F('processo').value, torra: F('torra').value, especie: F('especie').value, dataTorra: F('dataTorra').value, altitude: F('altitude').value ? +F('altitude').value : null, dosePadrao: F('dosePadrao').value ? +F('dosePadrao').value : null, acidez: +F('acidez').value, corpo: +F('corpo').value, docura: +F('docura').value, notas: chipsVal(sheet, 'notas'), obs: F('obs').value.trim(), criadoEm: g.criadoEm || new Date().toISOString() };
        if (isNew) state.graos.push(o); else Object.assign(g, o);
        save(); closeModal(); toast(isNew ? 'Grão cadastrado' : 'Grão atualizado');
        if (isNew) go(`#/grao/${o.id}`); else render();
      });
    });
  }

  /* ======================= DETALHE DO GRÃO ======================= */
  routes.grao = (view, r) => {
    const g = grao(r.id); if (!g) { view.innerHTML = '<div class="empty">Grão não encontrado.</div>'; return; }
    $('#title').textContent = g.nome;
    const reg = DB.regiao[g.regiao] || DB.regiao.outra, proc = DB.processo[g.processo], tor = DB.torra[g.torra];
    const xs = state.extracoes.filter((x) => x.graoId === g.id).sort((a, b) => new Date(a.data) - new Date(b.data)).map(withDiag);
    const metodosUsados = [...new Set(xs.map((x) => x.metodoId))];
    const mSel = r.q.metodo && metodosUsados.includes(r.q.metodo) ? r.q.metodo : metodosUsados[0];
    const xsM = xs.filter((x) => x.metodoId === mSel);
    const cal = E.calibration(xsM);
    const melhor = cal.melhor, ultimo = xsM[xsM.length - 1];
    const sugeridos = reg.metodos.map((id) => metodo(id));
    view.innerHTML = `
      <div class="card">
        <div class="row between"><div><h2>${esc(g.nome)}</h2><small>${esc(g.produtor || '')}${g.produtor && g.torrefacao ? ' · ' : ''}${esc(g.torrefacao || '')}</small></div><button class="btn sm" id="edit">Editar</button></div>
        <div class="chips" style="margin-top:8px">
          <span class="chip static">📍 ${esc(reg.nome)}</span><span class="chip static">${esc(proc ? proc.nome.split(' (')[0] : '')}</span><span class="chip static">🔥 ${esc(tor ? tor.nome : '')}</span>
          ${g.variedade ? `<span class="chip static">🌱 ${esc(g.variedade)}</span>` : ''}${g.dataTorra ? `<span class="chip static">📅 ${fmtDia(g.dataTorra)} (${Math.floor((Date.now() - new Date(g.dataTorra)) / 86400000)} d)</span>` : ''}
        </div>
        ${g.notas && g.notas.length ? `<p class="text-2" style="margin:8px 0 0"><small>${g.notas.map(esc).join(' · ')}</small></p>` : ''}
        <p class="text-2" style="margin:8px 0 0"><small>${esc(reg.dica)}</small></p>
        <div class="inline-actions"><a class="btn primary" href="#/nova?grao=${g.id}${mSel ? '&metodo=' + mSel : ''}">＋ Extrair este grão</a></div>
      </div>

      <div class="section-title"><h2>Calibração</h2></div>
      ${metodosUsados.length ? `<div class="tabs">${metodosUsados.map((id) => `<button class="tab ${id === mSel ? 'on' : ''}" onclick="location.hash='#/grao/${g.id}?metodo=${id}'">${metodo(id).icone} ${esc(metodo(id).nome)}</button>`).join('')}</div>` : ''}
      ${xsM.length ? `
      <div class="card" style="margin-top:10px">
        <div class="row between"><h3>${esc(metodo(mSel).nome)}</h3><span class="badge ${cal.status === 'calibrado' ? 'ok' : 'accent'}">${cal.status === 'calibrado' ? '✓ calibrado' : 'ajustando'} · ${cal.tentativas} tentativa(s)</span></div>
        ${melhor ? `<div class="kv">
          <div><span class="lbl">Melhor nota</span><div class="v">${Number(melhor.nota || 0).toFixed(1)}</div></div>
          ${melhor.clicks != null ? `<div><span class="lbl">Moagem</span><div class="v">${E.fmtClicks(melhor.clicks)} cl</div></div>` : ''}
          <div><span class="lbl">Razão</span><div class="v">1:${melhor.ratio}</div></div>
          <div><span class="lbl">Temp.</span><div class="v">${melhor.tempC} °C</div></div>
          <div><span class="lbl">Tempo</span><div class="v">${E.fmtTempo(melhor.tempoS)}</div></div>
          ${cal.tentativasAteCalibrar ? `<div><span class="lbl">Calibrou em</span><div class="v">${cal.tentativasAteCalibrar}ª</div></div>` : ''}
        </div>` : ''}
        <div class="section-title" style="margin-top:14px"><h3 style="margin:0">Curva de notas</h3></div>
        ${curvaNotas(xsM)}
        <div class="section-title" style="margin-top:14px"><h3 style="margin:0">Curva de sabor</h3></div>
        ${radar([{ nome: 'Última', v: sens(ultimo), cls: 'a' }].concat(melhor && melhor.id !== ultimo.id ? [{ nome: 'Melhor', v: sens(melhor), cls: 'b' }] : []))}
        ${tabelaExtracoes(xsM)}
      </div>
      ${(() => { const md = moedor(ultimo.moedorId); const reco = E.recommend(ultimo, xsM.slice(0, -1).filter((x) => x.moedorId === ultimo.moedorId), metodo(mSel), md, g); return cardReco(reco, metodo(mSel), ultimo); })()}
      ` : `<div class="card soft"><p>Nenhuma extração registrada. Métodos indicados para este terroir:</p><div class="chips">${sugeridos.map((m) => `<a class="chip" href="#/nova?grao=${g.id}&metodo=${m.id}">${m.icone} ${esc(m.nome)}</a>`).join('')}</div></div>`}

      <div class="section-title"><h2>Pontos de partida por método</h2></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Método</th><th>Razão</th><th>Temp.</th><th>Moagem</th><th>Tempo</th></tr></thead><tbody>
        ${DB.metodos.map((m) => { const md = state.moedores[0]; const sp = E.startingPoint(g, m, md); return `<tr><td>${m.icone} ${esc(m.nome)}${reg.metodos.includes(m.id) ? ' <span class="badge ok">indicado</span>' : ''}</td><td>1:${sp.ratio}</td><td>${sp.tempC} °C</td><td>${sp.clicks != null ? E.fmtClicks(sp.clicks) + ' cl' : m.grindDesc}</td><td>${E.fmtTempo(m.tempoS.min)}–${E.fmtTempo(m.tempoS.max)}</td></tr>`; }).join('')}
      </tbody></table></div>
      ${state.moedores.length ? `<small class="muted">Cliques calculados para ${esc(state.moedores[0].nome)}.</small>` : '<small class="muted">Cadastre um moedor para ver cliques.</small>'}
      <div class="row" style="margin-top:16px"><button class="btn sm" id="arq">${g.arquivado ? 'Reativar grão' : 'Arquivar grão'}</button></div>`;
    $('#edit').onclick = () => formGrao(g);
    $('#arq').onclick = () => { g.arquivado = !g.arquivado; save(); render(); };
  };

  function tabelaExtracoes(xs) {
    return `<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>#</th><th>Data</th><th>Cliques</th><th>Razão</th><th>°C</th><th>Tempo</th><th>Nota</th><th>Diagnóstico</th></tr></thead><tbody>
      ${xs.map((x, i) => `<tr style="cursor:pointer" onclick="location.hash='#/extracao/${x.id}'"><td>${i + 1}</td><td>${new Date(x.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</td><td>${x.clicks != null ? E.fmtClicks(x.clicks) : '—'}</td><td>1:${x.ratio}</td><td>${x.tempC}</td><td>${E.fmtTempo(x.tempoS)}</td><td><strong>${x.nota != null ? Number(x.nota).toFixed(1) : '—'}</strong></td><td>${badgeDiag(x.diag)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  /* ---------- gráficos (SVG inline) ---------- */
  function curvaNotas(xs) {
    const W = 420, H = 190, pl = 30, pr = 12, pt = 16, pb = 26;
    const n = xs.length;
    const xAt = (i) => pl + (n === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (n - 1));
    const yAt = (v) => pt + (H - pt - pb) * (1 - v / 10);
    const pts = xs.map((x, i) => ({ x: xAt(i), y: yAt(Number(x.nota) || 0), d: x }));
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = n > 1 ? `${path} L${pts[n - 1].x.toFixed(1)},${yAt(0)} L${pts[0].x.toFixed(1)},${yAt(0)} Z` : '';
    const alvo = state.config.notaAlvo || 8;
    return `<div class="chart-box"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Notas por extração">
      <g class="grid">${[0, 2, 4, 6, 8, 10].map((v) => `<line x1="${pl}" x2="${W - pr}" y1="${yAt(v)}" y2="${yAt(v)}"/><text x="${pl - 6}" y="${yAt(v) + 4}" text-anchor="end">${v}</text>`).join('')}</g>
      <line x1="${pl}" x2="${W - pr}" y1="${yAt(alvo)}" y2="${yAt(alvo)}" stroke="var(--ok)" stroke-dasharray="4 4" stroke-width="1.5"/><text x="${W - pr}" y="${yAt(alvo) - 4}" text-anchor="end" fill="var(--ok)">alvo ${alvo}</text>
      ${area ? `<path class="area" d="${area}"/>` : ''}<path class="line" d="${path}"/>
      ${pts.map((p, i) => `<circle class="pt ${p.d.diag ? p.d.diag.cor : ''}" cx="${p.x}" cy="${p.y}" r="5"/><text x="${p.x}" y="${H - 8}" text-anchor="middle">${i + 1}</text><circle class="hit" cx="${p.x}" cy="${p.y}" r="14" data-tip="${esc(`#${i + 1} · nota ${Number(p.d.nota || 0).toFixed(1)} · ${p.d.clicks != null ? E.fmtClicks(p.d.clicks) + ' cl · ' : ''}1:${p.d.ratio} · ${p.d.tempC} °C · ${p.d.diag ? p.d.diag.rotulo : ''}`)}"/>`).join('')}
    </svg><div class="legend"><span style="--c:var(--sub)">sub-extração</span><span style="--c:var(--ok)">equilíbrio</span><span style="--c:var(--sobre)">sobre-extração</span><span style="--c:var(--misto)">misto</span></div></div>`;
  }
  function radar(series) {
    const axes = [['acidez', 'Acidez'], ['docura', 'Doçura'], ['amargor', 'Amargor'], ['corpo', 'Corpo'], ['final', 'Final']];
    const W = 300, H = 230, cx = 150, cy = 118, R = 80;
    const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
    const P = (i, v) => [cx + Math.cos(ang(i)) * R * (v / 5), cy + Math.sin(ang(i)) * R * (v / 5)];
    const ring = (v) => axes.map((a, i) => P(i, v).map((n) => n.toFixed(1)).join(',')).join(' ');
    return `<div class="chart-box"><svg class="chart" viewBox="0 0 ${W} ${H}" style="max-width:340px;margin:0 auto" role="img" aria-label="Perfil sensorial">
      <g class="grid">${[1, 2, 3, 4, 5].map((v) => `<polygon points="${ring(v)}" fill="none" stroke="var(--border)"/>`).join('')}${axes.map((a, i) => `<line x1="${cx}" y1="${cy}" x2="${P(i, 5)[0]}" y2="${P(i, 5)[1]}"/>`).join('')}</g>
      ${series.map((s) => `<polygon points="${axes.map((a, i) => P(i, s.v[a[0]]).map((n) => n.toFixed(1)).join(',')).join(' ')}" class="area ${s.cls}" style="opacity:.25"/><polygon points="${axes.map((a, i) => P(i, s.v[a[0]]).map((n) => n.toFixed(1)).join(',')).join(' ')}" fill="none" class="line ${s.cls}"/>`).join('')}
      ${axes.map((a, i) => { const [x, y] = P(i, 6.1); return `<text x="${x}" y="${y + 4}" text-anchor="middle">${a[1]}</text>`; }).join('')}
    </svg>${series.length > 1 ? `<div class="legend" style="justify-content:center">${series.map((s) => `<span style="--c:${s.cls === 'b' ? 'var(--teal)' : 'var(--accent)'}">${esc(s.nome)}</span>`).join('')}</div>` : ''}</div>`;
  }
  document.addEventListener('mouseover', (e) => { const h = e.target.closest('.hit'); if (!h) return; const box = h.closest('.chart-box'); let t = $('.tip', box); if (!t) { t = document.createElement('div'); t.className = 'tip'; box.appendChild(t); } t.textContent = h.dataset.tip; const r = h.getBoundingClientRect(), b = box.getBoundingClientRect(); t.style.left = r.left - b.left + r.width / 2 + 'px'; t.style.top = r.top - b.top + 'px'; });
  document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('.hit')) { const t = $('.tip', e.target.closest('.chart-box')); if (t) t.remove(); } });
  document.addEventListener('click', (e) => { const h = e.target.closest('.hit'); if (h) toast(h.dataset.tip); });

  /* ======================= MAIS ======================= */
  routes.mais = (view) => {
    $('#title').textContent = 'Mais';
    view.innerHTML = `<div class="list">
      <div class="item" onclick="location.hash='#/moedores'"><div class="ico">⚙️</div><div><div class="t">Moedores</div><div class="s">${state.moedores.length} cadastrado(s) · escalas de cliques e referências</div></div><div>›</div></div>
      <div class="item" onclick="location.hash='#/biblioteca'"><div class="ico">📚</div><div><div class="t">Biblioteca de terroirs</div><div class="s">Regiões, processos, torras, métodos e indicações</div></div><div>›</div></div>
      <div class="item" onclick="location.hash='#/ajustes'"><div class="ico">💾</div><div><div class="t">Backup e ajustes</div><div class="s">Exportar/importar dados, instalar no celular</div></div><div>›</div></div>
    </div>`;
  };

  /* ======================= MOEDORES ======================= */
  routes.moedores = (view, r) => {
    $('#title').textContent = 'Moedores';
    view.innerHTML = `<div class="row between"><h2 style="margin:0">Moedores</h2><button class="btn primary sm" id="novo">＋ Novo moedor</button></div>
      <div class="list" style="margin-top:12px">${state.moedores.length ? state.moedores.map((m) => `<div class="item" data-id="${m.id}"><div class="ico">⚙️</div><div><div class="t">${esc(m.nome)}</div><div class="s">${esc(m.tipo)} · escala ${m.min}–${m.max}, passo ${m.passo} · ${m.direcao === 'maior=fino' ? 'maior = fino' : 'menor = fino'}</div><div class="s">${Object.entries(m.refs || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${metodo(k) ? metodo(k).nome.split(' ')[0] : k} ${v}`).join(' · ')}</div></div><div>›</div></div>`).join('') : '<div class="empty"><div class="big">⚙️</div>Nenhum moedor. Sem moedor o app sugere apenas a descrição da moagem.</div>'}</div>`;
    $('#novo').onclick = () => formMoedor();
    $$('.item[data-id]', view).forEach((el) => (el.onclick = () => formMoedor(moedor(el.dataset.id))));
    if (r.q.novo) { history.replaceState(null, '', '#/moedores'); formMoedor(); }
  };
  function formMoedor(m) {
    const isNew = !m;
    m = m || { nome: '', tipo: 'manual', min: 0, max: 40, passo: 1, direcao: 'menor=fino', refs: {} };
    modal(`<div class="sheet-head"><h2>${isNew ? 'Novo moedor' : 'Editar moedor'}</h2><button class="btn sm ghost" data-close>✕</button></div>
      <form id="fMo">
        <label class="field"><span class="lbl">Modelo (preenche a escala)</span><select id="modelo"><option value="">— escolher modelo —</option>${DB.moedoresModelo.map((x, i) => `<option value="${i}">${esc(x.nome)}</option>`).join('')}</select></label>
        <div class="form-grid">
          <label class="field full"><span class="lbl">Nome *</span><input type="text" name="nome" value="${esc(m.nome)}" required></label>
          <label class="field"><span class="lbl">Tipo</span>${sel('tipo', [{ id: 'manual', nome: 'Manual' }, { id: 'elétrico', nome: 'Elétrico' }], m.tipo)}</label>
          <label class="field"><span class="lbl">Direção</span>${sel('direcao', [{ id: 'menor=fino', nome: 'Menor número = mais fino' }, { id: 'maior=fino', nome: 'Maior número = mais fino' }], m.direcao)}</label>
          <label class="field"><span class="lbl">Mínimo</span><input type="number" name="min" value="${m.min}" step="any" inputmode="decimal"></label>
          <label class="field"><span class="lbl">Máximo</span><input type="number" name="max" value="${m.max}" step="any" inputmode="decimal"></label>
          <label class="field"><span class="lbl">Passo (sub-clique)</span><input type="number" name="passo" value="${m.passo}" step="any" min="0.01" inputmode="decimal"><div class="help">1 = clique inteiro; 0,5 = meio clique; 0,33 = terço.</div></label>
          <label class="field"><span class="lbl">Ajuste padrão (cliques)</span><input type="number" name="passoAjuste" value="${m.passoAjuste || ''}" step="any" inputmode="decimal" placeholder="auto"><div class="help">Quanto o motor move por ajuste normal. Vazio = automático.</div></label>
        </div>
        <div class="lbl">Referências por método (cliques)</div>
        <div class="form-grid">${DB.metodos.map((x) => `<label class="field"><span class="lbl">${x.icone} ${esc(x.nome.split(' (')[0])}</span><input type="number" name="ref_${x.id}" value="${m.refs && m.refs[x.id] != null ? m.refs[x.id] : ''}" step="any" inputmode="decimal" placeholder="—"></label>`).join('')}</div>
        <div class="sheet-foot">${isNew ? '' : '<button type="button" class="btn danger" id="delMo">Excluir</button>'}<button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
      </form>`, (sheet) => {
      const f = $('#fMo', sheet), F = (n) => f.elements[n];
      $('#modelo', sheet).onchange = (e) => { const mm = DB.moedoresModelo[+e.target.value]; if (!mm) return; if (!F('nome').value) F('nome').value = mm.nome.split(' (')[0]; F('tipo').value = mm.tipo; F('min').value = mm.min; F('max').value = mm.max; F('passo').value = mm.passo; DB.metodos.forEach((x) => (F('ref_' + x.id).value = mm.refs[x.id] != null ? mm.refs[x.id] : '')); };
      const del = $('#delMo', sheet); if (del) del.onclick = () => { if (confirmar('Excluir moedor? As extrações continuam, mas sem referência de cliques.')) { state.moedores = state.moedores.filter((x) => x.id !== m.id); save(); closeModal(); render(); } };
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const refs = {}; DB.metodos.forEach((x) => { const v = F('ref_' + x.id).value; if (v !== '') refs[x.id] = +v; });
        const o = { ...m, id: m.id || uid(), nome: F('nome').value.trim(), tipo: F('tipo').value, direcao: F('direcao').value, min: +F('min').value, max: +F('max').value, passo: +F('passo').value || 1, passoAjuste: F('passoAjuste').value ? +F('passoAjuste').value : null, refs };
        if (o.max <= o.min) { toast('Máximo deve ser maior que o mínimo.'); return; }
        if (isNew) state.moedores.push(o); else Object.assign(m, o);
        save(); closeModal(); toast('Moedor salvo'); render();
      });
    });
  }

  /* ======================= BIBLIOTECA ======================= */
  routes.biblioteca = (view, r) => {
    $('#title').textContent = 'Biblioteca';
    const tab = r.q.tab || 'regioes';
    const q = (r.q.q || '').toLowerCase();
    const tabs = [['regioes', 'Regiões'], ['processos', 'Processos'], ['torras', 'Torras'], ['metodos', 'Métodos'], ['indicacoes', 'Indicações']];
    const match = (s) => !q || String(s).toLowerCase().includes(q);
    let body = '';
    if (tab === 'regioes') body = DB.regioes.filter((x) => match(x.nome + x.perfil + x.notas.join(' ') + x.uf)).map((x) => `<details class="lib"><summary>${esc(x.nome)} <span class="badge">${esc(x.uf)}</span></summary><div class="body">
      <p><strong>Altitude:</strong> ${x.altitude[0]}–${x.altitude[1]} m · <strong>Clima:</strong> ${esc(x.clima)}</p>
      <p><strong>Perfil:</strong> ${esc(x.perfil)}</p>
      <div class="chips" style="margin-bottom:8px">${x.notas.map((n) => `<span class="chip static">${esc(n)}</span>`).join('')}</div>
      <p><strong>Acidez</strong> ${'●'.repeat(x.acidez)}${'○'.repeat(5 - x.acidez)} · <strong>Corpo</strong> ${'●'.repeat(x.corpo)}${'○'.repeat(5 - x.corpo)} · <strong>Doçura</strong> ${'●'.repeat(x.docura)}${'○'.repeat(5 - x.docura)}</p>
      ${x.variedades.length ? `<p><strong>Variedades comuns:</strong> ${x.variedades.map(esc).join(', ')}</p>` : ''}
      <p><strong>Processos típicos:</strong> ${x.processos.map((p) => DB.processo[p].nome.split(' (')[0]).join(', ')}</p>
      <p><strong>Métodos indicados:</strong> ${x.metodos.map((m) => metodo(m).icone + ' ' + metodo(m).nome).join(', ')}</p>
      <p>💡 ${esc(x.dica)}</p></div></details>`).join('');
    if (tab === 'processos') body = DB.processos.filter((x) => match(x.nome + x.sensorial)).map((x) => `<details class="lib"><summary>${esc(x.nome)}</summary><div class="body"><p>${esc(x.descricao)}</p><p><strong>Sensorial:</strong> ${esc(x.sensorial)}</p><p><strong>Ajuste automático:</strong> temperatura ${x.ajuste.tempC >= 0 ? '+' : ''}${x.ajuste.tempC} °C · razão ${x.ajuste.ratio >= 0 ? '+' : ''}${x.ajuste.ratio} · moagem ${x.ajuste.moagem >= 0 ? '+' : ''}${x.ajuste.moagem} passo</p><p>💡 ${esc(x.dica)}</p></div></details>`).join('');
    if (tab === 'torras') body = DB.torras.filter((x) => match(x.nome + x.sensorial)).map((x) => `<details class="lib"><summary>${esc(x.nome)} <span class="badge">Agtron ${esc(x.agtron)}</span></summary><div class="body"><p>${esc(x.cor)}</p><p><strong>Sensorial:</strong> ${esc(x.sensorial)}</p><p><strong>Base:</strong> filtrado ${x.base.filtroTempC} °C · 1:${x.base.ratioFiltro} — espresso ${x.base.espressoTempC} °C · 1:${x.base.ratioEspresso}</p><p><strong>Descanso pós-torra:</strong> filtrado ${x.descansoDias.filtrado.join('–')} dias · espresso ${x.descansoDias.espresso.join('–')} dias</p><p>💡 ${esc(x.dica)}</p></div></details>`).join('');
    if (tab === 'metodos') body = DB.metodos.filter((x) => match(x.nome + x.tipo)).map((x) => `<details class="lib"><summary>${x.icone} ${esc(x.nome)} <span class="badge">${esc(x.tipo)}</span></summary><div class="body">
      <p><strong>Razão:</strong> 1:${x.ratio.min}–1:${x.ratio.max} (padrão 1:${x.ratio.padrao}) · <strong>Dose:</strong> ${x.dosePadrao} g</p>
      <p><strong>Temperatura:</strong> ${x.tempC.min}–${x.tempC.max} °C · <strong>Tempo:</strong> ${E.fmtTempo(x.tempoS.min)}–${E.fmtTempo(x.tempoS.max)}</p>
      <p><strong>Moagem:</strong> ${esc(x.grindDesc)} (~${x.microns[0]}–${x.microns[1]} µm)</p>
      <p><strong>Sensibilidade:</strong> ${esc(x.sensibilidade)}</p><p><strong>Receita base:</strong> ${esc(x.receita)}</p></div></details>`).join('');
    if (tab === 'indicacoes') body = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Perfil do grão</th><th>Métodos</th><th>Razão</th><th>Temp.</th><th>Torra</th></tr></thead><tbody>${DB.indicacoesPerfil.filter((x) => match(x.perfil)).map((x) => `<tr><td>${esc(x.perfil)}</td><td>${x.metodos.map((m) => metodo(m).icone + ' ' + metodo(m).nome.split(' (')[0]).join('<br>')}</td><td>${esc(x.razao)}</td><td>${esc(x.tempC)}</td><td>${esc(x.torra)}</td></tr>`).join('')}</tbody></table></div>
      <div class="card soft" style="margin-top:12px"><h3>Escala de moagem</h3><table class="tbl">${DB.grindEscala.map((g) => `<tr><td>${g.n}</td><td><strong>${g.nome}</strong></td><td>${esc(g.ex)}</td></tr>`).join('')}</table></div>`;
    view.innerHTML = `<input class="search" type="text" id="q" placeholder="Buscar…" value="${esc(r.q.q || '')}">
      <div class="tabs">${tabs.map(([id, n]) => `<button class="tab ${id === tab ? 'on' : ''}" data-tab="${id}">${n}</button>`).join('')}</div>
      <div style="margin-top:10px">${body || '<div class="empty">Nada encontrado.</div>'}</div>`;
    $$('.tab', view).forEach((b) => (b.onclick = () => go(`#/biblioteca?tab=${b.dataset.tab}&q=${encodeURIComponent($('#q').value)}`)));
    let t; $('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { history.replaceState(null, '', `#/biblioteca?tab=${tab}&q=${encodeURIComponent(e.target.value)}`); render(); $('#q').focus(); $('#q').setSelectionRange(99, 99); }, 350); });
  };

  /* ======================= AJUSTES / BACKUP ======================= */
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; const b = $('#btnInstall'); if (b) b.hidden = false; });
  routes.ajustes = (view) => {
    $('#title').textContent = 'Backup e ajustes';
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const isFile = location.protocol === 'file:';
    view.innerHTML = `
      <div class="card"><h3>Backup</h3><p class="text-2">Os dados ficam só neste aparelho (armazenamento local do navegador). Exporte com frequência.</p>
        <div class="row"><button class="btn primary" id="exp">⬇︎ Exportar JSON</button><label class="btn">⬆︎ Importar JSON<input type="file" id="imp" accept="application/json,.json" hidden></label><button class="btn" id="copy">Copiar para a área de transferência</button></div>
        <textarea id="paste" placeholder="…ou cole aqui um backup JSON e clique em Importar do texto" style="margin-top:10px"></textarea>
        <div class="row" style="margin-top:6px"><button class="btn sm" id="impTxt">Importar do texto</button></div></div>
      <div class="card" style="margin-top:12px"><h3>Preferências</h3>
        <label class="field"><span class="lbl">Nota alvo para considerar “calibrado”</span><input type="number" id="alvo" min="5" max="10" step="0.5" value="${state.config.notaAlvo || 8}"></label>
        <label class="field"><span class="lbl">Tema</span>${sel('tema', [{ id: 'auto', nome: 'Automático' }, { id: 'light', nome: 'Claro' }, { id: 'dark', nome: 'Escuro' }], state.config.tema || 'auto', 'id="tema"')}</label></div>
      <div class="card" style="margin-top:12px"><h3>Instalar no celular</h3>
        ${standalone ? '<p class="text-2">✅ Você já está usando o app instalado.</p>' : ''}
        ${isFile ? '<p class="text-2">Você abriu o arquivo diretamente (file://). Funciona, mas para instalar como app é preciso servir a pasta por HTTP/HTTPS — veja o README (GitHub Pages ou um servidor local na mesma rede Wi-Fi).</p>' : ''}
        <button class="btn primary" id="btnInstall" ${deferredInstall ? '' : 'hidden'}>Instalar aplicativo</button>
        <p class="text-2" style="margin-top:8px"><strong>Android (Chrome):</strong> menu ⋮ → “Instalar aplicativo” ou “Adicionar à tela inicial”.<br><strong>iPhone (Safari):</strong> botão Compartilhar → “Adicionar à Tela de Início”.</p></div>
      <div class="card" style="margin-top:12px"><h3>Dados de exemplo</h3><p class="text-2">Carrega 1 moedor, 2 grãos e uma sequência de extrações para você ver o motor funcionando.</p><button class="btn" id="demo">Carregar exemplo</button></div>
      <div class="card" style="margin-top:12px"><h3>Zona de perigo</h3><button class="btn danger" id="wipe">Apagar todos os dados</button></div>
      <p class="muted" style="margin-top:16px"><small>Laboratório de Cafeteria · v1 · dados 100 % locais, sem rede.</small></p>`;
    $('#exp').onclick = () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `cafelab-backup-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove(); };
    $('#copy').onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify(state)); toast('Copiado'); } catch (e) { toast('Não foi possível copiar'); } };
    const importar = (txt) => { try { const s = JSON.parse(txt); if (!s || !Array.isArray(s.graos) || !Array.isArray(s.extracoes)) throw new Error('formato'); if (!confirmar(`Importar ${s.graos.length} grão(s), ${(s.moedores || []).length} moedor(es) e ${s.extracoes.length} extração(ões)? Isso substitui os dados atuais.`)) return; state = { graos: s.graos, moedores: s.moedores || [], extracoes: s.extracoes, config: s.config || state.config }; save(); applyTheme(); toast('Backup importado'); go('#/inicio'); } catch (e) { toast('Arquivo inválido'); } };
    $('#imp').onchange = (e) => { const fl = e.target.files[0]; if (!fl) return; const rd = new FileReader(); rd.onload = () => importar(rd.result); rd.readAsText(fl); };
    $('#impTxt').onclick = () => importar($('#paste').value);
    $('#alvo').onchange = (e) => { state.config.notaAlvo = +e.target.value || 8; save(); toast('Salvo'); };
    $('#tema').onchange = (e) => { state.config.tema = e.target.value; save(); applyTheme(); };
    $('#btnInstall').onclick = async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $('#btnInstall').hidden = true; };
    $('#demo').onclick = () => { if (state.extracoes.length && !confirmar('Adicionar dados de exemplo aos dados atuais?')) return; carregarDemo(); toast('Exemplo carregado'); go('#/inicio'); };
    $('#wipe').onclick = () => { if (confirmar('Apagar TODOS os dados deste aparelho? Não há como desfazer.')) { localStorage.removeItem(KEY); state = load(); toast('Dados apagados'); go('#/inicio'); } };
  };

  function carregarDemo() {
    const md = { id: uid(), nome: 'Timemore C3', tipo: 'manual', min: 0, max: 36, passo: 1, direcao: 'menor=fino', refs: DB.moedoresModelo[0].refs };
    const g1 = { id: uid(), nome: 'Sítio Boa Vista — Bourbon Amarelo', produtor: 'Família Pereira', torrefacao: 'Torra local', regiao: 'mantiqueira', variedade: 'Bourbon Amarelo', processo: 'natural', torra: 'media-clara', especie: 'arabica', dataTorra: new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10), acidez: 4, corpo: 3, docura: 4, notas: ['frutas vermelhas', 'caramelo', 'floral'], criadoEm: new Date().toISOString() };
    const g2 = { id: uid(), nome: 'Fazenda Recanto — Catuaí CD', produtor: 'Fazenda Recanto', regiao: 'cerrado-mineiro', variedade: 'Catuaí Vermelho', processo: 'cereja-descascado', torra: 'media', especie: 'arabica', dataTorra: new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10), acidez: 2, corpo: 4, docura: 4, notas: ['chocolate', 'nozes', 'caramelo'], criadoEm: new Date().toISOString() };
    state.moedores.push(md); state.graos.push(g1, g2);
    const d = (h) => new Date(Date.now() - h * 3600000).toISOString();
    const seq = [
      { graoId: g1.id, metodoId: 'v60', moedorId: md.id, data: d(72), clicks: 20, dose: 15, water: 240, ratio: 16, tempC: 94, tempoS: 150, acidez: 5, docura: 2, amargor: 1, corpo: 2, final: 2, sinais: ['azedo', 'aguado'], descritores: ['cítrico'], nota: 5.5, obs: 'Drenou rápido.' },
      { graoId: g1.id, metodoId: 'v60', moedorId: md.id, data: d(48), clicks: 17, dose: 15, water: 240, ratio: 16, tempC: 94, tempoS: 215, acidez: 2, docura: 3, amargor: 4, corpo: 4, final: 3, sinais: ['adstringente'], descritores: ['caramelo'], nota: 6.5, obs: 'Passou do ponto.' },
      { graoId: g1.id, metodoId: 'v60', moedorId: md.id, data: d(24), clicks: 18, dose: 15, water: 240, ratio: 16, tempC: 94, tempoS: 185, acidez: 4, docura: 4, amargor: 2, corpo: 3, final: 4, sinais: [], descritores: ['frutas vermelhas', 'caramelo', 'floral'], nota: 8.5, obs: 'Aí sim.' },
      { graoId: g2.id, metodoId: 'espresso', moedorId: md.id, data: d(30), clicks: 9, dose: 18, water: 36, ratio: 2, tempC: 92.5, tempoS: 19, acidez: 4, docura: 2, amargor: 2, corpo: 3, final: 2, sinais: ['azedo', 'salgado'], descritores: [], nota: 5, obs: 'Correu rápido.' },
      { graoId: g2.id, metodoId: 'espresso', moedorId: md.id, data: d(6), clicks: 8, dose: 18, water: 36, ratio: 2, tempC: 92.5, tempoS: 27, acidez: 3, docura: 4, amargor: 3, corpo: 4, final: 4, sinais: [], descritores: ['chocolate', 'caramelo'], nota: 8, obs: '' }
    ];
    seq.forEach((x) => { x.id = uid(); if (x.metodoId === 'espresso') x.yieldG = x.water; x.diag = E.diagnose(x, metodo(x.metodoId)); state.extracoes.push(x); });
    save();
  }

  /* ---------------- PWA ---------------- */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* sem SW (ex.: http em rede local) */ }));
  }

  /* ---------------- boot ---------------- */
  applyTheme();
  render();
  window.CafeLab = { state: () => state, save, carregarDemo };
})();
