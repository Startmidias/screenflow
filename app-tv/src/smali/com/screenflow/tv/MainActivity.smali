.class public Lcom/screenflow/tv/MainActivity;
.super Landroid/app/Activity;
.source "MainActivity.java"

# START PLAY TV - tela inicial (launcher) em modo quiosque.
# Duas WebViews: "player" (anúncios) e "ui" (menu/configuração, por cima).

.field public player:Landroid/webkit/WebView;
.field public ui:Landroid/webkit/WebView;
.field public uiOpen:Z
.field public intentUrl:Ljava/lang/String;
.field public backCount:I
.field public lastBack:J
.field public menuFired:Z


.method public constructor <init>()V
    .locals 0
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V
    return-void
.end method


.method protected onCreate(Landroid/os/Bundle;)V
    .locals 5

    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    # FLAG_KEEP_SCREEN_ON (0x80) | FLAG_FULLSCREEN (0x400)
    invoke-virtual {p0}, Lcom/screenflow/tv/MainActivity;->getWindow()Landroid/view/Window;
    move-result-object v0
    const/16 v1, 0x480
    invoke-virtual {v0, v1}, Landroid/view/Window;->addFlags(I)V

    invoke-virtual {p0}, Lcom/screenflow/tv/MainActivity;->getIntent()Landroid/content/Intent;
    move-result-object v0
    invoke-virtual {p0, v0}, Lcom/screenflow/tv/MainActivity;->readIntent(Landroid/content/Intent;)V

    new-instance v0, Landroid/widget/FrameLayout;
    invoke-direct {v0, p0}, Landroid/widget/FrameLayout;-><init>(Landroid/content/Context;)V
    const/high16 v1, -0x1000000
    invoke-virtual {v0, v1}, Landroid/widget/FrameLayout;->setBackgroundColor(I)V

    # player (embaixo)
    invoke-virtual {p0}, Lcom/screenflow/tv/MainActivity;->makeWebView()Landroid/webkit/WebView;
    move-result-object v2
    iput-object v2, p0, Lcom/screenflow/tv/MainActivity;->player:Landroid/webkit/WebView;
    invoke-virtual {v2, v1}, Landroid/webkit/WebView;->setBackgroundColor(I)V
    invoke-virtual {v0, v2}, Landroid/widget/FrameLayout;->addView(Landroid/view/View;)V

    # 2.0: vídeo nativo por baixo do player (se falhar, o player segue com o vídeo do navegador)
    :nv_try
    invoke-static {p0, v0, v2}, Lcom/screenflow/tv/nv/NativeVideo;->attach(Landroid/app/Activity;Landroid/widget/FrameLayout;Landroid/webkit/WebView;)V
    :nv_try_end
    .catch Ljava/lang/Throwable; {:nv_try .. :nv_try_end} :nv_catch
    goto :nv_ok
    :nv_catch
    move-exception v4
    :nv_ok

    # ui (por cima, fundo transparente)
    invoke-virtual {p0}, Lcom/screenflow/tv/MainActivity;->makeWebView()Landroid/webkit/WebView;
    move-result-object v3
    iput-object v3, p0, Lcom/screenflow/tv/MainActivity;->ui:Landroid/webkit/WebView;
    const/4 v1, 0x0
    invoke-virtual {v3, v1}, Landroid/webkit/WebView;->setBackgroundColor(I)V
    new-instance v1, Lcom/screenflow/tv/Bridge;
    invoke-direct {v1, p0}, Lcom/screenflow/tv/Bridge;-><init>(Lcom/screenflow/tv/MainActivity;)V
    const-string v4, "TV"
    invoke-virtual {v3, v1, v4}, Landroid/webkit/WebView;->addJavascriptInterface(Ljava/lang/Object;Ljava/lang/String;)V
    invoke-virtual {v0, v3}, Landroid/widget/FrameLayout;->addView(Landroid/view/View;)V

    invoke-virtual {p0, v0}, Lcom/screenflow/tv/MainActivity;->setContentView(Landroid/view/View;)V

    const/4 v1, 0x1
    iput-boolean v1, p0, Lcom/screenflow/tv/MainActivity;->uiOpen:Z
    const-string v1, "file:///android_asset/index.html"
    invoke-virtual {v3, v1}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V
    invoke-virtual {v3}, Landroid/webkit/WebView;->requestFocus()Z

    return-void
