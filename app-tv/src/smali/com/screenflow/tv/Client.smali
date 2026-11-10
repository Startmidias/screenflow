.class public Lcom/screenflow/tv/Client;
.super Landroid/webkit/WebViewClient;
.source "Client.java"

.field final a:Lcom/screenflow/tv/MainActivity;

.method public constructor <init>(Lcom/screenflow/tv/MainActivity;)V
    .locals 0
    invoke-direct {p0}, Landroid/webkit/WebViewClient;-><init>()V
    iput-object p1, p0, Lcom/screenflow/tv/Client;->a:Lcom/screenflow/tv/MainActivity;
    return-void
.end method

# Erro na página principal (sem internet, endereço errado...)
.method public onReceivedError(Landroid/webkit/WebView;ILjava/lang/String;Ljava/lang/String;)V
    .locals 1
    iget-object v0, p0, Lcom/screenflow/tv/Client;->a:Lcom/screenflow/tv/MainActivity;
    invoke-virtual {v0, p1, p3, p4}, Lcom/screenflow/tv/MainActivity;->onWebError(Landroid/webkit/WebView;Ljava/lang/String;Ljava/lang/String;)V
    return-void
.end method

# Mantém a navegação dentro do app; bloqueia links que abririam outros apps.
.method public shouldOverrideUrlLoading(Landroid/webkit/WebView;Ljava/lang/String;)Z
    .locals 2
    if-eqz p2, :block
    const-string v0, "http"
    invoke-virtual {p2, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
    move-result v1
    if-nez v1, :allow
    const-string v0, "file:"
    invoke-virtual {p2, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
    move-result v1
    if-nez v1, :allow
    const-string v0, "about:"
    invoke-virtual {p2, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
    move-result v1
    if-nez v1, :allow
    :block
    const/4 v0, 0x1
    return v0
    :allow
    const/4 v0, 0x0
    return v0
.end method
