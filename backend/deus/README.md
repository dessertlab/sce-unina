# SCE-UNINA: ``deus`` backend

### Avvio del server di consegna senza l'integrazione in VSCODIUM

``deus`` è il backend di consegna non integrato in VSCodium/VSCode. 
In ogni caso, permette agli studenti di fare l'upload di file d'esame verso la macchina docente.

```
$ cd backend/deus/
$ python deus_server.py
Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...
```

Gli studenti dovranno collegarsi a ``IP_DOCENTE:8000`` per fare l'upload dei file.
