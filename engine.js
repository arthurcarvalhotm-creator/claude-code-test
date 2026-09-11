/* =====================================================================
 * Laboratório de Cafeteria — Motor de diagnóstico e recomendação
 * Regras determinísticas (sem rede): parte do banco nativo e converge
 * usando o histórico real do grão × método × moedor.
 * ===================================================================== */
window.Engine = (function () {
  'use strict';
  const DB = window.CAFE_DB;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;
  const isPressao = (m) => m.id === 'espresso' || m.id === 'moka';
  const isEspresso = (m) => m.id === 'espresso';

  /* Arredonda para o passo do moedor (ex.: 0,5 ou 0,33) */
  function snap(grinder, clicks) {
    const passo = Number(grinder && grinder.passo) || 1;
    const min = Number(grinder && grinder.min) || 0;
    const max = Number(grinder && grinder.max) || 40;
    const s = Math.round((clicks - min) / passo) * passo + min;
    return clamp(Math.round(s * 100) / 100, min, max);
  }

  /* Tamanho de um "ajuste padrão" em cliques para este moedor/método */
  function passoAjuste(grinder, method) {
    const min = Number(grinder.min) || 0, max = Number(grinder.max) || 40;
    const passo = Number(grinder.passo) || 1;
    const span = max - min;
    let base = isEspresso(method) ? span / 36 : span / 18;
    if (grinder.passoAjuste) base = Number(grinder.passoAjuste) * (isEspresso(method) ? 0.5 : 1);
    base = Math.max(passo, Math.round(base / passo) * passo);
    return Math.round(base * 100) / 100;
  }

  /* Converte um descritor de moagem (1–7 ± offset) em cliques */
  function clicksForMethod(grinder, method, offsetSteps) {
    const off = offsetSteps || 0;
    const min = Number(grinder.min) || 0, max = Number(grinder.max) || 40;
    const refs = grinder.refs || {};
    let base;
    if (refs[method.id] != null && refs[method.id] !== '') base = Number(refs[method.id]);
    else {
      // interpola pela escala 1–7
      base = min + (max - min) * ((method.grind - 0.5) / 7);
    }
    // um "passo" de descritor: 1/12 da escala em filtrados; espresso é muito mais sensível (1/30)
    const stepClicks = (max - min) / (isEspresso(method) ? 30 : 12);
    const sinal = grinder.direcao === 'maior=fino' ? -1 : 1; // padrão: menor número = mais fino
    return snap(grinder, base + sinal * off * stepClicks);
  }

  /* ---------- Ponto de partida para um grão novo ---------- */
  function startingPoint(bean, method, grinder) {
    const torra = DB.torra[bean.torra] || DB.torra['media'];
    const proc = DB.processo[bean.processo] || DB.processo['cereja-descascado'];
    const reg = DB.regiao[bean.regiao] || DB.regiao['outra'];
    const acidez = Number(bean.acidez || reg.acidez || 3);
    const corpo = Number(bean.corpo || reg.corpo || 3);
    const canephora = reg.id === 'conilon-capixaba' || reg.id === 'rondonia' || bean.especie === 'canephora';
    const por = [];

    // razão
    let ratio;
    if (isEspresso(method)) {
      ratio = torra.base.ratioEspresso + proc.ajuste.ratio * 0.15;
      if (acidez >= 4) { ratio += 0.2; por.push('Acidez alta: razão de espresso mais longa para abrir doçura.'); }
      if (corpo >= 4 && acidez <= 2) { ratio -= 0.1; por.push('Perfil encorpado: razão levemente mais curta preserva textura.'); }
      if (canephora) { ratio -= 0.15; por.push('Canephora: razão curta (1:1,8–1:2).'); }
    } else if (method.id === 'moka' || method.id === 'cold-brew') {
      ratio = method.ratio.padrao;
    } else {
      const offsetTorra = torra.base.ratioFiltro - 16; // referência V60 1:16
      ratio = method.ratio.padrao + offsetTorra + proc.ajuste.ratio;
      if (acidez >= 4) { ratio += 0.5; por.push('Acidez alta: razão um pouco mais longa (mais clareza).'); }
      if (corpo >= 4) { ratio -= 0.5; por.push('Corpo alto: razão um pouco mais curta sustenta o corpo.'); }
      if (canephora) { ratio -= 1; por.push('Canephora: razão mais curta e temperatura menor.'); }
    }
    ratio = clamp(ratio, method.ratio.min, method.ratio.max);
    if (proc.ajuste.ratio) por.push(`Processo ${proc.nome.split(' (')[0]}: ${proc.ajuste.ratio > 0 ? 'razão mais longa' : 'razão mais curta'}.`);

    // temperatura
    let tempC;
    if (method.id === 'cold-brew') tempC = method.tempC.padrao;
    else if (isEspresso(method)) tempC = torra.base.espressoTempC + proc.ajuste.tempC * 0.5;
    else tempC = torra.base.filtroTempC + proc.ajuste.tempC + (method.tempC.padrao - 93);
    if (acidez >= 4 && !isPressao(method) && method.id !== 'cold-brew') tempC += 0.5;
    if (canephora) tempC -= 2;
    tempC = clamp(Math.round(tempC * 2) / 2, method.tempC.min, method.tempC.max);
    por.push(`Torra ${torra.nome.toLowerCase()}: base de ${isEspresso(method) ? torra.base.espressoTempC : torra.base.filtroTempC} °C${proc.ajuste.tempC ? ` (${proc.ajuste.tempC > 0 ? '+' : ''}${proc.ajuste.tempC} °C pelo processo)` : ''}.`);

    // moagem
    let moagemOff = torra.base.moagem + proc.ajuste.moagem;
    if (canephora) moagemOff += 0.5;
    if (corpo >= 4 && (method.id === 'v60' || method.id === 'prensa-francesa')) { moagemOff += 0.25; }
    const clicks = grinder ? clicksForMethod(grinder, method, moagemOff) : null;
    if (moagemOff !== 0) por.push(`Moagem ${moagemOff > 0 ? 'mais grossa' : 'mais fina'} que o padrão do método (${r2(Math.abs(moagemOff))} passo).`);

    // dose / água
    const dose = bean.dosePadrao || method.dosePadrao;
    const water = isEspresso(method) ? r1(dose * ratio) : Math.round(dose * ratio);

    // descanso
    let descanso = null;
    if (bean.dataTorra) {
      const dias = Math.floor((Date.now() - new Date(bean.dataTorra).getTime()) / 86400000);
      const faixa = torra.descansoDias[isPressao(method) ? 'espresso' : 'filtrado'];
      descanso = { dias, faixa, ok: dias >= faixa[0] && dias <= faixa[1] * 2 };
      if (dias < faixa[0]) por.push(`Grão com ${dias} dia(s) de torra: ainda desgaseificando (ideal ${faixa[0]}–${faixa[1]} dias). Espere resultados instáveis; moa 1 passo mais grosso e faça bloom mais longo.`);
      else if (dias > faixa[1] * 2) por.push(`Grão com ${dias} dias de torra: já passou do pico (${faixa[0]}–${faixa[1]} dias). Moa um pouco mais fino e use +1 °C.`);
    }

    return { ratio: r2(ratio), tempC, clicks, dose, water, tempoS: method.tempoS.padrao, moagemOff, por, descanso, torra, proc, reg };
  }

  /* ---------- Rendimento de extração (EY) ---------- */
  function ey(brew, method) {
    const tds = Number(brew.tds);
    if (!tds || !brew.dose) return null;
    const bebida = isEspresso(method) ? Number(brew.yieldG || brew.water) : Number(brew.water) * 0.87; // filtrados: ~13 % retido no pó
    if (!bebida) return null;
    return r1(tds * bebida / Number(brew.dose));
  }

  /* ---------- Diagnóstico de uma extração ----------
   * indice ∈ [-1, 1]: negativo = sub-extração, positivo = sobre-extração
   * forca  ∈ [-1, 1]: negativo = fraco/diluído, positivo = forte demais  */
  function diagnose(brew, method) {
    let sub = 0, sobre = 0, forca = 0, ferm = 0;
    const fatores = [];
    const flags = brew.sinais || [];
    flags.forEach(id => {
      const s = DB.sinal[id]; if (!s) return;
      if (s.tipo === 'sub') { sub += s.peso; fatores.push({ t: s.nome, v: -s.peso }); }
      else if (s.tipo === 'sobre') { sobre += s.peso; fatores.push({ t: s.nome, v: +s.peso }); }
      else if (s.tipo === 'forca-baixa') { forca -= 1; fatores.push({ t: s.nome, v: 0, forca: -1 }); }
      else if (s.tipo === 'forca-alta') { forca += 1; fatores.push({ t: s.nome, v: 0, forca: +1 }); }
      else if (s.tipo === 'processo') { ferm += 1; fatores.push({ t: s.nome, v: 0, processo: true }); }
    });

    // sliders 1–5
    const ac = Number(brew.acidez) || 3, doc = Number(brew.docura) || 3, am = Number(brew.amargor) || 3;
    const corpo = Number(brew.corpo) || 3, fim = Number(brew.final) || 3;
    if (ac >= 4 && doc <= 2) { sub += 0.6; fatores.push({ t: 'Acidez alta com doçura baixa', v: -0.6 }); }
    if (am >= 4 && doc <= 2) { sobre += 0.6; fatores.push({ t: 'Amargor alto com doçura baixa', v: +0.6 }); }
    if (am >= 4 && ac <= 2) { sobre += 0.3; fatores.push({ t: 'Amargor domina a acidez', v: +0.3 }); }
    if (ac >= 4 && am <= 2 && doc <= 3) { sub += 0.3; fatores.push({ t: 'Acidez domina sem doçura', v: -0.3 }); }
    if (corpo <= 2 && fim <= 2) { sub += 0.3; forca -= 0.3; fatores.push({ t: 'Corpo leve e final curto', v: -0.3, forca: -0.3 }); }
    if (corpo >= 5 && am >= 4) { sobre += 0.2; forca += 0.3; fatores.push({ t: 'Muito corpo e amargor', v: +0.2, forca: +0.3 }); }

    // tempo vs faixa do método
    const t = Number(brew.tempoS);
    if (t && method.tempoS && method.id !== 'cold-brew') {
      const { min, max } = method.tempoS;
      if (t < min) { const d = clamp((min - t) / (max - min), 0, 1); sub += 0.5 * d; fatores.push({ t: `Tempo ${fmtTempo(t)} abaixo da faixa (${fmtTempo(min)}–${fmtTempo(max)})`, v: -0.5 * d, tempo: -1 }); }
      if (t > max) { const d = clamp((t - max) / (max - min), 0, 1); sobre += 0.5 * d; fatores.push({ t: `Tempo ${fmtTempo(t)} acima da faixa (${fmtTempo(min)}–${fmtTempo(max)})`, v: +0.5 * d, tempo: +1 }); }
    }

    // EY
    const e = ey(brew, method);
    if (e != null) {
      const lo = isEspresso(method) ? 18 : 18.5, hi = isEspresso(method) ? 23 : 22.5;
      if (e < lo) { const d = clamp((lo - e) / 3, 0, 1); sub += 0.7 * d; fatores.push({ t: `EY ${e} % abaixo de ${lo} %`, v: -0.7 * d }); }
      if (e > hi) { const d = clamp((e - hi) / 3, 0, 1); sobre += 0.7 * d; fatores.push({ t: `EY ${e} % acima de ${hi} %`, v: +0.7 * d }); }
    }
    const tds = Number(brew.tds);
    if (tds) {
      const lo = isEspresso(method) ? 8 : 1.2, hi = isEspresso(method) ? 12 : 1.5;
      if (tds < lo) { forca -= 0.5; fatores.push({ t: `TDS ${tds} % baixo`, v: 0, forca: -0.5 }); }
      if (tds > hi) { forca += 0.5; fatores.push({ t: `TDS ${tds} % alto`, v: 0, forca: +0.5 }); }
    }

    const indice = clamp((sobre - sub) / 1.6, -1, 1);
    forca = clamp(forca, -1, 1);
    let rotulo, cor;
    if (indice <= -0.55) { rotulo = 'Sub-extração clara'; cor = 'sub'; }
    else if (indice <= -0.2) { rotulo = 'Leve sub-extração'; cor = 'sub'; }
    else if (indice >= 0.55) { rotulo = 'Sobre-extração clara'; cor = 'sobre'; }
    else if (indice >= 0.2) { rotulo = 'Leve sobre-extração'; cor = 'sobre'; }
    else { rotulo = 'Extração equilibrada'; cor = 'ok'; }
    if (sub > 0.6 && sobre > 0.6) { rotulo = 'Sub e sobre ao mesmo tempo (canal / moagem irregular)'; cor = 'misto'; }
    return { indice: r2(indice), forca: r2(forca), ferm, rotulo, cor, fatores, ey: e, misto: sub > 0.6 && sobre > 0.6 };
  }

  /* ---------- Recomendação para a próxima extração ----------
   * history: extrações anteriores do mesmo grão × método × moedor, ordem
   * cronológica, já com .diag calculado; brew: a atual (última). */
  function recommend(brew, history, method, grinder, bean) {
    const diag = brew.diag || diagnose(brew, method);
    const acoes = [];
    const prox = {
      clicks: brew.clicks != null ? Number(brew.clicks) : null,
      ratio: Number(brew.ratio), tempC: Number(brew.tempC), dose: Number(brew.dose),
      water: Number(brew.water), tempoS: method.tempoS.padrao
    };
    const step = grinder ? passoAjuste(grinder, method) : 1;
    const dirFino = grinder && grinder.direcao === 'maior=fino' ? +1 : -1; // sinal em cliques para "mais fino"
    const prev = history.length ? history[history.length - 1] : null;
    const score = Number(brew.nota) || 0;
    let status = 'ajustando';
    let confianca = 0.5 + Math.min(0.4, history.length * 0.1);

    // 1. Misto: canalização/moagem irregular
    if (diag.misto) {
      acoes.push({ alvo: 'técnica', txt: 'Sinais de sub e sobre juntos: provável canalização ou moagem irregular. Mantenha a moagem, melhore a distribuição (WDT/nivelamento), despejo mais suave e verifique finos. Se persistir, moa 1 passo mais grosso.' });
    }

    // 2. Extração (moagem como alavanca principal)
    let deltaClicks = 0;
    if (!diag.misto && Math.abs(diag.indice) >= 0.2 && grinder && prox.clicks != null) {
      let mag = Math.abs(diag.indice) * 2 * step;         // |indice| 1 → 2 passos
      mag = Math.max(Number(grinder.passo) || 1, mag);
      // bissecção / aceleração usando a extração anterior
      if (prev && prev.diag && prev.clicks != null && Number(prev.clicks) !== prox.clicks) {
        const flip = Math.sign(prev.diag.indice) !== 0 && Math.sign(prev.diag.indice) !== Math.sign(diag.indice);
        const moved = Math.abs(Number(prev.clicks) - prox.clicks);
        if (flip) {
          // passou do ponto: volte ao meio, ponderado pelos índices
          const w = Math.abs(diag.indice) / (Math.abs(diag.indice) + Math.abs(prev.diag.indice) || 1);
          const alvo = prox.clicks + (Number(prev.clicks) - prox.clicks) * w;
          mag = Math.abs(alvo - prox.clicks);
          confianca += 0.1;
          acoes.push({ alvo: 'nota', txt: `A extração anterior estava do lado oposto (${prev.diag.rotulo.toLowerCase()}). O ponto ideal está entre ${fmtClicks(prev.clicks)} e ${fmtClicks(prox.clicks)} cliques: bissecção.` });
        } else if (Math.sign(prev.diag.indice) === Math.sign(diag.indice) && Math.abs(diag.indice) >= Math.abs(prev.diag.indice) - 0.1) {
          // mesmo problema com magnitude parecida: acelere
          mag = Math.max(mag, Math.min(moved * 1.5, step * 4));
          acoes.push({ alvo: 'nota', txt: 'O ajuste anterior não foi suficiente: passo maior desta vez.' });
        }
      }
      // sub-extração → mais fino; sobre → mais grosso
      const sentido = diag.indice < 0 ? dirFino : -dirFino;
      const novo = snap(grinder, prox.clicks + sentido * mag);
      deltaClicks = Math.round((novo - prox.clicks) * 100) / 100;
      if (deltaClicks !== 0) {
        acoes.push({ alvo: 'moagem', de: prox.clicks, para: novo, delta: deltaClicks,
          txt: `${diag.indice < 0 ? 'Moa mais fino' : 'Moa mais grosso'}: ${fmtClicks(prox.clicks)} → ${fmtClicks(novo)} cliques (${deltaClicks > 0 ? '+' : ''}${fmtClicks(deltaClicks)}).` });
        prox.clicks = novo;
      } else {
        acoes.push({ alvo: 'temperatura', txt: `Moedor no limite da escala: use a temperatura (${diag.indice < 0 ? '+1,5 °C' : '−1,5 °C'}).` });
        prox.tempC = clamp(prox.tempC + (diag.indice < 0 ? 1.5 : -1.5), method.tempC.min, method.tempC.max);
      }
    } else if (!diag.misto && Math.abs(diag.indice) >= 0.2 && (!grinder || prox.clicks == null)) {
      acoes.push({ alvo: 'moagem', txt: `${diag.indice < 0 ? 'Moa mais fino' : 'Moa mais grosso'} (cadastre o moedor e os cliques para receber o número exato).` });
    }

    // 3. Temperatura como alavanca secundária (quando o ajuste é leve e a moagem já foi mexida)
    if (!diag.misto && Math.abs(diag.indice) >= 0.2 && Math.abs(diag.indice) < 0.5 && prev && prev.clicks != null && Number(prev.clicks) !== Number(brew.clicks) && method.id !== 'cold-brew') {
      const dT = diag.indice < 0 ? 1 : -1;
      const novaT = clamp(prox.tempC + dT, method.tempC.min, method.tempC.max);
      if (novaT !== prox.tempC) {
        acoes.push({ alvo: 'temperatura', de: prox.tempC, para: novaT, txt: `Ajuste fino: temperatura ${prox.tempC} → ${novaT} °C.` });
        prox.tempC = novaT;
      }
    }

    // 4. Processo / fermentado
    if (diag.ferm) {
      const novaT = clamp(prox.tempC - 2, method.tempC.min, method.tempC.max);
      acoes.push({ alvo: 'temperatura', de: prox.tempC, para: novaT, txt: `Nota fermentada é do lote, não da moagem: baixe a temperatura (${prox.tempC} → ${novaT} °C) e alongue a razão.` });
      prox.tempC = novaT;
      if (!isPressao(method)) prox.ratio = clamp(prox.ratio + 0.5, method.ratio.min, method.ratio.max);
    }

    // 5. Força → razão (só quando o sinal é explícito ou a extração já está quase no ponto:
    //    uma variável por vez evita mascarar o efeito da moagem)
    const forcaExplicita = (brew.sinais || []).some((s) => s === 'fraco' || s === 'forte');
    if (Math.abs(diag.forca) >= 0.3 && (forcaExplicita || Math.abs(diag.indice) < 0.5)) {
      const passoRatio = isEspresso(method) ? 0.2 : (method.id === 'moka' ? 0.5 : 1);
      const dr = diag.forca < 0 ? -passoRatio : +passoRatio; // fraco → menos água
      const nova = clamp(r2(prox.ratio + dr), method.ratio.min, method.ratio.max);
      if (nova !== prox.ratio) {
        acoes.push({ alvo: 'razão', de: prox.ratio, para: nova, txt: `${diag.forca < 0 ? 'Fraco' : 'Intenso demais'}: razão 1:${prox.ratio} → 1:${nova} (mesma dose de ${prox.dose} g${isEspresso(method) ? `, bebida ${r1(prox.dose * nova)} g` : `, água ${Math.round(prox.dose * nova)} g`}).` });
        prox.ratio = nova;
      }
    }

    // 6. Tempo alvo / espresso: tempo é o termômetro
    if (isEspresso(method)) {
      const t = Number(brew.tempoS);
      if (t && (t < method.tempoS.min || t > method.tempoS.max) && Math.abs(diag.indice) < 0.2) {
        acoes.push({ alvo: 'nota', txt: `Tempo ${t} s fora da faixa (${method.tempoS.min}–${method.tempoS.max} s), mas a xícara está boa: priorize o sabor. Se quiser padronizar, ${t < method.tempoS.min ? 'feche' : 'abra'} ${fmtClicks(step)} clique(s) e reavalie.` });
      }
    }

    // 7. Status
    if (!diag.misto && Math.abs(diag.indice) < 0.2 && Math.abs(diag.forca) < 0.3 && !diag.ferm) {
      if (score >= 8) { status = 'calibrado'; acoes.unshift({ alvo: 'ok', txt: `Receita calibrada (nota ${score}). Repita: ${fmtReceita(prox, method)}. Registre variações de ±1 °C apenas se quiser explorar.` }); }
      else if (score > 0) { acoes.unshift({ alvo: 'ok', txt: `Extração equilibrada mas nota ${score}. Provável limite do grão/torra: experimente ±1 °C ou razão ±0,5 para explorar doçura, sem mexer na moagem.` }); }
      else acoes.unshift({ alvo: 'ok', txt: 'Extração equilibrada. Repita a receita e dê uma nota para consolidar a calibração.' });
    }

    prox.water = isEspresso(method) ? r1(prox.dose * prox.ratio) : Math.round(prox.dose * prox.ratio);
    return { diag, acoes, prox, status, confianca: r2(clamp(confianca, 0, 0.95)), deltaClicks };
  }

  /* ---------- Receita de despejos escalada para dose × água ---------- */
  function receita(method, dose, water) {
    const r = DB.receitas[method.id];
    if (!r) return null;
    const total = Number(water) || Math.round((Number(dose) || method.dosePadrao) * method.ratio.padrao);
    let prev = 0;
    const etapas = r.etapas.map((e, i) => {
      const acumulado = isEspresso(method) ? r1(total * e.agua) : Math.round(total * e.agua);
      const despejo = Math.max(0, Math.round((acumulado - prev) * 10) / 10);
      prev = acumulado;
      return { n: i + 1, t: e.t, acumulado, despejo, desc: e.desc };
    });
    return { nome: r.nome, etapas, total };
  }

  /* ---------- Estado de calibração de um grão ---------- */
  function calibration(brews) {
    const n = brews.length;
    if (!n) return { tentativas: 0, status: 'novo', melhor: null };
    const melhor = brews.reduce((a, b) => (Number(b.nota) || 0) > (Number(a.nota) || 0) ? b : a, brews[0]);
    const ultimo = brews[n - 1];
    const ok = ultimo.diag && Math.abs(ultimo.diag.indice) < 0.2 && (Number(ultimo.nota) || 0) >= 8;
    const first8 = brews.findIndex(b => (Number(b.nota) || 0) >= 8 && b.diag && Math.abs(b.diag.indice) < 0.2);
    return { tentativas: n, status: ok ? 'calibrado' : 'ajustando', melhor, tentativasAteCalibrar: first8 >= 0 ? first8 + 1 : null };
  }

  /* ---------- formatação ---------- */
  function fmtTempo(s) {
    s = Math.round(Number(s) || 0);
    if (s >= 3600) return `${(s / 3600).toFixed(1)} h`;
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60), r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }
  function fmtClicks(c) { c = Number(c); return Number.isInteger(c) ? String(c) : c.toFixed(2).replace(/\.?0+$/, ''); }
  function fmtReceita(p, method) {
    const parts = [];
    if (p.clicks != null) parts.push(`${fmtClicks(p.clicks)} cliques`);
    parts.push(`${p.dose} g → ${isEspresso(method) ? p.water + ' g de bebida' : p.water + ' g de água'} (1:${p.ratio})`);
    if (method.id !== 'cold-brew') parts.push(`${p.tempC} °C`);
    return parts.join(' · ');
  }

  return { startingPoint, diagnose, recommend, calibration, ey, receita, clicksForMethod, passoAjuste, snap, fmtTempo, fmtClicks, fmtReceita, isEspresso, isPressao };
})();
