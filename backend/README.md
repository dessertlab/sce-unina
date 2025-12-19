# SCE-UNINA backend

### Avvio del server utilizzo dall'estensione VSCODIUM

Il server di backend SCE-UNINA sarà in ascolto sul porto 5001 di default. Aprire un prompt dei comandi e lanciare:

```
python sce_unina_server.py
```

L'output sarà come di seguito:

```
* Serving Flask app 'sce_unina_server'
 * Debug mode: off
WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.
 * Running on all addresses (0.0.0.0)
 * Running on http://127.0.0.1:5001
Press CTRL+C to quit
```


### Avvio del server di consegna senza l'integrazione in VSCODIUM

```
$ cd backend/deus/
$ python deus_server.py
Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...
```

Gli studenti dovranno collegarsi a ``IP_DOCENTE:8000`` per fare l'upload dei file.
