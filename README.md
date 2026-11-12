# START PLAY — mídia indoor

- **Player (o que a TV abre):** https://startmidias.github.io/screenflow/
- **Painel:** https://startmidias.github.io/screenflow/painel.html
- **App da TV (Android):** https://startmidias.github.io/screenflow/startplay.apk

O endereço ainda usa `/screenflow/` porque as TVs já pareadas abrem esse link. Trocar o caminho exige um repositório novo (`startplay`) e um redirecionamento neste; até lá, tudo o que aparece na tela e no painel já é START PLAY.

| Pasta / arquivo | O que é |
|---|---|
| `index.html` | Player da TV 3.3: anúncios em tela cheia e em loop, tela "Anuncie aqui" com QR code para o WhatsApp, cartões de clima/cotação/futebol entre os anúncios, miniatura da tela para o painel, rodapé com notícias e chamada comercial, expediente, funciona sem internet e registra cada exibição. Desde a 3.3.1 toca um vídeo por vez (solta o decodificador da TV Box antes do próximo) e se recarrega sozinho se vídeos travarem seguidos. Na 3.4, com o app 2.0, o vídeo toca direto no aparelho (nativo) |
| `agenda.js` | Regras de horário compartilhadas pelo player e pelo painel (expediente, virada da meia-noite, feriados, dias e horários dos anúncios, estimativa de inserções) |
| `sw.js` | Guarda o player no aparelho para abrir mesmo sem internet |
| `jpeg-decoder.js` | Plano B para fotos que o TV Box não consegue abrir sozinho (jpeg-js, licença BSD-3) |
| `painel.html`, `painel.js`, `painel-gestao.js` | Painel: início, telas, anúncios por TV, clientes, financeiro, comprovante de exibição, link do anunciante, espaço usado e cópias de segurança, ajustes |
| `anunciante.html` | Página do anunciante (sem senha, por um link secreto que o painel gera): exibições dos últimos 30 dias, anúncios, telas e fotos da tela com a arte dele |
| `qrcode.js` | Gerador de QR code usado na tela "Anuncie aqui" (qrcode-generator, licença MIT) |
| `cartoes.js` | Cartões que passam entre os anúncios (clima, cotação, jogos e classificação), desenhados no próprio TV Box |
| `artes.js` | Criador de artes do painel (oferta, destaque, lista de preços, aviso/evento, marca), horizontal e vertical |
| `conversor.js` | Conversor automático do painel: qualquer foto (JPEG, PNG, HEIC do iPhone, BMP, TIFF, AVIF, SVG, GIF), PDF (1ª página) ou vídeo (MOV, AVI, MKV, WMV, WEBM, MPEG, 4K) vira um arquivo que o TV Box abre (PNG/WEBP/JPEG; MP4 H.264 + AAC) |
| `vendor/` | Bibliotecas usadas pelo painel (Supabase, jsPDF); em `vendor/conv/`, as do conversor (carregadas só quando precisa; ver `LICENCAS.txt`); em `vendor/fonts/`, as fontes do criador de artes (OFL) |
| `config.js` | Endereço do Supabase e chave pública (anon). A segurança fica nas regras do banco |
| `supabase/instalar.sql` | Instalação do banco (rodar no SQL Editor do Supabase) |
| `supabase/atualizacao-02.sql` … `08.sql` | Atualizações, em ordem. Cada uma pode ser rodada de novo sem estragar nada. A 05 liga o pg_cron/pg_net: a cada minuto o banco confere as TVs (aviso de TV fora do ar por WhatsApp/e-mail) e busca clima, cotação e futebol. A 06 traz a cotação reserva (Banco Central Europeu). A 07 fecha as funções internas para a internet e limpa sozinha, de hora em hora, aparelhos nunca pareados. A 08 transforma exibições antigas em totais por dia (o banco não estoura os 500 MB do plano gratuito), faz uma cópia de segurança por dia e cria o link do anunciante |
| `.github/workflows/manter-ativo.yml` | Consulta diária ao banco para o plano gratuito do Supabase não pausar o projeto |
| `supabase/functions/noticias/` | Função que busca os feeds de notícias, limpa e entrega as manchetes às TVs |
| `startplay.apk` | App START PLAY para TV Box 2.0 (tela inicial em modo quiosque; vídeo nativo, vigia que reabre o app e informa temperatura/memória). Fonte em `app-tv/` (`./build.sh`; precisa da chave original) |
| `app-tv/` | Código do app da TV (smali + interface em HTML) e o script de build |
| `version.txt` | Versão do player; quando muda, as TVs recarregam sozinhas |

A chave de assinatura do app **não** fica aqui: está no Mac em `Documentos/ScreenFlowTV/assinatura`.