.end method


.method public makeWebView()Landroid/webkit/WebView;
    .locals 4

    new-instance v0, Landroid/webkit/WebView;
    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V

    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v1
    const/4 v2, 0x1
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setLoadWithOverviewMode(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setUseWideViewPort(Z)V
    const/4 v3, 0x0
    invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V
    # MIXED_CONTENT_ALWAYS_ALLOW = 0
    invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setMixedContentMode(I)V
    # LOAD_DEFAULT = -1
    const/4 v3, -0x1
    invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setCacheMode(I)V

    new-instance v3, Lcom/screenflow/tv/Client;
    invoke-direct {v3, p0}, Lcom/screenflow/tv/Client;-><init>(Lcom/screenflow/tv/MainActivity;)V
    invoke-virtual {v0, v3}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    new-instance v3, Landroid/webkit/WebChromeClient;
    invoke-direct {v3}, Landroid/webkit/WebChromeClient;-><init>()V
    invoke-virtual {v0, v3}, Landroid/webkit/WebView;->setWebChromeClient(Landroid/webkit/WebChromeClient;)V

    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->setFocusable(Z)V
    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->setFocusableInTouchMode(Z)V

    return-object v0
.end method


.method public readIntent(Landroid/content/Intent;)V
    .locals 2
    if-eqz p1, :done
    const-string v0, "url"
    invoke-virtual {p1, v0}, Landroid/content/Intent;->getStringExtra(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v1
    if-eqz v1, :done
    iput-object v1, p0, Lcom/screenflow/tv/MainActivity;->intentUrl:Ljava/lang/String;
    :done
    return-void
.end method


.method protected onNewIntent(Landroid/content/Intent;)V
    .locals 1

    invoke-super {p0, p1}, Landroid/app/Activity;->onNewIntent(Landroid/content/Intent;)V
    invoke-virtual {p0, p1}, Lcom/screenflow/tv/MainActivity;->setIntent(Landroid/content/Intent;)V

    const-string v0, "url"
    invoke-virtual {p1, v0}, Landroid/content/Intent;->hasExtra(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :no_url
    invoke-virtual {p0, p1}, Lcom/screenflow/tv/MainActivity;->readIntent(Landroid/content/Intent;)V
    const-string v0, "applyIntentUrl()"
    invoke-virtual {p0, v0}, Lcom/screenflow/tv/MainActivity;->runUiJs(Ljava/lang/String;)V
    return-void

    :no_url
    # Botão HOME do controle com o app aberto -> abre o menu
    const-string v0, "android.intent.category.HOME"
    invoke-virtual {p1, v0}, Landroid/content/Intent;->hasCategory(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :done
    iget-boolean v0, p0, Lcom/screenflow/tv/MainActivity;->uiOpen:Z
    if-nez v0, :done
    const-string v0, "openMenu()"
    invoke-virtual {p0, v0}, Lcom/screenflow/tv/MainActivity;->showUi(Ljava/lang/String;)V
    :done
    return-void
.end method


.method public immersive()V
    .locals 2
    invoke-virtual {p0}, Lcom/screenflow/tv/MainActivity;->getWindow()Landroid/view/Window;
    move-result-object v0
    invoke-virtual {v0}, Landroid/view/Window;->getDecorView()Landroid/view/View;
    move-result-object v0
    # IMMERSIVE_STICKY|LAYOUT_FULLSCREEN|LAYOUT_HIDE_NAVIGATION|LAYOUT_STABLE|FULLSCREEN|HIDE_NAVIGATION
    const/16 v1, 0x1706
    invoke-virtual {v0, v1}, Landroid/view/View;->setSystemUiVisibility(I)V
    return-void
.end method


.method protected onResume()V
    .locals 1
    invoke-super {p0}, Landroid/app/Activity;->onResume()V
    invoke-virtual {p0}, Lcom/screenflow/tv/MainActivity;->immersive()V
    iget-object v0, p0, Lcom/screenflow/tv/MainActivity;->player:Landroid/webkit/WebView;
    if-eqz v0, :np
    invoke-virtual {v0}, Landroid/webkit/WebView;->onResume()V
    :np
    const-string v0, "window.onAppResume&&onAppResume()"
    invoke-virtual {p0, v0}, Lcom/screenflow/tv/MainActivity;->runUiJs(Ljava/lang/String;)V
    :nv_try
    invoke-static {}, Lcom/screenflow/tv/nv/NativeVideo;->onResume()V
    :nv_try_end
    .catch Ljava/lang/Throwable; {:nv_try .. :nv_try_end} :nv_catch
    :nv_catch
    return-void
.end method


.method protected onPause()V
    .locals 1
    invoke-super {p0}, Landroid/app/Activity;->onPause()V
    iget-object v0, p0, Lcom/screenflow/tv/MainActivity;->player:Landroid/webkit/WebView;
    if-eqz v0, :np
    invoke-virtual {v0}, Landroid/webkit/WebView;->onPause()V
    :np
    :nv_try
    invoke-static {}, Lcom/screenflow/tv/nv/NativeVideo;->onPause()V
    :nv_try_end
    .catch Ljava/lang/Throwable; {:nv_try .. :nv_try_end} :nv_catch
    :nv_catch
    return-void
.end method


.method public onWindowFocusChanged(Z)V
    .locals 0
    invoke-super {p0, p1}, Landroid/app/Activity;->onWindowFocusChanged(Z)V
    if-eqz p1, :done
    invoke-virtual {p0}, Lcom/screenflow/tv/MainActivity;->immersive()V
    :done
    return-void
.end method


.method public runUiJs(Ljava/lang/String;)V
    .locals 2
    iget-object v0, p0, Lcom/screenflow/tv/MainActivity;->ui:Landroid/webkit/WebView;
    if-eqz v0, :done
    const/4 v1, 0x0
    invoke-virtual {v0, p1, v1}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V
    :done
    return-void
.end method


.method public showUi(Ljava/lang/String;)V
    .locals 2
    const/4 v0, 0x1
    iput-boolean v0, p0, Lcom/screenflow/tv/MainActivity;->uiOpen:Z
    iget-object v0, p0, Lcom/screenflow/tv/MainActivity;->ui:Landroid/webkit/WebView;
    const/4 v1, 0x0
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->setVisibility(I)V
    invoke-virtual {v0}, Landroid/webkit/WebView;->requestFocus()Z
    if-eqz p1, :done
    invoke-virtual {p0, p1}, Lcom/screenflow/tv/MainActivity;->runUiJs(Ljava/lang/String;)V
    :done
    return-void
.end method


.method public hideUi()V
    .locals 2
    const/4 v0, 0x0
    iput-boolean v0, p0, Lcom/screenflow/tv/MainActivity;->uiOpen:Z
    iget-object v0, p0, Lcom/screenflow/tv/MainActivity;->ui:Landroid/webkit/WebView;
    const/16 v1, 0x8
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->setVisibility(I)V
    iget-object v0, p0, Lcom/screenflow/tv/MainActivity;->player:Landroid/webkit/WebView;
    invoke-virtual {v0}, Landroid/webkit/WebView;->requestFocus()Z
    return-void
.end method


# Executa no thread da interface (chamado por Act).
.method public doOp(ILjava/lang/String;)V
    .locals 3

    const/4 v0, 0x1
    if-ne p1, v0, :op2
    invoke-virtual {p0}, Lcom/screenflow/tv/MainActivity;->hideUi()V
    return-void

    :op2
    const/4 v0, 0x2
    if-ne p1, v0, :op3
    invoke-virtual {p0}, Lcom/screenflow/tv/MainActivity;->hideUi()V
    iget-object v1, p0, Lcom/screenflow/tv/MainActivity;->player:Landroid/webkit/WebView;
    invoke-virtual {v1, p2}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V
    return-void

    :op3
    const/4 v0, 0x3
    if-ne p1, v0, :op4
    iget-object v1, p0, Lcom/screenflow/tv/MainActivity;->player:Landroid/webkit/WebView;
    invoke-virtual {v1}, Landroid/webkit/WebView;->reload()V
    return-void

    :op4
    const/4 v0, 0x4
    if-ne p1, v0, :op5
    invoke-virtual {p0, p2}, Lcom/screenflow/tv/MainActivity;->showUi(Ljava/lang/String;)V
    return-void

    :op5
    const/4 v0, 0x5
    if-ne p1, v0, :op6
    iget-object v1, p0, Lcom/screenflow/tv/MainActivity;->player:Landroid/webkit/WebView;
    const-string v2, "about:blank"
    invoke-virtual {v1, v2}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V
    return-void

    :op6
    const/4 v0, 0x6
    if-ne p1, v0, :op7
    iget-object v1, p0, Lcom/screenflow/tv/MainActivity;->player:Landroid/webkit/WebView;
    const/4 v2, 0x1
    invoke-virtual {v1, v2}, Landroid/webkit/WebView;->clearCache(Z)V
    invoke-virtual {v1}, Landroid/webkit/WebView;->reload()V
    return-void

    :op7
    const/4 v0, 0x7
    if-ne p1, v0, :end
    const/4 v2, 0x1
    invoke-static {p0, p2, v2}, Landroid/widget/Toast;->makeText(Landroid/content/Context;Ljava/lang/CharSequence;I)Landroid/widget/Toast;
    move-result-object v1
    invoke-virtual {v1}, Landroid/widget/Toast;->show()V

    :end
    return-void
.end method


# Erro ao carregar a página do player (sem internet, servidor fora...)
.method public onWebError(Landroid/webkit/WebView;Ljava/lang/String;Ljava/lang/String;)V
    .locals 3
    iget-object v0, p0, Lcom/screenflow/tv/MainActivity;->player:Landroid/webkit/WebView;
    if-ne p1, v0, :done

    new-instance v0, Ljava/lang/StringBuilder;
    invoke-direct {v0}, Ljava/lang/StringBuilder;-><init>()V
    const-string v1, "onPlayerError("
    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-static {p2}, Lorg/json/JSONObject;->quote(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v1
    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v1, ","
    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-static {p3}, Lorg/json/JSONObject;->quote(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v1
    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v1, ")"
    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v1
    invoke-virtual {p0, v1}, Lcom/screenflow/tv/MainActivity;->showUi(Ljava/lang/String;)V

    :done
    return-void
.end method


# Controle remoto:
#  - Com o menu aberto: VOLTAR/MENU chamam uiBack() na interface.
#  - Tocando anúncio: MENU / CONFIG / INFO / GUIA abrem o menu;
#    segurar OK ~1s abre o menu; VOLTAR 3x abre o menu.
.method public dispatchKeyEvent(Landroid/view/KeyEvent;)Z
    .locals 8

    invoke-virtual {p1}, Landroid/view/KeyEvent;->getKeyCode()I
    move-result v0
    invoke-virtual {p1}, Landroid/view/KeyEvent;->getAction()I
    move-result v1
    const/4 v2, 0x1

    iget-boolean v3, p0, Lcom/screenflow/tv/MainActivity;->uiOpen:Z
    if-eqz v3, :player_mode

    # ---------- menu aberto ----------
    iget-boolean v3, p0, Lcom/screenflow/tv/MainActivity;->menuFired:Z
    if-eqz v3, :ui_keys
    const/16 v4, 0x17
    if-eq v0, v4, :swallow_fired
    const/16 v4, 0x42
    if-eq v0, v4, :swallow_fired
    const/16 v4, 0xa0
    if-eq v0, v4, :swallow_fired
    goto :ui_keys

    :swallow_fired
    if-ne v1, v2, :ret_true
    const/4 v3, 0x0
    iput-boolean v3, p0, Lcom/screenflow/tv/MainActivity;->menuFired:Z
    goto :ret_true

    :ui_keys
    const/4 v4, 0x4
    if-eq v0, v4, :ui_back
    const/16 v4, 0x52
    if-eq v0, v4, :ui_back
    const/16 v4, 0x6f
    if-eq v0, v4, :ui_back
    invoke-super {p0, p1}, Landroid/app/Activity;->dispatchKeyEvent(Landroid/view/KeyEvent;)Z
    move-result v3
    return v3

    :ui_back
    if-ne v1, v2, :ret_true
    const-string v3, "uiBack()"
    invoke-virtual {p0, v3}, Lcom/screenflow/tv/MainActivity;->runUiJs(Ljava/lang/String;)V
    goto :ret_true

    # ---------- tocando anúncio ----------
    :player_mode
    const/16 v4, 0x52
    if-eq v0, v4, :open_menu_up
    const/16 v4, 0xb0
    if-eq v0, v4, :open_menu_up
    const/16 v4, 0xa5
    if-eq v0, v4, :open_menu_up
    const/16 v4, 0xac
    if-eq v0, v4, :open_menu_up
    const/4 v4, 0x4
    if-eq v0, v4, :back_key
    const/16 v4, 0x17
    if-eq v0, v4, :center_key
    const/16 v4, 0x42
    if-eq v0, v4, :center_key
    invoke-super {p0, p1}, Landroid/app/Activity;->dispatchKeyEvent(Landroid/view/KeyEvent;)Z
    move-result v3
    return v3

    :open_menu_up
    if-ne v1, v2, :ret_true
    const-string v3, "openMenu()"
    invoke-virtual {p0, v3}, Lcom/screenflow/tv/MainActivity;->showUi(Ljava/lang/String;)V
    goto :ret_true

    :center_key
    if-nez v1, :center_pass
    invoke-virtual {p1}, Landroid/view/KeyEvent;->getRepeatCount()I
    move-result v3
    if-nez v3, :center_rep
    const/4 v4, 0x0
    iput-boolean v4, p0, Lcom/screenflow/tv/MainActivity;->menuFired:Z
    goto :center_pass

    :center_rep
    const/16 v4, 0xc
    if-lt v3, v4, :ret_true
    iget-boolean v3, p0, Lcom/screenflow/tv/MainActivity;->menuFired:Z
    if-nez v3, :ret_true
    iput-boolean v2, p0, Lcom/screenflow/tv/MainActivity;->menuFired:Z
    const-string v3, "openMenu()"
    invoke-virtual {p0, v3}, Lcom/screenflow/tv/MainActivity;->showUi(Ljava/lang/String;)V
    goto :ret_true

    :center_pass
    invoke-super {p0, p1}, Landroid/app/Activity;->dispatchKeyEvent(Landroid/view/KeyEvent;)Z
    move-result v3
    return v3

    :back_key
    if-ne v1, v2, :ret_true
    invoke-static {}, Landroid/os/SystemClock;->uptimeMillis()J
    move-result-wide v4
    iget-wide v6, p0, Lcom/screenflow/tv/MainActivity;->lastBack:J
    sub-long/2addr v6, v4
    neg-long v6, v6
    iput-wide v4, p0, Lcom/screenflow/tv/MainActivity;->lastBack:J
    const-wide/16 v4, 0x9c4
    cmp-long v3, v6, v4
    if-lez v3, :count
    # passou mais de 2,5 s desde o último VOLTAR: recomeça a contagem
    const/4 v3, 0x0
    iput v3, p0, Lcom/screenflow/tv/MainActivity;->backCount:I

    :count
    iget v3, p0, Lcom/screenflow/tv/MainActivity;->backCount:I
    add-int/lit8 v3, v3, 0x1
    iput v3, p0, Lcom/screenflow/tv/MainActivity;->backCount:I
    const/4 v4, 0x3
    if-ge v3, v4, :back_open

    rsub-int/lit8 v3, v3, 0x3
    new-instance v4, Ljava/lang/StringBuilder;
    invoke-direct {v4}, Ljava/lang/StringBuilder;-><init>()V
    const-string v5, "Aperte VOLTAR mais "
    invoke-virtual {v4, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v4, v3}, Ljava/lang/StringBuilder;->append(I)Ljava/lang/StringBuilder;
    const-string v5, "x para abrir o menu"
    invoke-virtual {v4, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v4}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v4
    const/4 v5, 0x0
    invoke-static {p0, v4, v5}, Landroid/widget/Toast;->makeText(Landroid/content/Context;Ljava/lang/CharSequence;I)Landroid/widget/Toast;
    move-result-object v4
    invoke-virtual {v4}, Landroid/widget/Toast;->show()V
    goto :ret_true

    :back_open
    const/4 v3, 0x0
    iput v3, p0, Lcom/screenflow/tv/MainActivity;->backCount:I
    const-string v3, "openMenu()"
    invoke-virtual {p0, v3}, Lcom/screenflow/tv/MainActivity;->showUi(Ljava/lang/String;)V

    :ret_true
    return v2
.end method
