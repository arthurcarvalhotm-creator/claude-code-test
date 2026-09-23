# ☕ Laboratório de Cafeteria

Diário técnico de extrações e calibração de cafés especiais. Aplicação **100 % local** (HTML + CSS + JS puros, sem servidor, sem build, sem rede): roda no navegador do computador ou instalada no smartphone como um app (PWA).

## O que faz

- **Diário de extrações**: grão, método (V60, Kalita, Melitta, Chemex, Clever, AeroPress, Prensa Francesa, Coador de pano, Espresso, Moka, Cold brew), moedor e cliques exatos, dose, água/bebida, razão, temperatura, tempo de contato, TDS (opcional), perfil sensorial (acidez, doçura, amargor, corpo, final), sinais de xícara e nota.
- **Diagnóstico automático** de sub/sobre-extração a partir dos sinais, dos sliders sensoriais, do tempo de contato em relação à faixa do método e do rendimento de extração (EY) quando há TDS.
- **Recomendação da próxima extração**: ajuste de moagem em cliques do seu moedor (com bissecção quando a extração anterior estava do lado oposto), temperatura como alavanca fina, razão água/café para intensidade e regras específicas para lotes fermentados e para espresso.
- **Ponto de partida para grãos novos**: combina torra, processo, terroir e perfil sensorial para sugerir cliques, razão, temperatura e tempo alvo antes da primeira extração.
- **Curvas de sabor**: evolução das notas por grão × método, radar sensorial (última × melhor extração), tabela de tentativas e status de calibração (“calibrado em N tentativas”).
- **Biblioteca nativa**: 15 terroirs brasileiros (Cerrado Mineiro, Sul de Minas, Mantiqueira, Matas de Minas, Chapada de Minas, Alta e Média Mogiana, Montanhas do ES, Conilon Capixaba, Chapada Diamantina, Planalto e Oeste da Bahia, Norte Pioneiro do Paraná, Caparaó, Matas de Rondônia), 7 processos de pós-colheita, 5 intensidades de torra (com Agtron e descanso), 11 métodos com parâmetros, e a tabela de indicações método × perfil.
- **Moedores**: escala de cliques/sub-cliques, direção (menor = fino), referência por método; modelos prontos (Timemore, 1Zpresso, Comandante, Hario, Baratza Encore, Fellow Ode, DF64/Mignon).
- **Receitas de despejo** por método (bloom, cada ataque com tempo e água acumulada, drenagem), escaladas para a dose e a razão da extração. No registro você anota o que realmente fez em cada despejo.
- **Catálogo dos cafés comprados** já cadastrado em Grãos na primeira abertura: Maeda Coffee (Kit Inicial e Kit Exóticos), Encantos do Café (Kit Degustação: Agrado, Desejo, Raro, Sensação), Net Cafés (Caparaó: Caramelo & Chocolate, Frutas Amarelas, Frutas Vermelhas) e Colheita Café (Pra Beber de Balde, Halls de Cereja, Blend da Copa, Castanhas & Caramelo). Os moedores **Starseeker E55 Pro** e **Kingrinder K2** também vêm pré-cadastrados com referências de cliques por método.
- **Timer guiado de preparo**: contagem regressiva por etapa, anel de progresso, balança-alvo subindo na vazão ideal de cada método (ex.: 6 g/s na V60), aviso sonoro e vibração 3-2-1, tela sempre ligada, botão para adiantar a etapa e marcação do fim da drenagem. Ao concluir, o tempo total e os horários reais de cada despejo vão para o registro da extração.
- **Leitura de rótulos pela câmera**: no cadastro de grão, fotografe o pacote. Com uma chave da API da Anthropic ou do Google Gemini (Mais → Backup e ajustes, escolha o provedor), a IA lê a foto e preenche produtor, região, variedade, processo, torra, altitude, data da torra, pontuação e notas, mapeados para o banco nativo. Sem chave, um OCR local (Tesseract.js, baixado na primeira vez) faz uma leitura mais simples. A chave fica só no aparelho e não entra no backup. O SDK oficial da Anthropic está empacotado em `vendor/`.
- **Pingo, o mascote**: uma xícara com olhos, braços e vapor animado que aparece no início, na cafeína, nas extrações, no timer e no latte art. A expressão muda com o nível de cafeína, a hora do dia, a nota da extração e a pontuação do treino.
- **Início com ações rápidas**: repetir a última receita (com ou sem timer), estoque, cafeína e latte art em cartões.
- **Estoque de grãos**: informe o peso do pacote e o app desconta a dose de cada extração, mostra quantas doses restam e avisa quando um café está acabando.
- **Treino de latte art**: segure o celular como o cabo da jarra e balance o punho. O acelerômetro vira uma onda que você compara com o padrão-alvo descendo na tela (rosetta completa, balanço constante, 3/5/7 balanços, aleatório), com metrônomo, ritmo, largura e velocidade ajustáveis. Ao final, pontua ritmo, constância, uniformidade e sincronia e desenha a rosetta que seu movimento formaria. Sem sensor, dá para treinar com o dedo na tela.
- **Cafeína e sono**: diário de cafeína com lançamentos rápidos (cafeteria, energético, chá, chimarrão…) e registro automático das extrações que você bebeu. Um modelo farmacocinético de um compartimento, ajustado por peso, idade, sensibilidade, fumo, anticoncepcional e gestação, projeta a curva no corpo, a quantidade na hora de dormir e o último horário seguro para um café. Estimativa educativa, não é orientação médica.
- **Backup** em JSON (exportar/importar/copiar). Os dados ficam apenas no aparelho.

