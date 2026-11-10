.class public Lcom/screenflow/tv/Act;
.super Ljava/lang/Object;
.source "Act.java"
.implements Ljava/lang/Runnable;

# Leva um pedido da interface (JS) para o thread principal.

.field final a:Lcom/screenflow/tv/MainActivity;
.field final op:I
.field final arg:Ljava/lang/String;

.method public constructor <init>(Lcom/screenflow/tv/MainActivity;ILjava/lang/String;)V
    .locals 0
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    iput-object p1, p0, Lcom/screenflow/tv/Act;->a:Lcom/screenflow/tv/MainActivity;
    iput p2, p0, Lcom/screenflow/tv/Act;->op:I
    iput-object p3, p0, Lcom/screenflow/tv/Act;->arg:Ljava/lang/String;
    return-void
.end method

.method public run()V
    .locals 3
    iget-object v0, p0, Lcom/screenflow/tv/Act;->a:Lcom/screenflow/tv/MainActivity;
    iget v1, p0, Lcom/screenflow/tv/Act;->op:I
    iget-object v2, p0, Lcom/screenflow/tv/Act;->arg:Ljava/lang/String;
    invoke-virtual {v0, v1, v2}, Lcom/screenflow/tv/MainActivity;->doOp(ILjava/lang/String;)V
    return-void
.end method
