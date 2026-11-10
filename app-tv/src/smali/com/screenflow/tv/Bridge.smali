.class public Lcom/screenflow/tv/Bridge;
.super Ljava/lang/Object;
.source "Bridge.java"

# Ponte JavaScript -> Android, disponível na interface como window.TV

.field final a:Lcom/screenflow/tv/MainActivity;


.method public constructor <init>(Lcom/screenflow/tv/MainActivity;)V
    .locals 0
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    iput-object p1, p0, Lcom/screenflow/tv/Bridge;->a:Lcom/screenflow/tv/MainActivity;
    return-void
.end method


.method private post(ILjava/lang/String;)V
    .locals 2
    new-instance v0, Lcom/screenflow/tv/Act;
    iget-object v1, p0, Lcom/screenflow/tv/Bridge;->a:Lcom/screenflow/tv/MainActivity;
    invoke-direct {v0, v1, p1, p2}, Lcom/screenflow/tv/Act;-><init>(Lcom/screenflow/tv/MainActivity;ILjava/lang/String;)V
    invoke-virtual {v1, v0}, Lcom/screenflow/tv/MainActivity;->runOnUiThread(Ljava/lang/Runnable;)V
    return-void
.end method


.method public close()V
    .locals 2
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    const/4 v0, 0x1
    const/4 v1, 0x0
    invoke-direct {p0, v0, v1}, Lcom/screenflow/tv/Bridge;->post(ILjava/lang/String;)V
    return-void
.end method


.method public play(Ljava/lang/String;)V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    const/4 v0, 0x2
    invoke-direct {p0, v0, p1}, Lcom/screenflow/tv/Bridge;->post(ILjava/lang/String;)V
    return-void
.end method


.method public reload()V
    .locals 2
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    const/4 v0, 0x3
    const/4 v1, 0x0
    invoke-direct {p0, v0, v1}, Lcom/screenflow/tv/Bridge;->post(ILjava/lang/String;)V
    return-void
.end method


.method public stop()V
    .locals 2
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    const/4 v0, 0x5
    const/4 v1, 0x0
    invoke-direct {p0, v0, v1}, Lcom/screenflow/tv/Bridge;->post(ILjava/lang/String;)V
    return-void
.end method


.method public clearCache()V
    .locals 2
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    const/4 v0, 0x6
    const/4 v1, 0x0
    invoke-direct {p0, v0, v1}, Lcom/screenflow/tv/Bridge;->post(ILjava/lang/String;)V
    return-void
.end method


.method public toast(Ljava/lang/String;)V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    const/4 v0, 0x7
    invoke-direct {p0, v0, p1}, Lcom/screenflow/tv/Bridge;->post(ILjava/lang/String;)V
    return-void
.end method


.method public intentUrl()Ljava/lang/String;
    .locals 3
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    iget-object v0, p0, Lcom/screenflow/tv/Bridge;->a:Lcom/screenflow/tv/MainActivity;
    iget-object v1, v0, Lcom/screenflow/tv/MainActivity;->intentUrl:Ljava/lang/String;
    const/4 v2, 0x0
    iput-object v2, v0, Lcom/screenflow/tv/MainActivity;->intentUrl:Ljava/lang/String;
    if-nez v1, :ok
    const-string v1, ""
    :ok
    return-object v1
.end method


# Abre uma tela de configuração do Android (ex.: android.settings.WIFI_SETTINGS)
.method public openSettings(Ljava/lang/String;)Z
    .locals 3
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    :try_start_0
    new-instance v0, Landroid/content/Intent;
    invoke-direct {v0, p1}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V
    const/high16 v1, 0x10000000
    invoke-virtual {v0, v1}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;
    iget-object v2, p0, Lcom/screenflow/tv/Bridge;->a:Lcom/screenflow/tv/MainActivity;
    invoke-virtual {v2, v0}, Lcom/screenflow/tv/MainActivity;->startActivity(Landroid/content/Intent;)V
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0
    const/4 v0, 0x1
    return v0

    :catch_0
    move-exception v0
    const/4 v0, 0x0
    return v0
