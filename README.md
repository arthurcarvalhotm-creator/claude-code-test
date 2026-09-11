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
- **Backup** em JSON (exportar/importar/copiar). Os dados ficam apenas no aparelho.

## Como rodar

### No computador
Abra `index.html` no navegador (duplo clique). Tudo funciona a partir de `file://`.

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
| `manifest.webmanifest`, `sw.js`, `icons/` | Instalação como app e cache offline |

## Como o motor decide

1. **Índice de extração** (−1 sub … +1 sobre) soma sinais ponderados (azedo, salgado, aguado, vegetal = sub; amargo, adstringente, queimado, lamacento = sobre), combinações dos sliders (acidez alta + doçura baixa, amargor alto + doçura baixa…), desvio do tempo em relação à faixa do método e EY fora de 18–22,5 %.
2. **Moagem** é a alavanca principal: o tamanho do passo depende da escala do moedor (menor para espresso). Se a extração anterior estava do lado oposto, o motor faz **bissecção** entre os dois cliques; se o problema persistiu com a mesma intensidade, aumenta o passo.
3. **Temperatura** entra como ajuste fino (±1 °C) quando o desvio é leve e a moagem já foi mexida; **razão** só muda quando a intensidade está errada com sabor equilibrado (uma variável por vez).
4. **Fermentado/álcool** é tratado como característica do lote: baixa temperatura e alonga razão, sem mexer na moagem.
5. Uma receita vira **calibrada** quando o índice fica dentro de ±0,2 e a nota atinge o alvo (padrão 8, configurável).

Todos os valores da biblioteca são referências de bancada, não regras absolutas; o histórico real sempre prevalece.
