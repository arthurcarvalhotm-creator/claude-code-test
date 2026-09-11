/* =====================================================================
 * Laboratório de Cafeteria — Banco de dados nativo
 * Terroirs brasileiros, processos, torras e métodos com parâmetros de
 * partida. Valores são referências de bancada (não regras absolutas):
 * o motor de recomendação parte deles e ajusta com o histórico real.
 * ===================================================================== */
window.CAFE_DB = (function () {
  'use strict';

  /* ---------- Regiões produtoras (terroir) ---------- */
  const regioes = [
    {
      id: 'cerrado-mineiro', nome: 'Cerrado Mineiro', uf: 'MG',
      altitude: [800, 1300], clima: 'Estações bem definidas: chuva no verão, inverno seco e ensolarado (colheita e secagem em clima seco). Primeira Denominação de Origem de café do Brasil.',
      perfil: 'Corpo cheio, doçura alta, acidez média a média-baixa. Chocolate, caramelo, nozes, frutas amarelas maduras.',
      notas: ['chocolate', 'caramelo', 'nozes', 'frutas amarelas', 'mel'],
      acidez: 2, corpo: 4, docura: 4, // escala 1–5
      variedades: ['Mundo Novo', 'Catuaí', 'Topázio', 'Bourbon Amarelo', 'Arara'],
      processos: ['natural', 'cereja-descascado', 'honey', 'anaerobico'],
      metodos: ['espresso', 'prensa-francesa', 'v60', 'coador-pano', 'moka'],
      dica: 'Naturais do Cerrado brilham em espresso e prensa. Em V60, um ponto de moagem mais grosso que o padrão preserva a doçura e evita adstringência.'
    },
    {
      id: 'sul-de-minas', nome: 'Sul de Minas', uf: 'MG',
      altitude: [850, 1400], clima: 'Temperaturas amenas (18–22 °C), relevo ondulado, chuvas bem distribuídas. Maior região produtora do país.',
      perfil: 'Equilíbrio e versatilidade: corpo médio, doçura de caramelo, acidez cítrica moderada, chocolate ao leite e frutas amarelas.',
      notas: ['caramelo', 'chocolate ao leite', 'laranja', 'frutas amarelas', 'castanhas'],
      acidez: 3, corpo: 3, docura: 4,
      variedades: ['Catuaí', 'Mundo Novo', 'Bourbon', 'Acaiá', 'Icatu', 'Catucaí'],
      processos: ['natural', 'cereja-descascado', 'lavado', 'honey'],
      metodos: ['v60', 'kalita', 'melitta', 'espresso', 'aeropress', 'prensa-francesa'],
      dica: 'Café "coringa": funciona em quase todo método. Boa base para calibrar um moedor novo, pois responde de forma previsível a mudanças de moagem.'
    },
    {
      id: 'mantiqueira', nome: 'Mantiqueira de Minas', uf: 'MG',
      altitude: [900, 1500], clima: 'Montanhoso, noites frias, maturação lenta. Indicação de Procedência; berço de muitos campeões do Cup of Excellence.',
      perfil: 'Acidez brilhante e complexa, doçura intensa, corpo sedoso. Frutas vermelhas, pêssego, florais, caramelo.',
      notas: ['frutas vermelhas', 'pêssego', 'floral', 'caramelo', 'cítrico'],
      acidez: 4, corpo: 3, docura: 4,
      variedades: ['Bourbon Amarelo', 'Catuaí', 'Mundo Novo', 'Catucaí', 'Arara'],
      processos: ['natural', 'cereja-descascado', 'lavado', 'anaerobico', 'honey'],
      metodos: ['v60', 'kalita', 'chemex', 'aeropress', 'clever'],
      dica: 'Prefira filtrados com água mais quente (94–96 °C) em torras claras para abrir a acidez frutada. Espresso pede razão mais longa (1:2,3+).'
    },
    {
      id: 'matas-de-minas', nome: 'Matas de Minas', uf: 'MG',
      altitude: [600, 1200], clima: 'Zona da Mata: quente e úmido, relevo acidentado, lavouras familiares em montanha. Secagem exige cuidado (umidade).',
      perfil: 'Doçura marcante, corpo médio, acidez cítrica/málica, frutas amarelas e maçã, chocolate.',
      notas: ['frutas amarelas', 'maçã', 'chocolate', 'rapadura', 'cítrico'],
      acidez: 3, corpo: 3, docura: 4,
      variedades: ['Catuaí', 'Catucaí', 'Mundo Novo', 'Bourbon'],
      processos: ['natural', 'cereja-descascado', 'lavado'],
      metodos: ['v60', 'melitta', 'coador-pano', 'kalita', 'espresso'],
      dica: 'Naturais com boa secagem trazem rapadura e frutas. Se aparecer nota de fermentado excessivo, baixe 1–2 °C e alongue ligeiramente a razão.'
    },
    {
      id: 'chapada-de-minas', nome: 'Chapada de Minas', uf: 'MG',
      altitude: [800, 1100], clima: 'Vale do Jequitinhonha e Mucuri, planaltos, clima quente com estação seca definida; irrigação frequente.',
      perfil: 'Corpo médio a cheio, chocolate, cítrico leve, doçura de cana.',
      notas: ['chocolate', 'cana', 'cítrico leve', 'amêndoa'],
      acidez: 2, corpo: 4, docura: 3,
      variedades: ['Catuaí', 'Mundo Novo', 'Topázio'],
      processos: ['natural', 'cereja-descascado'],
      metodos: ['espresso', 'prensa-francesa', 'moka', 'melitta'],
      dica: 'Perfil de base para espresso e bebidas com leite. Em filtrados, razão 1:15 sustenta o corpo.'
    },
    {
      id: 'alta-mogiana', nome: 'Alta Mogiana', uf: 'SP',
      altitude: [900, 1100], clima: 'Nordeste paulista (Franca, Pedregulho, Altinópolis). Terra roxa, estações bem definidas; Indicação de Procedência.',
      perfil: 'Corpo denso e cremoso, doçura alta, acidez cítrica média. Chocolate amargo, caramelo, castanhas, laranja.',
      notas: ['chocolate amargo', 'caramelo', 'castanhas', 'laranja', 'baunilha'],
      acidez: 3, corpo: 4, docura: 4,
      variedades: ['Mundo Novo', 'Catuaí', 'Bourbon', 'Obatã', 'Icatu'],
      processos: ['natural', 'cereja-descascado', 'honey', 'anaerobico'],
      metodos: ['espresso', 'v60', 'prensa-francesa', 'aeropress', 'moka'],
      dica: 'Referência clássica de espresso brasileiro: 1:2 em 26–30 s. Em V60, moa um passo mais grosso para não pesar a xícara.'
    },
    {
      id: 'media-mogiana', nome: 'Média Mogiana', uf: 'SP',
      altitude: [700, 1000], clima: 'Entre Campinas e Ribeirão Preto (Espírito Santo do Pinhal, Mococa). Mais quente que a Alta Mogiana.',
      perfil: 'Suave e doce, corpo médio, acidez baixa-média. Nozes, chocolate ao leite, caramelo.',
      notas: ['nozes', 'chocolate ao leite', 'caramelo', 'cereal doce'],
      acidez: 2, corpo: 3, docura: 4,
      variedades: ['Catuaí', 'Mundo Novo', 'Obatã'],
      processos: ['natural', 'cereja-descascado'],
      metodos: ['melitta', 'coador-pano', 'prensa-francesa', 'espresso', 'moka'],
      dica: 'Perfil de café "do dia a dia" muito estável. Bom para começar a usar temperatura mais baixa (90–92 °C) sem perder doçura.'
    },
    {
      id: 'montanhas-es', nome: 'Montanhas do Espírito Santo', uf: 'ES',
      altitude: [700, 1300], clima: 'Serra capixaba (Venda Nova, Afonso Cláudio, Castelo). Frio e úmido; lavouras de montanha, colheita manual. Arábica.',
      perfil: 'Acidez cítrica/málica viva, corpo médio, florais, frutas amarelas e tropicais, doçura de mel.',
      notas: ['floral', 'mel', 'frutas tropicais', 'maçã verde', 'cítrico'],
      acidez: 4, corpo: 3, docura: 3,
      variedades: ['Catuaí', 'Catucaí', 'Bourbon', 'Arara', 'Acauã'],
      processos: ['lavado', 'cereja-descascado', 'natural', 'anaerobico'],
      metodos: ['v60', 'chemex', 'kalita', 'aeropress', 'clever'],
      dica: 'Lavados capixabas pedem V60/Chemex com água 94–96 °C. Se ficar ácido demais, feche um pouco a moagem antes de mexer na temperatura.'
    },
    {
      id: 'conilon-capixaba', nome: 'Conilon Capixaba (Canephora)', uf: 'ES',
      altitude: [0, 500], clima: 'Litoral e baixadas do ES, quente. Maior produtor de canephora (conilon) do país; conilons finos em ascensão.',
      perfil: 'Corpo pesado, amargor estruturado, baixa acidez. Chocolate amargo, amendoim, cereal, madeira; conilons finos trazem cacau e frutas secas.',
      notas: ['chocolate amargo', 'amendoim', 'cereal', 'cacau', 'frutas secas'],
      acidez: 1, corpo: 5, docura: 2,
      variedades: ['Conilon (Vitória, Diamante, Jequitibá, Centenária)'],
      processos: ['natural', 'cereja-descascado', 'lavado', 'anaerobico'],
      metodos: ['espresso', 'moka', 'cold-brew', 'prensa-francesa'],
      dica: 'Extrai com facilidade: moa mais grosso que arábica no mesmo método e use temperatura 2–3 °C menor. Em espresso, razão 1:1,8–1:2 e blends 10–30 %.'
    },
    {
      id: 'chapada-diamantina', nome: 'Chapada Diamantina', uf: 'BA',
      altitude: [1000, 1300], clima: 'Planalto baiano (Piatã, Mucugê, Ibicoara). Clima ameno, noites frias, maturação lenta.',
      perfil: 'Acidez cítrica viva e elegante, doçura alta, corpo médio. Frutas amarelas, florais, caramelo, chocolate branco.',
      notas: ['frutas amarelas', 'floral', 'caramelo', 'chocolate branco', 'limão siciliano'],
      acidez: 4, corpo: 3, docura: 4,
      variedades: ['Catuaí', 'Catucaí', 'Bourbon', 'Topázio', 'Arara'],
      processos: ['natural', 'cereja-descascado', 'lavado', 'anaerobico', 'honey'],
      metodos: ['v60', 'kalita', 'chemex', 'aeropress', 'espresso'],
      dica: 'Um dos terroirs mais frutados do país. Torras claras: 95–96 °C e razão 1:16. Anaeróbicos: baixe para 92 °C.'
    },
    {
      id: 'planalto-bahia', nome: 'Planalto da Bahia (Vitória da Conquista)', uf: 'BA',
      altitude: [700, 1100], clima: 'Sudoeste baiano, planalto com clima semiárido a subúmido; muitos cafés sombreados.',
      perfil: 'Corpo médio-alto, chocolate, nozes, doçura de cana, acidez baixa.',
      notas: ['chocolate', 'nozes', 'cana', 'cereal'],
      acidez: 2, corpo: 4, docura: 3,
      variedades: ['Catuaí', 'Mundo Novo', 'Catucaí'],
      processos: ['natural', 'cereja-descascado'],
      metodos: ['espresso', 'prensa-francesa', 'melitta', 'moka'],
      dica: 'Ótimo para espresso encorpado e prensa francesa 1:13.'
    },
    {
      id: 'oeste-bahia', nome: 'Oeste da Bahia (Cerrado Baiano)', uf: 'BA',
      altitude: [700, 1000], clima: 'Barreiras/Luís Eduardo Magalhães. Cerrado irrigado (pivô central), altíssima uniformidade de maturação e secagem.',
      perfil: 'Limpo e uniforme, corpo médio-alto, doçura, chocolate, caramelo, acidez baixa-média.',
      notas: ['chocolate', 'caramelo', 'amêndoa', 'frutas amarelas'],
      acidez: 2, corpo: 4, docura: 4,
      variedades: ['Catuaí', 'Mundo Novo', 'Arara', 'Topázio'],
      processos: ['natural', 'cereja-descascado', 'honey'],
      metodos: ['espresso', 'v60', 'prensa-francesa', 'cold-brew'],
      dica: 'Uniformidade facilita a calibração: costuma convergir em 2–3 extrações.'
    },
    {
      id: 'norte-pioneiro-pr', nome: 'Norte Pioneiro do Paraná', uf: 'PR',
      altitude: [400, 1000], clima: 'Divisa com SP; terra roxa, risco de geada, clima subtropical. Indicação de Procedência.',
      perfil: 'Doçura elevada, corpo médio-alto, acidez baixa a média. Chocolate, caramelo, amendoim, frutas secas.',
      notas: ['chocolate', 'caramelo', 'amendoim', 'frutas secas', 'melado'],
      acidez: 2, corpo: 4, docura: 4,
      variedades: ['Catuaí', 'IPR 100/103', 'Mundo Novo', 'Bourbon'],
      processos: ['natural', 'cereja-descascado', 'lavado'],
      metodos: ['espresso', 'prensa-francesa', 'melitta', 'coador-pano', 'moka'],
      dica: 'Naturais paranaenses com corpo de melado: moagem um passo mais grossa em imersão para evitar excesso de corpo/adstringência.'
    },
    {
      id: 'caparao', nome: 'Caparaó', uf: 'MG/ES',
      altitude: [900, 1500], clima: 'Encostas do Pico da Bandeira, divisa MG/ES. Clima de montanha, altitude alta, produção familiar; Indicação de Procedência.',
      perfil: 'Complexidade e acidez brilhante, doçura intensa, corpo médio-cremoso. Frutas vermelhas, uva, florais, caramelo.',
      notas: ['frutas vermelhas', 'uva', 'floral', 'caramelo', 'cacau'],
      acidez: 4, corpo: 3, docura: 4,
      variedades: ['Catuaí', 'Catucaí', 'Bourbon Amarelo', 'Arara', 'Paraíso'],
      processos: ['natural', 'anaerobico', 'cereja-descascado', 'honey', 'lavado'],
      metodos: ['v60', 'kalita', 'aeropress', 'chemex', 'clever'],
      dica: 'Muitos lotes fermentados: comece em 92 °C e 1:16; se faltar doçura, feche moagem em vez de subir temperatura.'
    },
    {
      id: 'rondonia', nome: 'Matas de Rondônia (Robusta Amazônico)', uf: 'RO',
      altitude: [150, 400], clima: 'Amazônia (Cacoal, Alta Floresta). Quente e úmido; primeira IP de canephora do mundo (híbridos conilon × robusta).',
      perfil: 'Corpo cheio, doçura surpreendente para canephora, baixa acidez. Cacau, especiarias, caramelo, frutas secas, madeira nobre.',
      notas: ['cacau', 'especiarias', 'caramelo', 'frutas secas', 'madeira nobre'],
      acidez: 1, corpo: 5, docura: 3,
      variedades: ['Robustas Amazônicos (clones BRS)'],
      processos: ['natural', 'cereja-descascado', 'anaerobico', 'lavado'],
      metodos: ['espresso', 'cold-brew', 'moka', 'prensa-francesa'],
      dica: 'Como toda canephora: moagem mais grossa, temperatura 88–91 °C, razões curtas. Em cold brew entrega chocolate intenso.'
    },
    {
      id: 'outra', nome: 'Outra região / não informada', uf: '—',
      altitude: [600, 1400], clima: '—',
      perfil: 'Perfil médio brasileiro: corpo médio-alto, doçura, acidez moderada.',
      notas: ['chocolate', 'caramelo', 'frutas amarelas'],
      acidez: 3, corpo: 3, docura: 3,
      variedades: [], processos: ['natural', 'cereja-descascado', 'lavado'],
      metodos: ['v60', 'espresso', 'prensa-francesa'],
      dica: 'Preencha o perfil sensorial do grão manualmente para melhorar as sugestões.'
    }
  ];

  /* ---------- Processos de pós-colheita / secagem ---------- */
  const processos = [
    {
      id: 'natural', nome: 'Natural (secagem em terreiro / cereja inteira)',
      descricao: 'Fruto seco inteiro; a polpa fermenta e transfere açúcares. O mais tradicional no Brasil.',
      sensorial: 'Corpo alto, doçura, frutas maduras, notas vínicas; menos clareza.',
      ajuste: { tempC: -1, ratio: +0.5, moagem: +0.5 },
      dica: 'Tende a extrair rápido e a ficar pesado/adstringente se sobre-extraído. Prefira 1 °C a menos e moagem levemente mais grossa.'
    },
    {
      id: 'cereja-descascado', nome: 'Cereja Descascado (CD / pulped natural)',
      descricao: 'Casca removida mecanicamente, secagem com parte da mucilagem. Método brasileiro por excelência.',
      sensorial: 'Equilíbrio entre doçura e clareza, corpo médio, acidez limpa.',
      ajuste: { tempC: 0, ratio: 0, moagem: 0 },
      dica: 'Comportamento previsível: use como referência "neutra" de calibração.'
    },
    {
      id: 'honey', nome: 'Honey (yellow / red / black)',
      descricao: 'Variação do CD com mais mucilagem retida e secagem mais lenta (black = mais mucilagem e sombra).',
      sensorial: 'Doçura de mel/rapadura, corpo xaroposo, acidez macia.',
      ajuste: { tempC: -0.5, ratio: +0.5, moagem: +0.25 },
      dica: 'Honeys escuros (red/black) se comportam como naturais; yellow como CD.'
    },
    {
      id: 'lavado', nome: 'Lavado (via úmida / desmucilado)',
      descricao: 'Mucilagem removida por fermentação em água ou mecanicamente antes da secagem.',
      sensorial: 'Máxima clareza e acidez, corpo mais leve, florais e cítricos.',
      ajuste: { tempC: +1, ratio: +0.5, moagem: -0.25 },
      dica: 'Costuma tolerar água mais quente e moagem um pouco mais fina para extrair doçura.'
    },
    {
      id: 'anaerobico', nome: 'Fermentação anaeróbica / maceração carbônica',
      descricao: 'Fermentação controlada em tanques sem oxigênio (com ou sem CO₂ injetado), antes da secagem natural ou CD.',
      sensorial: 'Intenso: frutas tropicais, vinho, canela, notas boozy; corpo cremoso.',
      ajuste: { tempC: -2, ratio: +1, moagem: +0.5 },
      dica: 'Extrai muito fácil. Razão mais longa (1:16–1:17) e 90–92 °C evitam sabor de álcool/vinagre. Se ficar “fermentado demais”, não é sub-extração.'
    },
    {
      id: 'fermentacao-induzida', nome: 'Fermentação induzida (leveduras / co-fermentação)',
      descricao: 'Inoculação de leveduras ou adição de frutas/especiarias durante a fermentação.',
      sensorial: 'Aromas exóticos e pronunciados, doçura, corpo alto.',
      ajuste: { tempC: -2, ratio: +1, moagem: +0.5 },
      dica: 'Mesma lógica dos anaeróbicos: extrações mais suaves para não saturar os aromas.'
    },
    {
      id: 'descafeinado', nome: 'Descafeinado (Swiss Water / EA cana / CO₂)',
      descricao: 'Remoção da cafeína antes da torra. Estrutura celular mais frágil, torra mais rápida.',
      sensorial: 'Corpo médio, doçura, menos acidez; risco de nota amadeirada.',
      ajuste: { tempC: -2, ratio: 0, moagem: +1 },
      dica: 'Extrai muito rápido: moa claramente mais grosso e use 2–3 °C a menos.'
    }
  ];

  /* ---------- Intensidade de torra ---------- */
  const torras = [
    {
      id: 'clara', nome: 'Clara', agtron: '70–85', cor: 'Canela clara, sem óleo, grãos densos.',
      sensorial: 'Máxima acidez e florais; doçura depende de extrair bem. Risco de azedo/vegetal se sub-extraído.',
      base: { filtroTempC: 95, espressoTempC: 94.5, ratioFiltro: 16.5, ratioEspresso: 2.4, moagem: -0.5 },
      descansoDias: { filtrado: [7, 21], espresso: [14, 30] },
      dica: 'Puxe tudo para “mais extração”: água quente (94–97 °C), moagem mais fina, razão longa. Espresso: pré-infusão longa e 1:2,3–1:3.'
    },
    {
      id: 'media-clara', nome: 'Média-clara', agtron: '60–70', cor: 'Marrom claro, superfície seca.',
      sensorial: 'Acidez viva, doçura clara, corpo médio. Faixa preferida para filtrados especiais.',
      base: { filtroTempC: 94, espressoTempC: 93.5, ratioFiltro: 16, ratioEspresso: 2.2, moagem: -0.25 },
      descansoDias: { filtrado: [5, 18], espresso: [10, 25] },
      dica: 'Ponto de partida clássico: 93–95 °C, 1:16 em V60.'
    },
    {
      id: 'media', nome: 'Média', agtron: '50–60', cor: 'Marrom médio, ainda seco ou com brilho discreto.',
      sensorial: 'Equilíbrio: caramelo, chocolate, acidez moderada, corpo cheio.',
      base: { filtroTempC: 92, espressoTempC: 92.5, ratioFiltro: 15.5, ratioEspresso: 2.0, moagem: 0 },
      descansoDias: { filtrado: [4, 15], espresso: [7, 21] },
      dica: 'Versátil: 91–93 °C. Espresso 1:2 em 25–30 s.'
    },
    {
      id: 'media-escura', nome: 'Média-escura', agtron: '40–50', cor: 'Marrom escuro, início de óleo na superfície.',
      sensorial: 'Chocolate amargo, caramelo tostado, corpo pesado, acidez baixa.',
      base: { filtroTempC: 90, espressoTempC: 91, ratioFiltro: 15, ratioEspresso: 1.9, moagem: +0.5 },
      descansoDias: { filtrado: [3, 12], espresso: [5, 18] },
      dica: 'Grãos porosos extraem rápido: 88–91 °C, moagem mais grossa, contato mais curto.'
    },
    {
      id: 'escura', nome: 'Escura', agtron: '< 40', cor: 'Quase preto, oleoso.',
      sensorial: 'Torrado, defumado, amargor dominante; pouca origem.',
      base: { filtroTempC: 88, espressoTempC: 90, ratioFiltro: 14.5, ratioEspresso: 1.7, moagem: +1 },
      descansoDias: { filtrado: [2, 10], espresso: [3, 14] },
      dica: 'Evite sobre-extração: 85–89 °C, moagem grossa, tempo curto. Prensa francesa e moka aceitam bem.'
    }
  ];

  /* ---------- Métodos de preparo ----------
   * grind: descritor 1 (extrafina) … 7 (extragrossa) — usado para mapear
   * para cliques do moedor. microns: faixa de referência. ratio: gramas
   * de água por grama de café (espresso: bebida/dose). */
  const metodos = [
    {
      id: 'espresso', nome: 'Espresso', tipo: 'pressão', icone: '☕',
      ratio: { min: 1.6, max: 3.0, padrao: 2.0 }, dosePadrao: 18,
      tempC: { min: 88, max: 96, padrao: 93 }, tempoS: { min: 24, max: 34, padrao: 28 },
      grind: 1, microns: [200, 350], grindDesc: 'Fina (açúcar refinado)',
      sensibilidade: 'Alta: 1 clique fino costuma mudar 3–6 s no tempo de extração.',
      receita: 'Dose 18 g → bebida 36–40 g em 25–30 s. Pré-infusão 3–8 s. Ajuste moagem para tempo; razão para intensidade/corpo.'
    },
    {
      id: 'moka', nome: 'Moka (cafeteira italiana)', tipo: 'pressão', icone: '🫖',
      ratio: { min: 8, max: 11, padrao: 9.5 }, dosePadrao: 15,
      tempC: { min: 85, max: 95, padrao: 90 }, tempoS: { min: 60, max: 150, padrao: 100 },
      grind: 2, microns: [350, 500], grindDesc: 'Fina-média (sal fino)',
      sensibilidade: 'Média: moagem fina demais entope e amarga; grossa demais fica aguada.',
      receita: 'Água pré-aquecida na caldeira até a válvula, café nivelado sem compactar, fogo baixo. Retire do fogo ao ouvir o borbulhar.'
    },
    {
      id: 'v60', nome: 'Hario V60', tipo: 'filtrado', icone: '🔻',
      ratio: { min: 14, max: 18, padrao: 16 }, dosePadrao: 15,
      tempC: { min: 88, max: 97, padrao: 93 }, tempoS: { min: 150, max: 220, padrao: 180 },
      grind: 3, microns: [600, 800], grindDesc: 'Média-fina (areia grossa)',
      sensibilidade: 'Média-alta: 2–3 cliques (moedor manual) mudam ~15–20 s de drenagem.',
      receita: '15 g / 240 g. Bloom 45 g por 40 s, 2–3 despejos até 240 g. Drenagem total em 2:45–3:15.'
    },
    {
      id: 'kalita', nome: 'Kalita Wave', tipo: 'filtrado', icone: '〰️',
      ratio: { min: 14, max: 17, padrao: 15.5 }, dosePadrao: 18,
      tempC: { min: 88, max: 96, padrao: 93 }, tempoS: { min: 180, max: 240, padrao: 205 },
      grind: 4, microns: [700, 900], grindDesc: 'Média (areia)',
      sensibilidade: 'Média: fundo plano perdoa variações de despejo; o ajuste vem mais da moagem.',
      receita: '18 g / 280 g. Bloom 50 g/35 s, despejos em pulsos de 50–60 g. 3:15–3:45.'
    },
    {
      id: 'melitta', nome: 'Melitta (1x2 / 1x4 / 102)', tipo: 'filtrado', icone: '🧺',
      ratio: { min: 14, max: 17, padrao: 15.5 }, dosePadrao: 20,
      tempC: { min: 88, max: 95, padrao: 92 }, tempoS: { min: 180, max: 260, padrao: 220 },
      grind: 4, microns: [700, 950], grindDesc: 'Média (areia)',
      sensibilidade: 'Média-baixa: fluxo restrito pelo orifício único; moagem fina demais alaga o filtro.',
      receita: '20 g / 310 g. Bloom 60 g/40 s, despejos contínuos suaves. 3:30–4:15.'
    },
    {
      id: 'chemex', nome: 'Chemex', tipo: 'filtrado', icone: '⏳',
      ratio: { min: 14, max: 17, padrao: 16 }, dosePadrao: 30,
      tempC: { min: 90, max: 97, padrao: 94 }, tempoS: { min: 210, max: 300, padrao: 250 },
      grind: 5, microns: [800, 1000], grindDesc: 'Média-grossa',
      sensibilidade: 'Média: filtro espesso; ajustes de 3–4 cliques por vez em moedores manuais.',
      receita: '30 g / 500 g. Bloom 80 g/45 s, despejos em espiral até 500 g. 4:00–5:00.'
    },
    {
      id: 'clever', nome: 'Clever Dripper (imersão + filtro)', tipo: 'imersão', icone: '🪣',
      ratio: { min: 14, max: 17, padrao: 15.5 }, dosePadrao: 18,
      tempC: { min: 88, max: 96, padrao: 93 }, tempoS: { min: 180, max: 300, padrao: 240 },
      grind: 4, microns: [700, 900], grindDesc: 'Média',
      sensibilidade: 'Baixa: tempo é controlado por você; moagem afeta mais corpo do que tempo.',
      receita: '18 g / 280 g. Água antes do café, mexa, tampe, 2:30–3:30, drene sobre a xícara (~1 min).'
    },
    {
      id: 'aeropress', nome: 'AeroPress', tipo: 'imersão', icone: '🧪',
      ratio: { min: 11, max: 17, padrao: 14 }, dosePadrao: 15,
      tempC: { min: 80, max: 95, padrao: 90 }, tempoS: { min: 75, max: 180, padrao: 120 },
      grind: 3, microns: [500, 750], grindDesc: 'Média-fina',
      sensibilidade: 'Média: pressão compensa moagem; tempo de imersão e temperatura são alavancas fortes.',
      receita: '15 g / 210 g invertido ou padrão. Mexa 10 s, 1:30 de imersão, pressione em 30 s.'
    },
    {
      id: 'prensa-francesa', nome: 'Prensa Francesa', tipo: 'imersão', icone: '🫙',
      ratio: { min: 12, max: 16, padrao: 14 }, dosePadrao: 30,
      tempC: { min: 88, max: 95, padrao: 92 }, tempoS: { min: 240, max: 480, padrao: 300 },
      grind: 6, microns: [900, 1200], grindDesc: 'Grossa (sal grosso)',
      sensibilidade: 'Baixa para tempo, alta para sedimento/adstringência: moa mais grosso se ficar lamacenta.',
      receita: '30 g / 450 g. 4 min, quebre a crosta, retire a espuma, aguarde mais 4–5 min e pressione só até a superfície.'
    },
    {
      id: 'coador-pano', nome: 'Coador de pano', tipo: 'filtrado', icone: '🧦',
      ratio: { min: 13, max: 16, padrao: 14.5 }, dosePadrao: 25,
      tempC: { min: 86, max: 93, padrao: 90 }, tempoS: { min: 150, max: 240, padrao: 190 },
      grind: 4, microns: [700, 900], grindDesc: 'Média',
      sensibilidade: 'Baixa-média: o pano passa mais óleos; corpo alto mesmo com moagem média.',
      receita: '25 g / 360 g. Escalde o pano, bloom 60 g/30 s, despejos contínuos. Enxágue o pano sem sabão e guarde úmido na geladeira.'
    },
    {
      id: 'cold-brew', nome: 'Cold brew', tipo: 'imersão', icone: '🧊',
      ratio: { min: 6, max: 12, padrao: 9 }, dosePadrao: 100,
      tempC: { min: 4, max: 25, padrao: 20 }, tempoS: { min: 28800, max: 72000, padrao: 50400 },
      grind: 6, microns: [900, 1200], grindDesc: 'Grossa',
      sensibilidade: 'Muito baixa: ajuste principalmente tempo (12–20 h) e razão.',
      receita: '100 g / 900 g (concentrado). 14–18 h em temperatura ambiente ou 18–24 h na geladeira. Filtre e dilua 1:1.'
    }
  ];

  /* Descritores de moagem para mapear cliques */
  const grindEscala = [
    { n: 1, nome: 'Fina', ex: 'espresso' },
    { n: 2, nome: 'Fina-média', ex: 'moka' },
    { n: 3, nome: 'Média-fina', ex: 'V60 / AeroPress' },
    { n: 4, nome: 'Média', ex: 'Kalita / Melitta / pano' },
    { n: 5, nome: 'Média-grossa', ex: 'Chemex' },
    { n: 6, nome: 'Grossa', ex: 'Prensa / cold brew' },
    { n: 7, nome: 'Extra-grossa', ex: 'cupping / cold brew longo' }
  ];

  /* Moedores populares como modelos de escala (o usuário pode editar) */
  const moedoresModelo = [
    { nome: 'Timemore C2 / C3', tipo: 'manual', min: 0, max: 36, passo: 1, refs: { espresso: 8, moka: 12, aeropress: 16, v60: 19, kalita: 21, melitta: 21, 'coador-pano': 21, clever: 21, chemex: 24, 'prensa-francesa': 28, 'cold-brew': 30 } },
    { nome: '1Zpresso JX / JX-Pro (voltas.cliques → cliques totais)', tipo: 'manual', min: 0, max: 120, passo: 1, refs: { espresso: 18, moka: 30, aeropress: 45, v60: 60, kalita: 66, melitta: 66, 'coador-pano': 66, clever: 66, chemex: 75, 'prensa-francesa': 90, 'cold-brew': 100 } },
    { nome: 'Comandante C40', tipo: 'manual', min: 0, max: 50, passo: 1, refs: { espresso: 10, moka: 14, aeropress: 18, v60: 24, kalita: 26, melitta: 26, 'coador-pano': 26, clever: 26, chemex: 30, 'prensa-francesa': 35, 'cold-brew': 38 } },
    { nome: 'Hario Skerton / Mini Slim', tipo: 'manual', min: 0, max: 20, passo: 1, refs: { espresso: 3, moka: 5, aeropress: 7, v60: 9, kalita: 10, melitta: 10, 'coador-pano': 10, clever: 10, chemex: 12, 'prensa-francesa': 15, 'cold-brew': 17 } },
    { nome: 'Baratza Encore', tipo: 'elétrico', min: 1, max: 40, passo: 1, refs: { espresso: 5, moka: 8, aeropress: 12, v60: 15, kalita: 17, melitta: 17, 'coador-pano': 17, clever: 17, chemex: 22, 'prensa-francesa': 28, 'cold-brew': 32 } },
    { nome: 'Fellow Ode Gen 2', tipo: 'elétrico', min: 1, max: 11, passo: 0.33, refs: { moka: 1.5, aeropress: 2.5, v60: 4, kalita: 4.5, melitta: 4.5, 'coador-pano': 4.5, clever: 5, chemex: 6, 'prensa-francesa': 8, 'cold-brew': 9 } },
    { nome: 'DF64 / Eureka Mignon (escala genérica 0–50)', tipo: 'elétrico', min: 0, max: 50, passo: 0.5, refs: { espresso: 8, moka: 14, aeropress: 22, v60: 28, kalita: 30, melitta: 30, 'coador-pano': 30, clever: 30, chemex: 34, 'prensa-francesa': 40, 'cold-brew': 44 } },
    { nome: 'Genérico (0–40)', tipo: 'manual', min: 0, max: 40, passo: 1, refs: { espresso: 6, moka: 10, aeropress: 15, v60: 18, kalita: 20, melitta: 20, 'coador-pano': 20, clever: 20, chemex: 24, 'prensa-francesa': 30, 'cold-brew': 34 } }
  ];

  /* Descritores sensoriais (chips) */
  const descritores = ['chocolate', 'caramelo', 'nozes', 'castanhas', 'amendoim', 'frutas amarelas', 'frutas vermelhas', 'frutas tropicais', 'cítrico', 'laranja', 'limão', 'maçã', 'uva', 'pêssego', 'floral', 'mel', 'rapadura', 'melado', 'cana', 'baunilha', 'cacau', 'especiarias', 'vinho', 'fermentado', 'cereal', 'amadeirado', 'defumado', 'tostado', 'chá preto', 'ervas'];

  /* Defeitos/sinais de xícara usados pelo motor */
  const sinais = [
    { id: 'azedo', nome: 'Azedo / ácido agressivo', tipo: 'sub', peso: 1.0, dica: 'Acidez ácida e curta, tipo vinagre ou limão verde.' },
    { id: 'salgado', nome: 'Salgado', tipo: 'sub', peso: 0.8, dica: 'Sensação salina na ponta da língua — sinal clássico de sub-extração.' },
    { id: 'aguado', nome: 'Aguado / oco / fino', tipo: 'sub', peso: 0.6, dica: 'Falta de corpo e de doçura; final curto.' },
    { id: 'vegetal', nome: 'Vegetal / capim / amendoim cru', tipo: 'sub', peso: 0.7, dica: 'Comum em torra clara sub-extraída.' },
    { id: 'final-curto', nome: 'Final curto / some rápido', tipo: 'sub', peso: 0.5, dica: 'Doçura não se sustenta após engolir.' },
    { id: 'amargo', nome: 'Amargo excessivo', tipo: 'sobre', peso: 1.0, dica: 'Amargor que domina e atrapalha a doçura.' },
    { id: 'adstringente', nome: 'Adstringente / seco / travando', tipo: 'sobre', peso: 1.0, dica: 'Boca seca, sensação de caqui verde — sobre-extração ou finos em excesso.' },
    { id: 'queimado', nome: 'Queimado / cinzas / tostado demais', tipo: 'sobre', peso: 0.7, dica: 'Pode ser torra ou água quente demais.' },
    { id: 'final-longo-aspero', nome: 'Final longo e áspero', tipo: 'sobre', peso: 0.6, dica: 'Persistência amarga na garganta.' },
    { id: 'lamacento', nome: 'Lamacento / borra / finos', tipo: 'sobre', peso: 0.5, dica: 'Muito sedimento (imersão) ou filtro entupido — finos em excesso.' },
    { id: 'fraco', nome: 'Fraco / diluído (mas equilibrado)', tipo: 'forca-baixa', peso: 1.0, dica: 'Sabor correto, só falta intensidade → razão.' },
    { id: 'forte', nome: 'Intenso demais / pesado (mas equilibrado)', tipo: 'forca-alta', peso: 1.0, dica: 'Sabor correto, mas sobrecarrega → razão.' },
    { id: 'fermentado', nome: 'Fermentado / álcool / vinagre', tipo: 'processo', peso: 1.0, dica: 'Característica do lote (naturais/anaeróbicos), não de extração. Baixe temperatura e alongue razão.' }
  ];

  /* Tabela de indicações método × perfil (usado na biblioteca e no sugestor) */
  const indicacoesPerfil = [
    { perfil: 'Acidez alta, corpo leve-médio, florais/frutas (Mantiqueira, Chapada Diamantina, Caparaó, Montanhas do ES lavados)', metodos: ['v60', 'chemex', 'kalita', 'aeropress'], razao: '1:16 – 1:17', tempC: '94 – 96 °C', torra: 'clara / média-clara' },
    { perfil: 'Equilíbrio, doçura, corpo médio (Sul de Minas, Matas de Minas, CD em geral)', metodos: ['v60', 'kalita', 'melitta', 'clever', 'espresso'], razao: '1:15 – 1:16 (espresso 1:2 – 1:2,2)', tempC: '92 – 94 °C', torra: 'média-clara / média' },
    { perfil: 'Corpo cheio, chocolate, acidez baixa (Cerrado, Mogiana, Norte Pioneiro, Planalto BA)', metodos: ['espresso', 'prensa-francesa', 'moka', 'coador-pano', 'melitta'], razao: '1:14 – 1:15 (espresso 1:1,8 – 1:2)', tempC: '90 – 93 °C', torra: 'média / média-escura' },
    { perfil: 'Fermentados intensos (anaeróbico, maceração carbônica, co-fermentação)', metodos: ['v60', 'aeropress', 'clever', 'kalita'], razao: '1:16 – 1:17', tempC: '90 – 92 °C', torra: 'clara / média-clara' },
    { perfil: 'Canephora fino (Conilon Capixaba, Robusta Amazônico)', metodos: ['espresso', 'moka', 'cold-brew', 'prensa-francesa'], razao: '1:1,8 – 1:2 (espresso) · 1:12 – 1:14 (imersão)', tempC: '88 – 91 °C', torra: 'média / média-escura' },
    { perfil: 'Torra escura (qualquer origem)', metodos: ['prensa-francesa', 'moka', 'coador-pano', 'cold-brew'], razao: '1:13 – 1:15', tempC: '85 – 89 °C', torra: 'escura' }
  ];

  const byId = (arr) => Object.fromEntries(arr.map(x => [x.id, x]));

  return {
    regioes, processos, torras, metodos, grindEscala, moedoresModelo, descritores, sinais, indicacoesPerfil,
    regiao: byId(regioes), processo: byId(processos), torra: byId(torras), metodo: byId(metodos), sinal: byId(sinais)
  };
})();