## Como rodar

### No computador
Abra `index.html` no navegador (duplo clique). Quase tudo funciona a partir de `file://`; a leitura de rótulos por IA exige servir a pasta por HTTP(S), como descrito abaixo.

### No smartphone, “como um app”
Para instalar (ícone na tela inicial, tela cheia, offline), o navegador exige que a pasta seja servida por HTTP(S). Duas opções:

**A) GitHub Pages (recomendado)** — publique este repositório em *Settings → Pages → Deploy from branch*, abra a URL no celular e use “Instalar aplicativo” (Chrome/Android) ou *Compartilhar → Adicionar à Tela de Início* (Safari/iPhone). Depois disso o app funciona offline.

**B) Servidor local na mesma rede Wi-Fi** — na pasta do projeto:

```bash
python3 -m http.server 8080
# ou: npx serve .
```

No celular acesse `http://IP-DO-COMPUTADOR:8080` e adicione à tela inicial. (Sem HTTPS o service worker não registra em alguns navegadores, mas o app funciona normalmente.)

### Dados de exemplo
Em **Mais → Backup e ajustes → Carregar exemplo** você vê o motor funcionando com uma sequência real de calibração (V60 e espresso).

## Estrutura

| Arquivo | Conteúdo |
|---|---|
| `index.html` | Casca da aplicação e navegação |
| `styles.css` | Estilos, tema claro/escuro, layout mobile-first |
| `data.js` | Banco nativo: terroirs, processos, torras, métodos, sinais, moedores-modelo |
| `engine.js` | Motor: ponto de partida, diagnóstico, recomendação, status de calibração |
| `app.js` | Interface, rotas, formulários, gráficos SVG, backup, PWA |
| `timer.js` | Timer guiado de preparo |
| `rotulo.js` | Leitura de rótulos (Claude, Gemini ou OCR local) |
| `cafeina.js` | Diário de cafeína e modelo farmacocinético |
| `latte.js` | Treino de latte art com acelerômetro |
| `mascote.js` | Pingo, o mascote (SVG animado) |
| `vendor/anthropic-sdk.mjs` | SDK oficial da Anthropic (0.128.0) empacotado para navegador |
| `manifest.webmanifest`, `sw.js`, `icons/` | Instalação como app e cache offline |

## Como o motor decide

1. **Índice de extração** (−1 sub … +1 sobre) soma sinais ponderados (azedo, salgado, aguado, vegetal = sub; amargo, adstringente, queimado, lamacento = sobre), combinações dos sliders (acidez alta + doçura baixa, amargor alto + doçura baixa…), desvio do tempo em relação à faixa do método e EY fora de 18–22,5 %.
2. **Moagem** é a alavanca principal: o tamanho do passo depende da escala do moedor (menor para espresso). Se a extração anterior estava do lado oposto, o motor faz **bissecção** entre os dois cliques; se o problema persistiu com a mesma intensidade, aumenta o passo.
3. **Temperatura** entra como ajuste fino (±1 °C) quando o desvio é leve e a moagem já foi mexida; **razão** só muda quando a intensidade está errada com sabor equilibrado (uma variável por vez).
4. **Fermentado/álcool** é tratado como característica do lote: baixa temperatura e alonga razão, sem mexer na moagem.
5. Uma receita vira **calibrada** quando o índice fica dentro de ±0,2 e a nota atinge o alvo (padrão 8, configurável).

Todos os valores da biblioteca são referências de bancada, não regras absolutas; o histórico real sempre prevalece.

## Leitura de rótulos: Claude ou Gemini

Em **Mais → Backup e ajustes → Leitura de rótulos por IA**, escolha o provedor e cole a chave:

- **Gemini**: crie a chave em [aistudio.google.com](https://aistudio.google.com) → *Get API key*. Há cota gratuita; no plano gratuito o Google pode usar o conteúdo enviado para melhorar os modelos. O modelo padrão é `gemini-3.8-flash` e dá para digitar outro id se o Google lançar ou aposentar modelos.
- **Claude**: crie a chave em [console.anthropic.com](https://console.anthropic.com) → *API Keys*. Cobrado por uso.

As chaves ficam só no aparelho. Como o app roda inteiro no navegador, qualquer pessoa com acesso ao seu celular desbloqueado poderia ver a chave; use uma chave própria para este app e com limite de gastos.

## Publicar no GitHub Pages

1. No GitHub, abra o repositório → **Settings → Pages**.
2. Em *Build and deployment*, escolha **Deploy from a branch**, selecione a branch (por exemplo `main`, depois de fazer o merge) e a pasta **/ (root)**. Salve.
3. Em um ou dois minutos o endereço `https://<seu-usuario>.github.io/<repositório>/` fica no ar. Abra no celular e use *Instalar aplicativo* (Android) ou *Compartilhar → Adicionar à Tela de Início* (iPhone).

Para mudar algo você mesmo: edite o arquivo no GitHub (ícone de lápis) e faça *Commit*. O Pages publica a nova versão sozinho. No celular, feche e reabra o app duas vezes para o cache offline pegar a atualização.
