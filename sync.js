/* =====================================================================
 * Laboratório de Cafeteria — Sincronização entre aparelhos
 * Os dados vão para um arquivo num Gist secreto da conta GitHub do
 * usuário, CRIPTOGRAFADO no aparelho (AES-GCM 256, chave derivada da
 * senha com PBKDF2-SHA256). O GitHub só vê texto cifrado.
 *
 * Mescla em 3 vias por registro (base = último estado sincronizado neste
 * aparelho): novidades dos dois lados somam, edição mais recente vence,
 * exclusões viram "lápides" para não ressuscitar em outro aparelho.
 * Token e senha ficam só neste aparelho e nunca entram no backup.
 * ===================================================================== */
(function () {
  'use strict';
  const lab = window.CafeLab, DB = window.CAFE_DB;
  const K = { token: 'cafelab.sync.token', senha: 'cafelab.sync.senha', gist: 'cafelab.sync.gist', base: 'cafelab.sync.base', disp: 'cafelab.sync.dispositivo', ult: 'cafelab.sync.ultimo' };
  const ARQ = 'cafelab-sync.json', DESC = 'Laboratório de Cafeteria – sincronização (criptografado)';
  const COLECOES = ['graos', 'moedores', 'extracoes', 'cafeina', 'latte'];
  const CONFIG_LOCAL = ['tema', 'catalogoVersao', 'moedoresVersao', 'estoqueMigrado', '_mod'];
  const ITER = 310000;

  const ls = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* */ } } };
  const ativo = () => !!(ls.get(K.token) && ls.get(K.senha));

  /* ---------- utilidades ---------- */
  const b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  function estavel(v) { // JSON com chaves ordenadas, sem campos de controle
    if (Array.isArray(v)) return '[' + v.map(estavel).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).filter((k) => k !== '_mod' && k !== 'diag').sort().map((k) => JSON.stringify(k) + ':' + estavel(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  function hash(v) { const s = estavel(v); let h1 = 0x811c9dc5, h2 = 0x01000193; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); } return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + s.length.toString(36); }
  const agora = () => Date.now();
  const dispositivo = () => { let d = ls.get(K.disp); if (!d) { const ua = navigator.userAgent; d = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? 'Tablet' : /Mobi|iPhone|Android/i.test(ua) ? 'Celular' : 'Computador'; ls.set(K.disp, d); } return d; };

  /* ---------- criptografia ---------- */
  let chaveCache = null; // { salt, senha, key }
  async function chave(senha, saltB64) {
    if (chaveCache && chaveCache.salt === saltB64 && chaveCache.senha === senha) return chaveCache.key;
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(saltB64), iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    chaveCache = { salt: saltB64, senha, key };
    return key;
  }
  async function cifrar(obj, senha, saltB64) {
    saltB64 = saltB64 || b64(crypto.getRandomValues(new Uint8Array(16)));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chave(senha, saltB64), new TextEncoder().encode(JSON.stringify(obj)));
    return JSON.stringify({ app: 'cafelab', v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: saltB64, iv: b64(iv), dados: b64(ct) });
  }
  async function decifrar(texto, senha) {
    let env; try { env = JSON.parse(texto); } catch (e) { throw new Error('Arquivo de sincronização corrompido.'); }
    if (env.app !== 'cafelab' || !env.dados) throw new Error('O gist encontrado não é do Laboratório de Cafeteria.');
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, await chave(senha, env.salt), unb64(env.dados));
      return { dados: JSON.parse(new TextDecoder().decode(pt)), salt: env.salt };
    } catch (e) { chaveCache = null; const err = new Error('Senha de sincronização incorreta para os dados salvos no GitHub.'); err.senha = true; throw err; }
  }

  /* ---------- GitHub Gist ---------- */
  async function gh(caminho, opts) {
    opts = opts || {};
    let r;
    try {
      r = await fetch('https://api.github.com' + caminho, { method: opts.method || 'GET', headers: { Authorization: 'Bearer ' + ls.get(K.token), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store' });
    } catch (e) { throw new Error('Sem conexão com o GitHub.'); }
    if (r.status === 401) throw new Error('Token do GitHub inválido ou expirado.');
    if (r.status === 403 || r.status === 404) {
      const j = await r.json().catch(() => ({}));
      if (/rate limit/i.test(j.message || '')) throw new Error('Limite de uso da API do GitHub atingido. Tente mais tarde.');
      if (r.status === 404 && caminho.startsWith('/gists/')) { ls.set(K.gist, ''); throw new Error('O gist de sincronização não existe mais. Sincronize de novo para criar outro.'); }
      throw new Error('O token não tem permissão para Gists (leitura e escrita).');
    }
    if (!r.ok) throw new Error(`Erro do GitHub (${r.status}).`);
    return r.json();
  }
  async function acharGist() {
    const id = ls.get(K.gist);
    if (id) return id;
    for (let pag = 1; pag <= 5; pag++) {
      const lista = await gh(`/gists?per_page=100&page=${pag}`);
      const g = lista.find((x) => x.files && x.files[ARQ]);
      if (g) { ls.set(K.gist, g.id); return g.id; }
      if (lista.length < 100) break;
    }
    return '';
  }
  async function lerGist(id) {
    const g = await gh('/gists/' + id);
    const f = g.files && g.files[ARQ];
    if (!f) return null;
    if (f.truncated && f.raw_url) { const r = await fetch(f.raw_url, { cache: 'no-store' }); return r.text(); }
    return f.content;
  }

  /* ---------- mescla ---------- */
  function lerBase() { try { return JSON.parse(ls.get(K.base)) || null; } catch (e) { return null; } }
  function configSinc(cfg) { const o = {}; Object.keys(cfg || {}).forEach((k) => { if (!CONFIG_LOCAL.includes(k)) o[k] = cfg[k]; }); return o; }
  function garantirIds(st) { (st.latte || []).forEach((x) => { if (!x.id) x.id = 'l' + (Date.parse(x.t) || agora()).toString(36); }); }

  // registros do catálogo/moedores-modelo ainda sem edição do usuário
  function intocado(col, r) {
    if (col === 'graos' && r.catalogoId) {
      const c = DB.catalogo.find((x) => x.catalogoId === r.catalogoId); if (!c) return false;
      return Object.keys(c).every((k) => estavel(c[k]) === estavel(r[k])) && !r.dataTorra;
    }
    if (col === 'moedores' && r.modeloId) {
      const m = DB.moedoresModelo.find((x) => x.id === r.modeloId); if (!m) return false;
      return estavel(m.refs) === estavel(r.refs) && m.max === r.max && m.passo === r.passo;
    }
    return false;
  }
  // o mesmo café do catálogo/moedor pré-cadastrado criado em dois aparelhos com ids diferentes
  function unificarIds(local, remoto) {
    const trocas = { graos: {}, moedores: {} };
    [['graos', 'catalogoId'], ['moedores', 'modeloId']].forEach(([col, chaveNat]) => {
      (local[col] || []).forEach((r) => {
        if (!r[chaveNat]) return;
        const par = (remoto[col] || []).find((x) => x[chaveNat] === r[chaveNat]);
        if (par && par.id !== r.id) { trocas[col][r.id] = par.id; r.id = par.id; if (intocado(col, r)) r._intocado = true; }
      });
    });
    (local.extracoes || []).forEach((x) => { if (trocas.graos[x.graoId]) x.graoId = trocas.graos[x.graoId]; if (trocas.moedores[x.moedorId]) x.moedorId = trocas.moedores[x.moedorId]; });
    return trocas;
  }

  function mesclar(local, remoto, base, t) {
    const res = { colecoes: {}, apagados: {}, config: null, mudouLocal: false, mudouRemoto: false };
    const baseH = (base && base.h) || {};
    const primeira = !base;
    COLECOES.forEach((col) => {
      const L = new Map((local[col] || []).map((r) => [r.id, r]));
      const R = new Map(((remoto && remoto.colecoes && remoto.colecoes[col]) || []).map((r) => [r.id, r]));
      const B = baseH[col] || {};
      const lapides = Object.assign({}, (remoto && remoto.apagados && remoto.apagados[col]) || {});
      const out = [];
      const ids = new Set([...L.keys(), ...R.keys(), ...Object.keys(B)]);
      ids.forEach((id) => {
        const l = L.get(id), r = R.get(id);
        const localMudou = l && (!(id in B) || hash(l) !== B[id]);
        const localApagou = !l && id in B;
        if (l && localMudou && !(primeira && l._intocado && r)) l._mod = t;
        if (l) delete l._intocado;
        if (localApagou) {
          if (r && (r._mod || 0) > ((base && base.t) || 0)) { out.push(r); res.mudouLocal = true; } // editado em outro aparelho depois: mantém
          else { lapides[id] = t; if (r) res.mudouRemoto = true; }
          return;
        }
        const lap = lapides[id] || 0;
        let venc = null;
        if (l && r) venc = (l._mod || 0) >= (r._mod || 0) ? l : r;
        else venc = l || r;
        if (venc && lap && lap >= (venc._mod || 0)) { if (l) res.mudouLocal = true; return; }
        if (venc && lap) delete lapides[id];
        out.push(venc);
        if (venc !== l && (!l || hash(l) !== hash(venc))) res.mudouLocal = true;
        if (venc !== r && (!r || hash(r) !== hash(venc) || (r._mod || 0) !== (venc._mod || 0))) res.mudouRemoto = true;
      });
      res.colecoes[col] = out;
      res.apagados[col] = lapides;
    });
    // configurações (perfil de cafeína, preferências…): última alteração vence
    const cL = configSinc(local.config), cR = (remoto && remoto.config) || null;
    const cLmudou = !base || hash(cL) !== base.cfg;
    const cLmod = cLmudou ? (primeira && cR ? 0 : t) : ((local.config && local.config._mod) || 0);
    if (!cR || cLmod >= (cR._mod || 0)) { res.config = Object.assign({}, cL, { _mod: cLmod || t }); if (!cR || hash(cR) !== hash(res.config)) res.mudouRemoto = true; }
    else { res.config = cR; if (hash(cR) !== hash(cL)) res.mudouLocal = true; }
    return res;
  }

  /* ---------- sincronizar ---------- */
  let rodando = null, pendente = false, ultimoErro = '', erroSenha = false;
  function status(msg, tipo) {
    const b = document.getElementById('btnSync');
    if (b) { b.hidden = !ativo(); b.textContent = tipo === 'sync' ? '⟳' : tipo === 'erro' ? '⚠' : '☁'; b.title = msg; b.classList.toggle('sync-erro', tipo === 'erro'); b.classList.toggle('sync-roda', tipo === 'sync'); }
    const el = document.getElementById('syncStatus'); if (el) el.textContent = msg;
  }
  async function sincronizar(opts) {
    opts = opts || {};
    if (!ativo()) return { ok: false, msg: 'Sincronização não configurada' };
    if (rodando) { pendente = true; return rodando; }
    rodando = (async () => {
      status('Sincronizando…', 'sync');
      try {
        const st = lab.state(), senha = ls.get(K.senha), t = agora();
        garantirIds(st);
        let id = await acharGist();
        let remoto = null, salt = null;
        if (id && !opts.recomecar) {
          const txt = await lerGist(id);
          if (txt) { const d = await decifrar(txt, senha); remoto = d.dados; salt = d.salt; }
        }
        const base = opts.recomecar ? null : lerBase();
        if (remoto) unificarIds(st, remoto.colecoes || {});
        const m = mesclar(st, remoto, base && base.gist === id ? base : null, t);
        // aplica localmente (mesmo objeto de estado do app)
        if (m.mudouLocal || !remoto) {
          COLECOES.forEach((col) => { st[col] = m.colecoes[col]; });
          const locais = {}; CONFIG_LOCAL.forEach((k) => { if (k in st.config) locais[k] = st.config[k]; });
          st.config = Object.assign({}, m.config, locais, { _mod: m.config._mod });
        } else st.config._mod = m.config._mod;
        const arquivo = { app: 'cafelab', v: 1, atualizadoEm: new Date(t).toISOString(), por: dispositivo(), colecoes: m.colecoes, apagados: m.apagados, config: m.config };
        if (!id) {
          const g = await gh('/gists', { method: 'POST', body: { description: DESC, public: false, files: { [ARQ]: { content: await cifrar(arquivo, senha) } } } });
          id = g.id; ls.set(K.gist, id);
        } else if (m.mudouRemoto || !remoto) {
          await gh('/gists/' + id, { method: 'PATCH', body: { files: { [ARQ]: { content: await cifrar(arquivo, senha, salt) } } } });
        }
        // nova base = estado mesclado
        const h = {}; COLECOES.forEach((col) => { h[col] = {}; m.colecoes[col].forEach((r) => { h[col][r.id] = hash(r); }); });
        ls.set(K.base, JSON.stringify({ gist: id, t, h, cfg: hash(configSinc(st.config)) }));
        ls.set(K.ult, new Date(t).toISOString());
        salvandoPorSync = true; lab.save(); salvandoPorSync = false;
        ultimoErro = ''; erroSenha = false;
        const quando = new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        status(`Sincronizado às ${quando}`, 'ok');
        if (m.mudouLocal && !opts.silencioso) { lab.toast('Dados atualizados de outro aparelho'); }
        if (m.mudouLocal) lab.render();
        return { ok: true, recebeu: m.mudouLocal, enviou: m.mudouRemoto || !remoto };
      } catch (e) {
        ultimoErro = e.message || String(e); erroSenha = !!e.senha;
        status('Falha ao sincronizar: ' + ultimoErro, 'erro');
        if (!opts.silencioso) lab.toast(ultimoErro);
        return { ok: false, msg: ultimoErro };
      } finally {
        rodando = null;
        if (pendente) { pendente = false; setTimeout(() => sincronizar({ silencioso: true }), 500); }
      }
    })();
    return rodando;
  }

  /* ---------- gatilhos automáticos ---------- */
  let salvandoPorSync = false, timer = null;
  lab.hooks.salvo.push(() => { if (salvandoPorSync || !ativo()) return; clearTimeout(timer); timer = setTimeout(() => sincronizar({ silencioso: true }), 4000); });
  lab.hooks.boot.push(() => {
    status(ativo() ? 'Sincronização ativa' : '', 'ok');
    const b = document.getElementById('btnSync'); if (b) b.onclick = () => sincronizar();
    if (ativo()) setTimeout(() => sincronizar({ silencioso: true }), 800);
  });
  document.addEventListener('visibilitychange', () => {
    if (!ativo()) return;
    if (document.visibilityState === 'visible') sincronizar({ silencioso: true });
    else if (timer) { clearTimeout(timer); timer = null; sincronizar({ silencioso: true }); }
  });
  window.addEventListener('online', () => { if (ativo()) sincronizar({ silencioso: true }); });

  /* ---------- cartão nos ajustes ---------- */
  lab.hooks.ajustes.push((root) => {
    const div = document.createElement('div');
    div.className = 'card'; div.style.marginTop = '12px';
    const on = ativo(), ult = ls.get(K.ult);
    div.innerHTML = `<h3>☁ Sincronização entre aparelhos</h3>
      ${on ? `<p><span class="badge ok">Ativa neste aparelho</span> <small class="muted" id="syncStatus">${ult ? 'Última: ' + lab.fmtData(ult) : ''}${ultimoErro ? ' · ' + lab.esc(ultimoErro) : ''}</small></p>` : ''}
      <p class="text-2">Seus dados ficam num Gist secreto da sua conta do GitHub, criptografados com a sua senha antes de sair do aparelho. Use o mesmo token e a mesma senha no celular, no tablet e no notebook. O token e a senha ficam só em cada aparelho e não vão para o backup.</p>
      <label class="field"><span class="lbl">Nome deste aparelho</span><input type="text" id="syDisp" value="${lab.esc(dispositivo())}"></label>
      <label class="field"><span class="lbl">Token do GitHub ${ls.get(K.token) ? '<span class="badge ok">configurado</span>' : ''}</span><input type="password" id="syTok" autocomplete="off" placeholder="${ls.get(K.token) ? '•••••••• (deixe em branco para manter)' : 'github_pat_… ou ghp_…'}"></label>
      <label class="field"><span class="lbl">Senha de criptografia ${ls.get(K.senha) ? '<span class="badge ok">configurada</span>' : ''}</span><input type="password" id="sySenha" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore placeholder="${ls.get(K.senha) ? '•••••••• (deixe em branco para manter)' : 'a mesma em todos os aparelhos'}"></label>
      <label class="field"><span class="lbl">Confirme a senha</span><input type="password" id="sySenha2" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore placeholder="digite de novo"></label>
      <label class="chk" style="margin-top:-6px"><input type="checkbox" id="syVer"> Mostrar senha</label>
      <div class="help" style="margin-bottom:10px">Não aceite senha sugerida pelo navegador: digite a sua. Sem essa senha ninguém lê os dados, nem você. Se esquecer, use “Recomeçar com esta senha” para criar a cópia de novo a partir de um aparelho.</div>
      ${on && erroSenha ? `<div class="card soft" style="margin-bottom:10px;border:1px solid var(--sobre)"><strong>⚠ A senha deste aparelho não abre os dados salvos no GitHub.</strong><p class="text-2" style="margin:6px 0 8px">Se você não lembra a senha usada antes, recomece: a cópia no GitHub será substituída pelos dados <strong>deste aparelho</strong>, criptografados com a senha configurada aqui. Faça isso no aparelho com os dados mais completos e depois use a mesma senha nos outros.</p><button class="btn sm danger" id="syRecomecar">Recomeçar com esta senha</button></div>` : ''}
      <div class="row"><button class="btn primary sm" id="sySalvar">${on ? 'Salvar e sincronizar' : 'Ativar sincronização'}</button>${on ? '<button class="btn sm" id="syAgora">⟳ Sincronizar agora</button><button class="btn sm danger" id="syOff">Desativar neste aparelho</button>' : ''}</div>
      <details class="recipe" style="margin-top:10px"><summary>Como criar o token do GitHub</summary><ol class="text-2" style="padding-left:18px;margin:6px 0 0">
        <li>No GitHub, abra <strong>Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token</strong>.</li>
        <li>Dê um nome (ex.: “Lab Café”) e uma validade (até 1 ano).</li>
        <li>Em <strong>Permissions → Account permissions</strong>, ache <strong>Gists</strong> e escolha <strong>Read and write</strong>. Não precisa de mais nada.</li>
        <li>Gere, copie o token e cole aqui. Faça o mesmo (com o mesmo token) nos outros aparelhos.</li>
        <li>Alternativa: token <em>classic</em> marcando só o escopo <strong>gist</strong>.</li></ol></details>`;
    root.appendChild(div);
    const q = (s) => div.querySelector(s);
    q('#sySalvar').onclick = async () => {
      const tok = q('#syTok').value.trim(), sen = q('#sySenha').value.trim(), sen2 = q('#sySenha2').value.trim();
      if (sen) {
        if (sen.length < 8) return lab.toast('Use uma senha com pelo menos 8 caracteres');
        if (sen !== sen2) return lab.toast('As duas senhas não conferem');
      }
      if (tok) ls.set(K.token, tok);
      if (sen && sen !== ls.get(K.senha)) { ls.set(K.senha, sen); ls.set(K.base, ''); chaveCache = null; }
      ls.set(K.disp, q('#syDisp').value.trim() || dispositivo());
      if (!ativo()) return lab.toast('Informe o token e a senha');
      lab.toast('Sincronizando…');
      const r = await sincronizar();
      if (r && r.ok) lab.toast(r.recebeu ? 'Sincronizado: dados recebidos de outro aparelho' : 'Sincronização ativa');
      lab.render();
    };
    q('#syVer').onchange = (e) => { q('#sySenha').type = q('#sySenha2').type = e.target.checked ? 'text' : 'password'; };
    const rc = q('#syRecomecar');
    if (rc) rc.onclick = async () => {
      if (!window.confirm('Substituir a cópia no GitHub pelos dados deste aparelho, com a senha atual? Os dados que estavam lá com a senha antiga não poderão ser recuperados.')) return;
      lab.toast('Recomeçando…');
      const r = await sincronizar({ recomecar: true });
      if (r && r.ok) lab.toast('Pronto! Use esta mesma senha nos outros aparelhos.');
      lab.render();
    };
    if (on) {
      q('#syAgora').onclick = async () => { const r = await sincronizar(); if (r && r.ok) lab.toast('Sincronizado'); lab.render(); };
      q('#syOff').onclick = () => { if (!window.confirm('Desativar a sincronização neste aparelho? Os dados continuam aqui e no GitHub.')) return; [K.token, K.senha, K.gist, K.base, K.ult].forEach((k) => ls.set(k, '')); chaveCache = null; status('', 'ok'); lab.toast('Sincronização desativada neste aparelho'); lab.render(); };
    }
  });

  window.CafeSync = { sincronizar, cifrar, decifrar, mesclar, hash, ativo };
})();
