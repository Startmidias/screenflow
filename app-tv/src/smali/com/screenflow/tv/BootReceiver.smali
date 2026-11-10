.class public Lcom/screenflow/tv/BootReceiver;
.super Landroid/content/BroadcastReceiver;
.source "BootReceiver.java"

# Reserva: abre o ScreenFlow quando o aparelho liga
# (o principal é o app ser a tela inicial).

.method public constructor <init>()V
    .locals 0
    invoke-direct {p0}, Landroid/content/BroadcastReceiver;-><init>()V
    return-void
.end method

.method public onReceive(Landroid/content/Context;Landroid/content/Intent;)V
    .locals 2
    :try_start_0
    new-instance v0, Landroid/content/Intent;
    const-class v1, Lcom/screenflow/tv/MainActivity;
    invoke-direct {v0, p1, v1}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V
    const/high16 v1, 0x10000000
    invoke-virtual {v0, v1}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;
    invoke-virtual {p1, v0}, Landroid/content/Context;->startActivity(Landroid/content/Intent;)V
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0
    :catch_0
    return-void
.end method
