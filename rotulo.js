/* =====================================================================
 * Laboratório de Cafeteria — Leitura de rótulos (câmera)
 * 1) Com chave da API Anthropic: Claude lê a foto e devolve JSON validado
 *    por schema (structured outputs), já mapeado para o banco nativo.
 * 2) Sem chave: OCR local com Tesseract.js (carregado sob demanda) +
 *    interpretação por regras (regiões, processos, torras, variedades…).
 * A chave fica só neste aparelho (localStorage) e nunca entra no backup.
 * ===================================================================== */
(function () {
  'use strict';
  const DB = window.CAFE_DB;
  const KEY_API = 'cafelab.anthropic.key';
  const KEY_MODEL = 'cafelab.anthropic.model';
  const MODELOS = [
    { id: 'claude-opus-5', nome: 'Claude Opus 5 (padrão, mais preciso)' },
    { id: 'claude-sonnet-5', nome: 'Claude Sonnet 5 (mais barato)' },
    { id: 'claude-haiku-4-5', nome: 'Claude Haiku 4.5 (mais rápido/barato)' }
  ];
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';

  const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* */ } };
  const getKey = () => lsGet(KEY_API);
  const getModel = () => lsGet(KEY_MODEL) || MODELOS[0].id;

  /* ---------- imagem: reduz para ~1568 px, JPEG ---------- */
  function carregarImagem(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Não foi possível abrir a imagem.')); };
      img.src = url;
    });
  }
  function redimensionar(img, max, cinza) {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext('2d');
    if (cinza) ctx.filter = 'grayscale(1) contrast(1.35)';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  /* ---------- Claude ---------- */
  const enumIds = (arr) => [''].concat(arr.map((x) => x.id));
  const SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      nome: { type: 'string', description: 'Nome comercial do café/lote como aparece no rótulo (ex.: "Frutas Amarelas"). Vazio se não houver.' },
      torrefacao: { type: 'string', description: 'Marca/torrefação.' },
      produtor: { type: 'string', description: 'Produtor, fazenda ou sítio, com cidade/UF se houver.' },
      regiao: { type: 'string', enum: enumIds(DB.regioes), description: 'Id da região produtora do banco; "outra" se for uma região não listada; vazio se não houver indicação.' },
      variedade: { type: 'string' },
      processo: { type: 'string', enum: enumIds(DB.processos) },
      torra: { type: 'string', enum: enumIds(DB.torras) },
      especie: { type: 'string', enum: ['', 'arabica', 'canephora', 'blend'] },
      altitude_m: { type: 'integer', description: 'Altitude em metros; se for faixa, o ponto médio; 0 se ausente.' },
      data_torra: { type: 'string', description: 'Data da torra em AAAA-MM-DD; vazio se ausente. Rótulos brasileiros usam DD/MM/AAAA.' },
      pontuacao: { type: 'string', description: 'Pontuação SCA como no rótulo (ex.: "86", "84+"); vazio se ausente.' },
      notas: { type: 'array', items: { type: 'string', enum: DB.descritores }, description: 'Descritores do rótulo mapeados para a lista permitida (use o mais próximo).' },
      notas_originais: { type: 'array', items: { type: 'string' }, description: 'Notas sensoriais exatamente como escritas no rótulo.' },
      observacoes: { type: 'string', description: 'Outras informações úteis (safra, peso, método recomendado, receita sugerida).' },
      texto_lido: { type: 'string', description: 'Transcrição do texto legível do rótulo.' }
    },
    required: ['nome', 'torrefacao', 'produtor', 'regiao', 'variedade', 'processo', 'torra', 'especie', 'altitude_m', 'data_torra', 'pontuacao', 'notas', 'notas_originais', 'observacoes', 'texto_lido']
  };
  function promptClaude() {
    const regioes = DB.regioes.map((r) => `${r.id} = ${r.nome} (${r.uf})`).join('; ');
    const processos = DB.processos.map((p) => `${p.id} = ${p.nome}`).join('; ');
    const torras = DB.torras.map((t) => `${t.id} = ${t.nome} (Agtron ${t.agtron})`).join('; ');
    return `Esta é a foto de um pacote de café especial brasileiro. Extraia as informações do rótulo para cadastrar o grão num diário de extrações.

Regras:
- Use apenas o que está escrito ou claramente implícito no rótulo; campos ausentes ficam vazios (ou 0 para altitude). Não invente produtor, altitude ou pontuação.
- Região: mapeie cidade/região para o id do banco. Exemplos: Carmo de Minas → mantiqueira; Franca/Pedregulho → alta-mogiana; Patrocínio/Araxá → cerrado-mineiro; Alto Jequitibá, Espera Feliz, Dores do Rio Preto, Alto Caparaó → caparao; Venda Nova do Imigrante → montanhas-es; Piatã/Ibicoara → chapada-diamantina.
- Processo: "natural fermentado", "fermentação induzida", leveduras, koji → fermentacao-induzida; "anaeróbico", "maceração carbônica" → anaerobico; "CD", "cereja descascado" → cereja-descascado; "lavado", "despolpado" → lavado.
- Torra: "média-clara"/"clara-média" → media-clara; "média-escura" → media-escura.

Ids de região: ${regioes}.
Ids de processo: ${processos}.
Ids de torra: ${torras}.`;
  }

  async function lerComClaude(canvas, progresso) {
    progresso('Enviando foto para a IA…');
    let Anthropic;
    try {
      ({ default: Anthropic } = await import('./vendor/anthropic-sdk.mjs'));
    } catch (e) {
      throw new Error('Não foi possível carregar o módulo da IA. Abra o app por http(s) (GitHub Pages ou servidor local), não pelo arquivo direto.');
    }
    const client = new Anthropic({ apiKey: getKey(), dangerouslyAllowBrowser: true, maxRetries: 2 });
    const model = getModel();
    const data = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
    const params = {
      model,
      max_tokens: 16000,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
        { type: 'text', text: promptClaude() }
      ] }]
    };
    if (model !== 'claude-haiku-4-5') params.output_config.effort = 'medium';
    if (model === 'claude-opus-5') { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }
    let resp;
    try {
      resp = await client.beta.messages.create(params);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new Error('Chave da API inválida. Confira em Mais → Backup e ajustes.');
      if (e instanceof Anthropic.PermissionDeniedError) throw new Error('A chave não tem permissão para este modelo. Escolha outro modelo nos ajustes.');
      if (e instanceof Anthropic.RateLimitError) throw new Error('Limite de uso da API atingido. Tente de novo em instantes.');
      if (e instanceof Anthropic.BadRequestError) throw new Error('A API recusou a requisição: ' + (e.message || '').slice(0, 200));
      if (e instanceof Anthropic.APIConnectionError) throw new Error('Sem conexão com a API da Anthropic. Verifique a internet.');
      if (e instanceof Anthropic.APIError) throw new Error(`Erro da API (${e.status || '?'}): ${(e.message || '').slice(0, 200)}`);
      throw e;
    }
    if (resp.stop_reason === 'refusal') throw new Error('A IA não processou esta imagem. Tente outra foto ou use o OCR local (remova a chave).');
    if (resp.stop_reason === 'max_tokens') throw new Error('Resposta da IA incompleta. Tente novamente.');
    const txt = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let j;
    try { j = JSON.parse(txt); } catch (e) { throw new Error('A IA devolveu um formato inesperado. Tente novamente.'); }
    const obs = [j.notas_originais && j.notas_originais.length ? 'Notas do rótulo: ' + j.notas_originais.join(', ') : '', j.observacoes].filter(Boolean).join(' · ');
    return {
      fonte: 'ia',
      texto: j.texto_lido || '',
      campos: {
        nome: j.nome, torrefacao: j.torrefacao, produtor: j.produtor, regiao: j.regiao, variedade: j.variedade,
        processo: j.processo, torra: j.torra, especie: j.especie, altitude: j.altitude_m || '', dataTorra: /^\d{4}-\d{2}-\d{2}$/.test(j.data_torra || '') ? j.data_torra : '',
        pontuacao: j.pontuacao, notas: (j.notas || []).filter((n) => DB.descritores.includes(n)), obs
      },
      aviso: resp.model && resp.model !== model ? `Respondido por ${resp.model} (fallback).` : ''
    };
  }

  /* ---------- OCR local ---------- */
  function carregarScript(src) {
    return new Promise((res, rej) => {
      if (window.Tesseract) return res();
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Não foi possível baixar o OCR (precisa de internet na primeira vez). Configure a chave da IA ou tente de novo online.'));
      document.head.appendChild(s);
    });
  }
  async function lerComOCR(canvas, progresso) {
    progresso('Baixando OCR local…');
    await carregarScript(TESSERACT_URL);
    progresso('Lendo o texto do rótulo…');
    const worker = await window.Tesseract.createWorker('por', 1, { logger: (m) => { if (m.status === 'recognizing text') progresso(`Lendo o texto do rótulo… ${Math.round(m.progress * 100)} %`); } });
    try {
      const { data } = await worker.recognize(canvas);
      const texto = (data && data.text) || '';
      if (!texto.trim()) throw new Error('Nenhum texto reconhecido. Aproxime a câmera, evite reflexo e tente de novo.');
      return { fonte: 'ocr', texto, campos: interpretar(texto), aviso: 'OCR local é menos preciso que a IA: confira cada campo.' };
    } finally { await worker.terminate(); }
  }

  /* ---------- interpretação por regras (usada pelo OCR) ---------- */
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const REGIOES_KW = [
    ['caparao', ['caparao', 'alto jequitiba', 'espera feliz', 'dores do rio preto', 'alto caparao', 'divino de sao lourenco', 'manhumirim', 'irupi', 'iuna']],
    ['mantiqueira', ['mantiqueira', 'carmo de minas', 'cristina', 'sao lourenco', 'pedralva', 'conceicao das pedras']],
    ['cerrado-mineiro', ['cerrado mineiro', 'patrocinio', 'araxa', 'monte carmelo', 'patos de minas', 'serra do salitre', 'campos altos']],
    ['sul-de-minas', ['sul de minas', 'tres pontas', 'varginha', 'poco fundo', 'santo antonio do amparo', 'sao sebastiao do paraiso', 'guaxupe', 'boa esperanca', 'machado']],
    ['alta-mogiana', ['alta mogiana', 'franca', 'pedregulho', 'altinopolis', 'cristais paulista']],
    ['media-mogiana', ['media mogiana', 'mococa', 'espirito santo do pinhal', 'sao joao da boa vista']],
    ['matas-de-minas', ['matas de minas', 'zona da mata', 'manhuacu', 'carangola', 'araponga', 'ervalia']],
    ['chapada-de-minas', ['chapada de minas', 'capelinha', 'jequitinhonha', 'turmalina']],
    ['campo-das-vertentes', ['campo das vertentes', 'vertentes', 'sao joao del rei', 'lavras', 'nazareno']],
    ['montanhas-es', ['montanhas do espirito santo', 'venda nova', 'afonso claudio', 'castelo', 'domingos martins', 'brejetuba']],
    ['conilon-capixaba', ['conilon', 'linhares', 'sao gabriel da palha']],
    ['chapada-diamantina', ['chapada diamantina', 'piata', 'mucuge', 'ibicoara', 'barra da estiva']],
    ['planalto-bahia', ['vitoria da conquista', 'planalto da bahia', 'barra do choca']],
    ['oeste-bahia', ['oeste da bahia', 'barreiras', 'luis eduardo magalhaes', 'cerrado baiano']],
    ['norte-pioneiro-pr', ['norte pioneiro', 'parana', 'carlopolis', 'pinhalao']],
    ['rondonia', ['rondonia', 'robusta amazonico', 'cacoal', 'alta floresta']]
  ];
  const VARIEDADES = ['Bourbon Amarelo', 'Bourbon Vermelho', 'Bourbon', 'Catuaí Amarelo', 'Catuaí Vermelho', 'Catuaí', 'Catucaí Amarelo', 'Catucaí Vermelho', 'Catucaí', 'Mundo Novo', 'Arara', 'Topázio', 'Geisha', 'Gesha', 'Acaiá', 'Obatã', 'Icatu', 'Paraíso', 'Aranãs', 'Caturra', 'Maragogipe', 'Acauã', 'Yellow Bourbon', 'Pacamara', 'SL28', 'Conilon', 'Robusta', 'Caparaó Amarelo'];

  function interpretar(texto) {
    const t = semAcento(texto).replace(/\s+/g, ' ').replace(/(\d)\.(\d{3})\b/g, '$1$2');
    const linhas = String(texto).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const c = { notas: [] };
    for (const [id, kws] of REGIOES_KW) if (kws.some((k) => t.includes(k))) { c.regiao = id; break; }
    if (/anaerob|macerac/.test(t)) c.processo = 'anaerobico';
    else if (/induzid|levedura|koji|fermentad|co-?ferment/.test(t)) c.processo = 'fermentacao-induzida';
    else if (/cereja descascad|\bcd\b|pulped/.test(t)) c.processo = 'cereja-descascado';
    else if (/honey|mel\s*\(processo\)/.test(t)) c.processo = 'honey';
    else if (/lavado|despolpad|washed/.test(t)) c.processo = 'lavado';
    else if (/descafeinad/.test(t)) c.processo = 'descafeinado';
    else if (/natural/.test(t)) c.processo = 'natural';
    const tm = t.match(/torra\s*[:\-]?\s*(media[\s\-]*clara|clara[\s\-]*media|media[\s\-]*escura|clara|media|escura)/);
    if (tm) { const v = tm[1].replace(/[\s\-]+/g, '-'); c.torra = v === 'clara-media' ? 'media-clara' : v; }
    const vs = VARIEDADES.find((v) => t.includes(semAcento(v)));
    if (vs) c.variedade = vs === 'Gesha' ? 'Geisha' : vs;
    if (/conilon|robusta|canephora/.test(t)) c.especie = 'canephora'; else if (/blend/.test(t)) c.especie = 'blend';
    const alt = t.match(/(?:altitude|alt\.?)\s*[:\-]?\s*(\d{3,4})(?:\s*(?:a|-|–)\s*(\d{3,4}))?\s*m/) || t.match(/(\d{3,4})\s*(?:m|metros)\b/);
    if (alt) { const a = +alt[1], b = alt[2] ? +alt[2] : a; const v = Math.round((a + b) / 2); if (v >= 200 && v <= 2500) c.altitude = v; }
    const pt = t.match(/(?:pontuacao|sca)\s*[:\-]?\s*(\d{2}(?:[.,]\d{1,2})?\+?)(?!\d)/) || t.match(/(?:^|[^\d\/.])(\d{2}(?:[.,]\d{1,2})?\+?)\s*(?:pts|pontos)\b/);
    if (pt) c.pontuacao = pt[1].replace(',', '.');
    const dt = t.match(/torra[^0-9]{0,20}(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/) || t.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2}|\d{2})\b/);
    if (dt) { let [d, m, y] = [+dt[1], +dt[2], +dt[3]]; if (y < 100) y += 2000; if (d <= 31 && m <= 12) c.dataTorra = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
    const prod = linhas.find((l) => /produtor|fazenda|s[ií]tio|produzido por/i.test(l));
    if (prod) c.produtor = prod.replace(/^(produtor(a)?|produzido por)\s*[:\-]?\s*/i, '').slice(0, 80);
    const extra = { 'maracuja': 'frutas tropicais', 'manga': 'frutas tropicais', 'caja': 'frutas tropicais', 'morango': 'frutas vermelhas', 'cereja': 'frutas vermelhas', 'amora': 'frutas vermelhas', 'jabuticaba': 'frutas vermelhas', 'chocolate ao leite': 'chocolate', 'cacau': 'cacau', 'doce de leite': 'caramelo', 'melaco': 'melado', 'acucar mascavo': 'rapadura', 'castanha': 'castanhas', 'amendoa': 'nozes', 'avela': 'nozes', 'canela': 'especiarias', 'cravo': 'especiarias', 'jasmim': 'floral', 'rosa': 'floral', 'limao': 'limão', 'tangerina': 'laranja', 'pessego': 'pêssego' };
    DB.descritores.forEach((d) => { if (d !== 'fermentado' && t.includes(semAcento(d)) && !c.notas.includes(d)) c.notas.push(d); });
    Object.entries(extra).forEach(([k, d]) => { if (t.includes(k) && !c.notas.includes(d)) c.notas.push(d); });
    const notasLinha = linhas.find((l) => /notas?\s*(sensoria|de\s)|sabor/i.test(l));
    if (notasLinha) c.obs = 'Rótulo: ' + notasLinha.slice(0, 160);
    return c;
  }

  /* ---------- API pública ---------- */
  async function ler(file, progresso) {
    progresso = progresso || (() => {});
    const img = await carregarImagem(file);
    if (getKey()) return lerComClaude(redimensionar(img, 1568, false), progresso);
    return lerComOCR(redimensionar(img, 2000, true), progresso);
  }

  /* ---------- cartão nos ajustes ---------- */
  function cardAjustes(root) {
    const lab = window.CafeLab;
    const div = document.createElement('div');
    div.className = 'card'; div.style.marginTop = '12px';
    const tem = !!getKey();
    div.innerHTML = `<h3>📷 Leitura de rótulos por IA</h3>
      <p class="text-2">Com uma chave da API da Anthropic, a foto do pacote é lida pelo Claude e o cadastro do grão é preenchido automaticamente. Sem chave, o app usa um OCR local (menos preciso). A chave fica salva só neste aparelho, não vai para o backup e é enviada apenas para api.anthropic.com. Cada leitura consome créditos da sua conta Anthropic.</p>
      <label class="field"><span class="lbl">Chave da API ${tem ? '<span class="badge ok">configurada</span>' : ''}</span><input type="password" id="apiKey" placeholder="${tem ? '•••••••• (deixe em branco para manter)' : 'sk-ant-…'}" autocomplete="off"></label>
      <label class="field"><span class="lbl">Modelo</span><select id="apiModel">${MODELOS.map((m) => `<option value="${m.id}" ${m.id === getModel() ? 'selected' : ''}>${m.nome}</option>`).join('')}</select></label>
      <div class="row"><button class="btn primary sm" id="apiSave">Salvar</button>${tem ? '<button class="btn sm danger" id="apiDel">Remover chave</button>' : ''}</div>`;
    root.appendChild(div);
    div.querySelector('#apiSave').onclick = () => { const k = div.querySelector('#apiKey').value.trim(); if (k) lsSet(KEY_API, k); lsSet(KEY_MODEL, div.querySelector('#apiModel').value); lab.toast('Configuração da IA salva'); lab.render(); };
    const del = div.querySelector('#apiDel'); if (del) del.onclick = () => { lsSet(KEY_API, ''); lab.toast('Chave removida'); lab.render(); };
  }
  window.CafeLab.hooks.ajustes.push(cardAjustes);

  window.CafeRotulo = { ler, interpretar, SCHEMA, temChave: () => !!getKey() };
})();
