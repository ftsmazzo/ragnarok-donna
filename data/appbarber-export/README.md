# Export AppBarber (opcional, para bootstrap automático no deploy)

Se `agenda.json` e `comandas-historico.json` estiverem aqui, o app vincula
automaticamente clientes ↔ agenda ↔ comandas na subida (sem terminal no EasyPanel).

Copie do export local:

```powershell
mkdir data\appbarber-export -Force
Copy-Item research\export\2026-08-26T14-56-45\agenda.json data\appbarber-export\
Copy-Item research\export\2026-08-26T14-56-45\comandas-historico.json data\appbarber-export\
```

Sem esses arquivos, o bootstrap ainda roda SQL de cruzamento (Com_Codigo, meta, telefone).