.end method


# Abre outro aplicativo instalado pelo nome do pacote
.method public launch(Ljava/lang/String;)Z
    .locals 4
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    :try_start_0
    iget-object v0, p0, Lcom/screenflow/tv/Bridge;->a:Lcom/screenflow/tv/MainActivity;
    invoke-virtual {v0}, Lcom/screenflow/tv/MainActivity;->getPackageManager()Landroid/content/pm/PackageManager;
    move-result-object v1
    invoke-virtual {v1, p1}, Landroid/content/pm/PackageManager;->getLeanbackLaunchIntentForPackage(Ljava/lang/String;)Landroid/content/Intent;
    move-result-object v2
    if-nez v2, :have
    invoke-virtual {v1, p1}, Landroid/content/pm/PackageManager;->getLaunchIntentForPackage(Ljava/lang/String;)Landroid/content/Intent;
    move-result-object v2
    if-nez v2, :have
    new-instance v2, Landroid/content/Intent;
    const-string v3, "android.intent.action.MAIN"
    invoke-direct {v2, v3}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V
    const-string v3, "android.intent.category.HOME"
    invoke-virtual {v2, v3}, Landroid/content/Intent;->addCategory(Ljava/lang/String;)Landroid/content/Intent;
    invoke-virtual {v2, p1}, Landroid/content/Intent;->setPackage(Ljava/lang/String;)Landroid/content/Intent;
    :have
    const/high16 v3, 0x10000000
    invoke-virtual {v2, v3}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;
    invoke-virtual {v0, v2}, Lcom/screenflow/tv/MainActivity;->startActivity(Landroid/content/Intent;)V
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0
    const/4 v0, 0x1
    return v0

    :catch_0
    move-exception v0
    const/4 v0, 0x0
    return v0
.end method


# Lista de apps (JSON): [{pkg, cls, label, cat}]
.method public apps()Ljava/lang/String;
    .locals 3
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    new-instance v0, Lorg/json/JSONArray;
    invoke-direct {v0}, Lorg/json/JSONArray;-><init>()V
    :try_start_0
    iget-object v1, p0, Lcom/screenflow/tv/Bridge;->a:Lcom/screenflow/tv/MainActivity;
    invoke-virtual {v1}, Lcom/screenflow/tv/MainActivity;->getPackageManager()Landroid/content/pm/PackageManager;
    move-result-object v1
    const-string v2, "android.intent.category.LEANBACK_LAUNCHER"
    invoke-direct {p0, v0, v1, v2}, Lcom/screenflow/tv/Bridge;->addApps(Lorg/json/JSONArray;Landroid/content/pm/PackageManager;Ljava/lang/String;)V
    const-string v2, "android.intent.category.LAUNCHER"
    invoke-direct {p0, v0, v1, v2}, Lcom/screenflow/tv/Bridge;->addApps(Lorg/json/JSONArray;Landroid/content/pm/PackageManager;Ljava/lang/String;)V
    const-string v2, "android.intent.category.HOME"
    invoke-direct {p0, v0, v1, v2}, Lcom/screenflow/tv/Bridge;->addApps(Lorg/json/JSONArray;Landroid/content/pm/PackageManager;Ljava/lang/String;)V
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0

    :catch_0
    invoke-virtual {v0}, Lorg/json/JSONArray;->toString()Ljava/lang/String;
    move-result-object v1
    return-object v1
.end method


