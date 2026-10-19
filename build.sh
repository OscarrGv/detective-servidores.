#!/usr/bin/env bash
# Construye el sitio: corre el programa de Python, arma el reporte Word y el .zip.
set -euo pipefail
rm -rf public && mkdir -p public/descargas
cp index.html public/
cp red_bayesiana_bd.py public/descargas/

PY=$(command -v python3)
echo "Python: $($PY --version)"
if ! $PY -c "import matplotlib, networkx" 2>/dev/null; then
  $PY -m venv .venv
  .venv/bin/pip install -q matplotlib networkx
  PY="$PWD/.venv/bin/python"
fi

# 1) El programa genera resultados/ (consultas.txt y las dos gráficas)
(cd public/descargas && MPLBACKEND=Agg $PY red_bayesiana_bd.py > /dev/null)
cp public/descargas/resultados/*.png public/

# 2) El reporte Word, con las gráficas recién generadas
RES=public/descargas/resultados OUT=raw.docx node reporte/build.js
$PY reporte/finish.py raw.docx public/descargas/Reporte_Red_Bayesiana_BD.docx

# 3) El .zip con el programa, la página y los resultados
$PY - <<'PYZIP'
import zipfile, os
with zipfile.ZipFile("public/descargas/Codigo_Red_Bayesiana.zip", "w", zipfile.ZIP_DEFLATED) as z:
    z.write("red_bayesiana_bd.py", "red_bayesiana_bd.py")
    html = open("index.html", encoding="utf-8").read()
    for a, b in [('src="diagrama_red.png"', 'src="resultados/diagrama_red.png"'),
                 ('src="evolucion_probabilidades.png"', 'src="resultados/evolucion_probabilidades.png"'),
                 ("descargas/resultados/", "resultados/"), ("descargas/red_bayesiana_bd.py", "red_bayesiana_bd.py")]:
        html = html.replace(a, b)
    z.writestr("detective_servidores.html", html)
    for f in sorted(os.listdir("public/descargas/resultados")):
        z.write(os.path.join("public/descargas/resultados", f), "resultados/" + f)
PYZIP
ls -la public public/descargas
