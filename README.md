# Detective de Servidores

Red bayesiana interactiva para diagnosticar un servidor de base de datos.
Proyecto de la Unidad 2 de Inteligencia Artificial, Instituto Tecnológico de Veracruz.
Integrantes: Oscar Gómez Vásquez, Said Rosas Vera, Brayan Apolinar Ávila.

Sitio: https://detective-servidores.vercel.app

## Qué hay aquí

- `index.html`: la página interactiva.
- `red_bayesiana_bd.py`: el programa en Python con la red y las siete consultas.
- `reporte/`: el script que arma el reporte en Word.
- `build.sh`: lo que corre Vercel al publicar. Ejecuta el programa, genera las gráficas, arma el Word y el .zip de descargas.

## Correr el programa

    pip install pgmpy matplotlib networkx
    python red_bayesiana_bd.py