.method private addApps(Lorg/json/JSONArray;Landroid/content/pm/PackageManager;Ljava/lang/String;)V
    .locals 7
    new-instance v0, Landroid/content/Intent;
    const-string v1, "android.intent.action.MAIN"
    invoke-direct {v0, v1}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V
    invoke-virtual {v0, p3}, Landroid/content/Intent;->addCategory(Ljava/lang/String;)Landroid/content/Intent;
    const/4 v1, 0x0
    invoke-virtual {p2, v0, v1}, Landroid/content/pm/PackageManager;->queryIntentActivities(Landroid/content/Intent;I)Ljava/util/List;
    move-result-object v0
    if-eqz v0, :done
    invoke-interface {v0}, Ljava/util/List;->size()I
    move-result v2
    const/4 v1, 0x0

    :loop
    if-ge v1, v2, :done
    invoke-interface {v0, v1}, Ljava/util/List;->get(I)Ljava/lang/Object;
    move-result-object v3
    check-cast v3, Landroid/content/pm/ResolveInfo;
    new-instance v4, Lorg/json/JSONObject;
    invoke-direct {v4}, Lorg/json/JSONObject;-><init>()V

    iget-object v5, v3, Landroid/content/pm/ResolveInfo;->activityInfo:Landroid/content/pm/ActivityInfo;
    iget-object v6, v5, Landroid/content/pm/PackageItemInfo;->packageName:Ljava/lang/String;
    const-string v5, "pkg"
    invoke-virtual {v4, v5, v6}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;

    iget-object v5, v3, Landroid/content/pm/ResolveInfo;->activityInfo:Landroid/content/pm/ActivityInfo;
    iget-object v6, v5, Landroid/content/pm/PackageItemInfo;->name:Ljava/lang/String;
    const-string v5, "cls"
    invoke-virtual {v4, v5, v6}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;

    invoke-virtual {v3, p2}, Landroid/content/pm/ResolveInfo;->loadLabel(Landroid/content/pm/PackageManager;)Ljava/lang/CharSequence;
    move-result-object v6
    if-eqz v6, :no_label
    invoke-virtual {v6}, Ljava/lang/Object;->toString()Ljava/lang/String;
    move-result-object v6
    const-string v5, "label"
    invoke-virtual {v4, v5, v6}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;
    :no_label

    const-string v5, "cat"
    invoke-virtual {v4, v5, p3}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;
    invoke-virtual {p1, v4}, Lorg/json/JSONArray;->put(Ljava/lang/Object;)Lorg/json/JSONArray;

    add-int/lit8 v1, v1, 0x1
    goto :loop

    :done
    return-void
.end method


