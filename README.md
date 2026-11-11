# START PLAY — mídia indoor

- **Player (o que a TV abre):** https://startmidias.github.io/screenflow/
- **Painel:** https://startmidias.github.io/screenflow/painel.html
- **App da TV (Android):** https://startmidias.github.io/screenflow/startplay.apk

O endereço ainda usa `/screenflow/` porque as TVs já pareadas abrem esse link. Trocar o caminho exige um repositório novo (`startplay`) e um redirecionamento neste; até lá, tudo o que aparece na tela e no painel já é START PLAY.

| Pasta / arquivo | O que é |
|---|---|
| `index.html` | Player da TV 3.2: anúncios em tela cheia e em loop, cartões de clima/cotação/futebol entre os anúncios, miniatura da tela para o painel, rodapé com notícias e chamada comercial, expediente, funciona sem internet e registra cada exibição |
| `agenda.js` | Regras de horário compartilhadas pelo player e pelo painel (expediente, virada da meia-noite, feriados, dias e horários dos anúncios, estimativa de inserções) |
| `sw.js` | Guarda o player no aparelho para abrir mesmo sem internet |
| `jpeg-decoder.js` | Plano B para fotos que o TV Box não consegue abrir sozinho (jpeg-js, licença BSD-3) |
| `painel.html`, `painel.js`, `painel-gestao.js` | Painel: início, telas, anúncios por TV, clientes, financeiro, comprovante de exibição, ajustes |
| `cartoes.js` | Cartões que passam entre os anúncios (clima, cotação, jogos e classificação), desenhados no próprio TV Box |
| `artes.js` | Criador de artes do painel (oferta, destaque, lista de preços, aviso/evento, marca), horizontal e vertical |
| `conversor.js` | Conversor automático do painel: qualquer foto (JPEG, PNG, HEIC do iPhone, BMP, TIFF, AVIF, SVG, GIF), PDF (1ª página) ou vídeo (MOV, AVI, MKV, WMV, WEBM, MPEG, 4K) vira um arquivo que o TV Box abre (PNG/WEBP/JPEG; MP4 H.264 + AAC) |
| `vendor/` | Bibliotecas usadas pelo painel (Supabase, jsPDF); em `vendor/conv/`, as do conversor (carregadas só quando precisa; ver `LICENCAS.txt`); em `vendor/fonts/`, as fontes do criador de artes (OFL) |
| `config.js` | Endereço do Supabase e chave pública (anon). A segurança fica nas regras do banco |
| `supabase/instalar.sql` | Instalação do banco (rodar no SQL Editor do Supabase) |
| `supabase/atualizacao-02.sql` … `05.sql` | Atualizações, em ordem. Cada uma pode ser rodada de novo sem estragar nada. A 05 liga o pg_cron/pg_net: a cada minuto o banco confere as TVs (aviso de TV fora do ar por WhatsApp/e-mail) e busca clima, cotação e futebol |
| `supabase/functions/noticias/` | Função que busca os feeds de notícias, limpa e entrega as manchetes às TVs |
| `startplay.apk` | App START PLAY para TV Box (tela inicial em modo quiosque) |
| `app-tv/` | Código do app da TV (smali + interface em HTML) e o script de build |
| `version.txt` | Versão do player; quando muda, as TVs recarregam sozinhas |

A chave de assinatura do app **não** fica aqui: está no Mac em `Documentos/ScreenFlowTV/assinatura`.
