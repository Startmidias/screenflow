# Start Play — mídia indoor

- **Player (o que a TV abre):** https://startmidias.github.io/screenflow/
- **Painel:** https://startmidias.github.io/screenflow/painel.html
- **App da TV (Android):** https://startmidias.github.io/screenflow/startplay.apk

| Pasta / arquivo | O que é |
|---|---|
| `index.html` | Player da TV: toca os anúncios em loop e registra cada exibição |
| `painel.html` | Painel de gestão (anúncios, telas, relatório de exibição) |
| `config.js` | Endereço do Supabase e chave pública (anon). A segurança fica nas regras do banco |
| `supabase/instalar.sql` | Script do banco (rodar no SQL Editor do Supabase) |
| `startplay.apk` | App Start Play para TV Box (tela inicial em modo quiosque) |
| `app-tv/` | Código do app da TV (smali + interface em HTML) e o script de build |

A chave de assinatura do app **não** fica aqui: está no Mac em `Documentos/ScreenFlowTV/assinatura`.