# Informações do aparelho (JSON)
.method public info()Ljava/lang/String;
    .locals 9
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    new-instance v0, Lorg/json/JSONObject;
    invoke-direct {v0}, Lorg/json/JSONObject;-><init>()V
    iget-object v1, p0, Lcom/screenflow/tv/Bridge;->a:Lcom/screenflow/tv/MainActivity;

    # --- aparelho ---
    :try_start_0
    const-string v2, "model"
    sget-object v3, Landroid/os/Build;->MODEL:Ljava/lang/String;
    invoke-virtual {v0, v2, v3}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;
    const-string v2, "maker"
    sget-object v3, Landroid/os/Build;->MANUFACTURER:Ljava/lang/String;
    invoke-virtual {v0, v2, v3}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;
    const-string v2, "hw"
    sget-object v3, Landroid/os/Build;->HARDWARE:Ljava/lang/String;
    invoke-virtual {v0, v2, v3}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;
    const-string v2, "android"
    sget-object v3, Landroid/os/Build$VERSION;->RELEASE:Ljava/lang/String;
    invoke-virtual {v0, v2, v3}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;
    const-string v2, "sdk"
    sget v3, Landroid/os/Build$VERSION;->SDK_INT:I
    invoke-virtual {v0, v2, v3}, Lorg/json/JSONObject;->put(Ljava/lang/String;I)Lorg/json/JSONObject;

    new-instance v4, Landroid/util/DisplayMetrics;
    invoke-direct {v4}, Landroid/util/DisplayMetrics;-><init>()V
    invoke-virtual {v1}, Lcom/screenflow/tv/MainActivity;->getWindowManager()Landroid/view/WindowManager;
    move-result-object v5
    invoke-interface {v5}, Landroid/view/WindowManager;->getDefaultDisplay()Landroid/view/Display;
    move-result-object v5
    invoke-virtual {v5, v4}, Landroid/view/Display;->getRealMetrics(Landroid/util/DisplayMetrics;)V
    const-string v2, "w"
    iget v3, v4, Landroid/util/DisplayMetrics;->widthPixels:I
    invoke-virtual {v0, v2, v3}, Lorg/json/JSONObject;->put(Ljava/lang/String;I)Lorg/json/JSONObject;
    const-string v2, "h"
    iget v3, v4, Landroid/util/DisplayMetrics;->heightPixels:I
    invoke-virtual {v0, v2, v3}, Lorg/json/JSONObject;->put(Ljava/lang/String;I)Lorg/json/JSONObject;
    const-string v2, "dpi"
    iget v3, v4, Landroid/util/DisplayMetrics;->densityDpi:I
    invoke-virtual {v0, v2, v3}, Lorg/json/JSONObject;->put(Ljava/lang/String;I)Lorg/json/JSONObject;
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0
    :catch_0

    # --- versão do app ---
    :try_start_1
    invoke-virtual {v1}, Lcom/screenflow/tv/MainActivity;->getPackageManager()Landroid/content/pm/PackageManager;
    move-result-object v4
    invoke-virtual {v1}, Lcom/screenflow/tv/MainActivity;->getPackageName()Ljava/lang/String;
    move-result-object v5
    const/4 v6, 0x0
    invoke-virtual {v4, v5, v6}, Landroid/content/pm/PackageManager;->getPackageInfo(Ljava/lang/String;I)Landroid/content/pm/PackageInfo;
    move-result-object v6
    const-string v2, "version"
    iget-object v3, v6, Landroid/content/pm/PackageInfo;->versionName:Ljava/lang/String;
    invoke-virtual {v0, v2, v3}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;

    # --- qual é a tela inicial padrão ---
    new-instance v6, Landroid/content/Intent;
    const-string v3, "android.intent.action.MAIN"
    invoke-direct {v6, v3}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V
    const-string v3, "android.intent.category.HOME"
    invoke-virtual {v6, v3}, Landroid/content/Intent;->addCategory(Ljava/lang/String;)Landroid/content/Intent;
    const/high16 v3, 0x10000
    invoke-virtual {v4, v6, v3}, Landroid/content/pm/PackageManager;->resolveActivity(Landroid/content/Intent;I)Landroid/content/pm/ResolveInfo;
    move-result-object v6
    if-eqz v6, :no_home
    iget-object v6, v6, Landroid/content/pm/ResolveInfo;->activityInfo:Landroid/content/pm/ActivityInfo;
    iget-object v3, v6, Landroid/content/pm/PackageItemInfo;->packageName:Ljava/lang/String;
    const-string v2, "home"
    invoke-virtual {v0, v2, v3}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;
    :no_home
    const-string v2, "self"
    invoke-virtual {v0, v2, v5}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;
    :try_end_1
    .catch Ljava/lang/Exception; {:try_start_1 .. :try_end_1} :catch_1
    :catch_1

    # --- rede ---
    :try_start_2
    const-string v2, "connectivity"
    invoke-virtual {v1, v2}, Lcom/screenflow/tv/MainActivity;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;
    move-result-object v4
    check-cast v4, Landroid/net/ConnectivityManager;
    invoke-virtual {v4}, Landroid/net/ConnectivityManager;->getActiveNetworkInfo()Landroid/net/NetworkInfo;
    move-result-object v4
    const/4 v3, 0x0
    if-eqz v4, :net_done
    invoke-virtual {v4}, Landroid/net/NetworkInfo;->isConnected()Z
    move-result v3
    const-string v2, "net"
    invoke-virtual {v4}, Landroid/net/NetworkInfo;->getTypeName()Ljava/lang/String;
    move-result-object v5
    invoke-virtual {v0, v2, v5}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;
    :net_done
    const-string v2, "online"
    invoke-virtual {v0, v2, v3}, Lorg/json/JSONObject;->put(Ljava/lang/String;Z)Lorg/json/JSONObject;
    :try_end_2
    .catch Ljava/lang/Exception; {:try_start_2 .. :try_end_2} :catch_2
    :catch_2

    # --- nome do Wi-Fi ---
    :try_start_3
    invoke-virtual {v1}, Lcom/screenflow/tv/MainActivity;->getApplicationContext()Landroid/content/Context;
    move-result-object v4
    const-string v2, "wifi"
    invoke-virtual {v4, v2}, Landroid/content/Context;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;
    move-result-object v4
    check-cast v4, Landroid/net/wifi/WifiManager;
    invoke-virtual {v4}, Landroid/net/wifi/WifiManager;->getConnectionInfo()Landroid/net/wifi/WifiInfo;
    move-result-object v4
    if-eqz v4, :wifi_done
    invoke-virtual {v4}, Landroid/net/wifi/WifiInfo;->getSSID()Ljava/lang/String;
    move-result-object v5
    const-string v2, "ssid"
    invoke-virtual {v0, v2, v5}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;
    :wifi_done
    :try_end_3
    .catch Ljava/lang/Exception; {:try_start_3 .. :try_end_3} :catch_3
    :catch_3

    # --- endereços IP (Wi-Fi e cabo) ---
    :try_start_4
    new-instance v4, Ljava/lang/StringBuilder;
    invoke-direct {v4}, Ljava/lang/StringBuilder;-><init>()V
    invoke-static {}, Ljava/net/NetworkInterface;->getNetworkInterfaces()Ljava/util/Enumeration;
    move-result-object v5
    if-eqz v5, :ip_done

    :if_loop
    invoke-interface {v5}, Ljava/util/Enumeration;->hasMoreElements()Z
    move-result v2
    if-eqz v2, :ip_done
    invoke-interface {v5}, Ljava/util/Enumeration;->nextElement()Ljava/lang/Object;
    move-result-object v6
    check-cast v6, Ljava/net/NetworkInterface;
    invoke-virtual {v6}, Ljava/net/NetworkInterface;->getInetAddresses()Ljava/util/Enumeration;
    move-result-object v7

    :addr_loop
    invoke-interface {v7}, Ljava/util/Enumeration;->hasMoreElements()Z
    move-result v2
    if-eqz v2, :if_loop
    invoke-interface {v7}, Ljava/util/Enumeration;->nextElement()Ljava/lang/Object;
    move-result-object v8
    check-cast v8, Ljava/net/InetAddress;
    instance-of v2, v8, Ljava/net/Inet4Address;
    if-eqz v2, :addr_loop
    invoke-virtual {v8}, Ljava/net/InetAddress;->isLoopbackAddress()Z
    move-result v2
    if-nez v2, :addr_loop
    invoke-virtual {v8}, Ljava/net/InetAddress;->getHostAddress()Ljava/lang/String;
    move-result-object v3
    invoke-virtual {v4, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v3, " ("
    invoke-virtual {v4, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v6}, Ljava/net/NetworkInterface;->getName()Ljava/lang/String;
    move-result-object v3
    invoke-virtual {v4, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v3, ") "
    invoke-virtual {v4, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    goto :addr_loop

    :ip_done
    const-string v2, "ip"
    invoke-virtual {v4}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v3
    invoke-virtual {v3}, Ljava/lang/String;->trim()Ljava/lang/String;
    move-result-object v3
    invoke-virtual {v0, v2, v3}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;
    :try_end_4
    .catch Ljava/lang/Exception; {:try_start_4 .. :try_end_4} :catch_4
    :catch_4

    invoke-virtual {v0}, Lorg/json/JSONObject;->toString()Ljava/lang/String;
    move-result-object v2
    return-object v2
.end method
