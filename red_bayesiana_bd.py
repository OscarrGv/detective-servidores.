"""
Red Bayesiana: ¿por qué está fallando el servidor de base de datos?
====================================================================

Proyecto de la Unidad 2 de Inteligencia Artificial
Instituto Tecnológico de Veracruz
Integrantes: Oscar Gómez Vásquez, Said Rosas Vera, Brayan Apolinar Ávila

¿Qué hace este programa?
------------------------
Imagina que el sistema de una empresa se pone lento. Detrás de eso puede
haber varias causas (muchos usuarios a la vez, tablas sin índices, un disco
lleno o una falla de red). No vemos la causa directamente: solo vemos
"pistas" (el sistema está lento, el procesador está al máximo, aparecen
errores al conectarse, salta una alerta de espacio...).

Este programa arma una Red Bayesiana, que es un mapa de causas y pistas
con probabilidades, y la usa para responder preguntas como:

    "Si veo estas pistas, ¿qué tan probable es cada causa?"

Cada vez que agregamos una pista nueva, las probabilidades se actualizan.

Cómo ejecutarlo
---------------
    pip install pgmpy matplotlib networkx
    python red_bayesiana_bd.py

Al terminar se crea la carpeta "resultados/" con:
    - diagrama_red.png              -> el dibujo de la red
    - evolucion_probabilidades.png  -> gráfica de cómo cambian las causas
    - consultas.txt                 -> las respuestas de todas las consultas

Nota: si pgmpy no está instalado, el programa no se detiene: hace los
mismos cálculos "a mano" (revisando todas las combinaciones posibles),
que dan exactamente los mismos resultados.

Las probabilidades usadas son hipotéticas y se emplean únicamente con
fines académicos.
"""

import itertools
import os
import textwrap

import matplotlib

matplotlib.use("Agg")  # para guardar las gráficas sin abrir ventanas
import matplotlib.pyplot as plt
import networkx as nx

try:
    from pgmpy.factors.discrete import TabularCPD
    from pgmpy.inference import VariableElimination
    from pgmpy.models import DiscreteBayesianNetwork

    HAY_PGMPY = True
except ImportError:
    HAY_PGMPY = False


# ---------------------------------------------------------------------------
# 1. LAS VARIABLES
# ---------------------------------------------------------------------------
# Cada variable solo puede valer "Si" o "No".
# Al lado de cada nombre técnico va un nombre fácil de entender, que es el
# que aparece en las gráficas y en los resultados.

SI, NO = "Si", "No"
ESTADOS = [SI, NO]

NOMBRE_FACIL = {
    # Causas (lo que queremos descubrir; no se ven a simple vista)
    "CargaAlta": "Muchos usuarios a la vez",
    "IndicesFaltantes": "Tablas sin índices",
    "DiscoSaturado": "Disco lleno o lento",
    "FallaRed": "Falla de red",
    # Causa intermedia (la provoca otra causa)
    "Bloqueos": "Operaciones en espera",
    # Pistas (lo que sí podemos ver en el monitor o nos reportan)
    "CPUAlta": "Procesador al máximo",
    "ConsultasLentas": "Sistema lento",
    "ErroresConexion": "Errores al conectarse",
    "AlertaEspacio": "Alerta de poco espacio",
}

CAUSAS = ["CargaAlta", "IndicesFaltantes", "DiscoSaturado", "FallaRed"]
INTERMEDIAS = ["Bloqueos"]
PISTAS = ["CPUAlta", "ConsultasLentas", "ErroresConexion", "AlertaEspacio"]


# ---------------------------------------------------------------------------
# 2. LAS FLECHAS (qué provoca qué)
# ---------------------------------------------------------------------------
# Cada flecha va de la causa hacia lo que provoca.

FLECHAS = [
    ("CargaAlta", "Bloqueos"),               # muchos usuarios chocan entre sí
    ("CargaAlta", "CPUAlta"),                # más trabajo para el procesador
    ("CargaAlta", "ErroresConexion"),        # se llena el cupo de conexiones
    ("IndicesFaltantes", "CPUAlta"),         # revisar fila por fila cansa al procesador
    ("IndicesFaltantes", "ConsultasLentas"), # buscar sin índice tarda más
    ("Bloqueos", "ConsultasLentas"),         # una operación en espera tarda más
    ("DiscoSaturado", "ConsultasLentas"),    # leer y guardar datos tarda más
    ("DiscoSaturado", "AlertaEspacio"),      # el monitor avisa que falta espacio
    ("FallaRed", "ErroresConexion"),         # los usuarios no logran conectarse
]


# ---------------------------------------------------------------------------
# 3. LAS PROBABILIDADES
# ---------------------------------------------------------------------------

# 3.1 ¿Qué tan común es cada causa, antes de ver cualquier pista?
PROB_INICIAL = {
    "CargaAlta": 0.25,         # ~6 horas pico de 24 al día
    "IndicesFaltantes": 0.20,  # pasa en 1 de cada 5 situaciones
    "DiscoSaturado": 0.10,     # el espacio suele vigilarse, es menos común
    "FallaRed": 0.05,          # la red suele tener respaldo, es lo más raro
}


def probabilidad_sistema_lento(indices, bloqueos, disco):
    """
    Probabilidad de que el sistema se ponga lento según qué causas estén
    presentes.

    Idea (modelo "Noisy-OR"): cada causa, por su cuenta, tiene cierta
    probabilidad de volver lento el sistema. El sistema queda rápido solo
    si NINGUNA de las causas presentes logra volverlo lento.
        - Tablas sin índices:     70 %
        - Operaciones en espera:  60 %
        - Disco lleno o lento:    50 %
        - Otras cosas no incluidas en el modelo: 3 %
    El resultado se redondea a dos decimales, igual que en la tabla del
    reporte.
    """
    prob_queda_rapido = 0.97  # 1 - 0.03 de "otras causas"
    if indices:
        prob_queda_rapido *= 1 - 0.70
    if bloqueos:
        prob_queda_rapido *= 1 - 0.60
    if disco:
        prob_queda_rapido *= 1 - 0.50
    return round(1 - prob_queda_rapido, 2)


# 3.2 Tablas "si pasa esto, ¿qué tan probable es aquello?"
# Cada tabla dice la probabilidad de que la variable sea "Si" para cada
# combinación de sus causas. La probabilidad de "No" es 1 menos ese valor.
#   Formato: variable -> (lista de causas, {combinación: P(variable = Si)})
TABLAS = {
    "Bloqueos": (
        ["CargaAlta"],
        {(SI,): 0.40, (NO,): 0.05},
    ),
    "CPUAlta": (
        ["CargaAlta", "IndicesFaltantes"],
        {(SI, SI): 0.95, (SI, NO): 0.70, (NO, SI): 0.60, (NO, NO): 0.05},
    ),
    "ConsultasLentas": (
        ["IndicesFaltantes", "Bloqueos", "DiscoSaturado"],
        {
            combo: probabilidad_sistema_lento(*(v == SI for v in combo))
            for combo in itertools.product(ESTADOS, repeat=3)
        },
    ),
    "ErroresConexion": (
        ["FallaRed", "CargaAlta"],
        {(SI, SI): 0.95, (SI, NO): 0.90, (NO, SI): 0.30, (NO, NO): 0.02},
    ),
    "AlertaEspacio": (
        ["DiscoSaturado"],
        {(SI,): 0.90, (NO,): 0.03},
    ),
}

# Orden en que se recorren las variables (primero las causas, luego lo que
# provocan). Sirve para el cálculo a mano.
ORDEN = CAUSAS + INTERMEDIAS + PISTAS


# ---------------------------------------------------------------------------
# 4. ARMAR LA RED CON pgmpy
# ---------------------------------------------------------------------------

def construir_red_pgmpy():
    """Crea la Red Bayesiana con la biblioteca pgmpy y revisa que esté bien."""
    red = DiscreteBayesianNetwork(FLECHAS)

    tablas_pgmpy = []
    for causa, p in PROB_INICIAL.items():
        tablas_pgmpy.append(
            TabularCPD(causa, 2, [[p], [1 - p]], state_names={causa: ESTADOS})
        )

    for variable, (padres, tabla) in TABLAS.items():
        # pgmpy pide las columnas en orden: Si,Si,... -> No,No,...
        combinaciones = list(itertools.product(ESTADOS, repeat=len(padres)))
        fila_si = [tabla[c] for c in combinaciones]
        fila_no = [round(1 - p, 4) for p in fila_si]
        nombres_estados = {v: ESTADOS for v in [variable] + padres}
        tablas_pgmpy.append(
            TabularCPD(
                variable, 2, [fila_si, fila_no],
                evidence=padres, evidence_card=[2] * len(padres),
                state_names=nombres_estados,
            )
        )

    red.add_cpds(*tablas_pgmpy)
    assert red.check_model(), "La red tiene un error en sus tablas"
    return red


# ---------------------------------------------------------------------------
# 5. CÁLCULO "A MANO" (revisando todas las combinaciones)
# ---------------------------------------------------------------------------
# Con 9 variables de dos estados hay 2^9 = 512 combinaciones posibles.
# Para cada una calculamos qué tan probable es (multiplicando la probabilidad
# de cada variable dadas sus causas), nos quedamos solo con las que coinciden
# con lo que observamos, y vemos qué porcentaje de ellas tiene la causa en "Si".
# Es lo mismo que hace el Teorema de Bayes, pero contado uno por uno.

def probabilidad_de_un_escenario(escenario):
    """Probabilidad de que ocurra una combinación completa de las 9 variables."""
    prob = 1.0
    for causa, p in PROB_INICIAL.items():
        prob *= p if escenario[causa] == SI else 1 - p
    for variable, (padres, tabla) in TABLAS.items():
        p_si = tabla[tuple(escenario[x] for x in padres)]
        prob *= p_si if escenario[variable] == SI else 1 - p_si
    return prob


def calcular_a_mano(causa, evidencia):
    """P(causa = Si | evidencia) contando las 512 combinaciones."""
    total = 0.0
    con_causa = 0.0
    for valores in itertools.product(ESTADOS, repeat=len(ORDEN)):
        escenario = dict(zip(ORDEN, valores))
        if any(escenario[v] != e for v, e in evidencia.items()):
            continue  # no coincide con lo que observamos
        p = probabilidad_de_un_escenario(escenario)
        total += p
        if escenario[causa] == SI:
            con_causa += p
    return con_causa / total


# ---------------------------------------------------------------------------
# 6. HACER PREGUNTAS A LA RED
# ---------------------------------------------------------------------------

if HAY_PGMPY:
    RED = construir_red_pgmpy()
    MOTOR = VariableElimination(RED)
else:
    RED = MOTOR = None


def preguntar(evidencia):
    """
    Devuelve, para cada causa, la probabilidad de que esté presente
    sabiendo lo que se observó (la "evidencia").
    """
    resultado = {}
    for causa in CAUSAS:
        if MOTOR is not None:
            respuesta = MOTOR.query([causa], evidence=evidencia or None,
                                    show_progress=False)
            posicion_si = respuesta.state_names[causa].index(SI)
            resultado[causa] = float(respuesta.values[posicion_si])
        else:
            resultado[causa] = calcular_a_mano(causa, evidencia)
    return resultado


# Las siete preguntas del reporte.
# Las cuatro primeras van sumando pistas poco a poco (C1 -> C4);
# las tres últimas prueban situaciones distintas.
CONSULTAS = [
    ("C1", "Sin ninguna pista (qué tan común es cada causa)", {}),
    ("C2", "El sistema está lento",
     {"ConsultasLentas": SI}),
    ("C3", "Sistema lento + procesador al máximo",
     {"ConsultasLentas": SI, "CPUAlta": SI}),
    ("C4", "Sistema lento + procesador al máximo + sin errores al "
           "conectarse + sin alerta de espacio",
     {"ConsultasLentas": SI, "CPUAlta": SI,
      "ErroresConexion": NO, "AlertaEspacio": NO}),
    ("C5", "Sistema lento + alerta de poco espacio",
     {"ConsultasLentas": SI, "AlertaEspacio": SI}),
    ("C6", "Hay errores al conectarse",
     {"ErroresConexion": SI}),
    ("C7", "Errores al conectarse + procesador normal",
     {"ErroresConexion": SI, "CPUAlta": NO}),
]


# ---------------------------------------------------------------------------
# 7. GRÁFICAS
# ---------------------------------------------------------------------------

COLOR = {"causa": "#E07A5F", "intermedia": "#F2CC8F", "pista": "#81B29A"}


def dibujar_red(ruta):
    """Dibuja la red: causas arriba, causa intermedia en medio, pistas abajo."""
    grafo = nx.DiGraph(FLECHAS)
    posiciones = {
        "FallaRed": (0, 2), "CargaAlta": (2.6, 2),
        "IndicesFaltantes": (5.2, 2), "DiscoSaturado": (7.8, 2),
        "Bloqueos": (5.2, 1),
        "ErroresConexion": (1.3, 0), "CPUAlta": (3.9, 0),
        "ConsultasLentas": (6.5, 0), "AlertaEspacio": (9.1, 0),
    }
    colores = [
        COLOR["causa"] if n in CAUSAS
        else COLOR["intermedia"] if n in INTERMEDIAS
        else COLOR["pista"]
        for n in grafo.nodes
    ]
    # partimos los nombres largos en renglones para que quepan en el círculo
    etiquetas = {n: textwrap.fill(NOMBRE_FACIL[n], 10, break_long_words=False) for n in grafo.nodes}

    fig, ax = plt.subplots(figsize=(14, 7))
    nx.draw_networkx_edges(grafo, posiciones, ax=ax, arrows=True,
                           arrowstyle="-|>", arrowsize=22, width=1.6,
                           edge_color="#444444", node_size=5200)
    nx.draw_networkx_nodes(grafo, posiciones, ax=ax, node_color=colores,
                           node_size=5200, edgecolors="#333333",
                           linewidths=1.2)
    nx.draw_networkx_labels(grafo, posiciones, labels=etiquetas, ax=ax,
                            font_size=9, font_weight="bold")
    for clave, texto in [("causa", "Causa (lo que queremos descubrir)"),
                         ("intermedia", "Causa intermedia"),
                         ("pista", "Pista que sí podemos ver")]:
        ax.scatter([], [], s=180, color=COLOR[clave], edgecolors="#333333",
                   label=texto)
    ax.legend(loc="lower center", bbox_to_anchor=(0.5, -0.13), ncol=3,
              frameon=False, fontsize=10.5)
    ax.set_title("Red Bayesiana: ¿por qué está fallando el servidor de "
                 "base de datos?", fontsize=14)
    ax.set_xlim(-0.8, 9.9)
    ax.set_ylim(-0.55, 2.55)
    ax.axis("off")
    fig.tight_layout()
    fig.savefig(ruta, dpi=160, bbox_inches="tight")
    plt.close(fig)


def graficar_evolucion(resultados, ruta):
    """Gráfica de cómo cambia cada causa al ir sumando pistas (C1 a C4)."""
    pasos = ["C1", "C2", "C3", "C4"]
    etiquetas_x = ["Sin pistas", "+ Sistema lento", "+ Procesador\nal máximo",
                   "+ Sin errores al conectarse\n+ Sin alerta de espacio"]
    colores = {"CargaAlta": "#1f77b4", "IndicesFaltantes": "#ff7f0e",
               "DiscoSaturado": "#2ca02c", "FallaRed": "#d62728"}
    # para que los números no se encimen
    desfase = {"CargaAlta": (0, 9), "IndicesFaltantes": (0, 9),
               "DiscoSaturado": (0, 9), "FallaRed": (0, -15)}

    fig, ax = plt.subplots(figsize=(11, 6))
    x = range(len(pasos))
    for causa in CAUSAS:
        y = [resultados[p][causa] * 100 for p in pasos]
        ax.plot(x, y, marker="o", linewidth=2.8, color=colores[causa],
                label=NOMBRE_FACIL[causa])
        for xi, yi in zip(x, y):
            dx, dy = desfase[causa]
            if causa == "IndicesFaltantes" and xi == 0:
                dy = -15  # en C1 queda pegado a "muchos usuarios"
            ax.annotate(f"{yi:.1f} %", (xi, yi), textcoords="offset points",
                        xytext=(dx, dy), ha="center", fontsize=9,
                        color=colores[causa])
    ax.set_xticks(list(x))
    ax.set_xticklabels(etiquetas_x, fontsize=10)
    ax.set_xlim(-0.3, len(pasos) - 0.7)
    ax.set_ylim(-5, 100)
    ax.set_ylabel("Probabilidad de que sea la causa (%)")
    ax.set_title("Cómo cambia la sospecha sobre cada causa al sumar pistas")
    ax.grid(alpha=0.3)
    ax.legend(loc="upper left", frameon=True)
    fig.tight_layout()
    fig.savefig(ruta, dpi=160)
    plt.close(fig)


# ---------------------------------------------------------------------------
# 8. PROGRAMA PRINCIPAL
# ---------------------------------------------------------------------------

def main():
    carpeta = "resultados"
    os.makedirs(carpeta, exist_ok=True)
    lineas = []

    def escribir(texto=""):
        print(texto)
        lineas.append(texto)

    motor = ("pgmpy (eliminación de variables)" if HAY_PGMPY
             else "cálculo a mano (pgmpy no está instalado)")
    escribir("RED BAYESIANA - DIAGNÓSTICO DE UN SERVIDOR DE BASE DE DATOS")
    escribir(f"Método de cálculo: {motor}")
    escribir("=" * 66)

    # --- Las siete consultas ---
    resultados = {}
    for clave, pregunta, evidencia in CONSULTAS:
        r = preguntar(evidencia)
        resultados[clave] = r
        escribir()
        escribir(f"{clave}: {pregunta}")
        pistas = ", ".join(f"{NOMBRE_FACIL[v]} = {e}"
                           for v, e in evidencia.items()) or "ninguna"
        escribir(f"   Pistas: {pistas}")
        for causa in CAUSAS:
            escribir(f"   {NOMBRE_FACIL[causa]:<26} {r[causa] * 100:6.2f} %"
                     f"   (P({causa} = Si) = {r[causa]:.4f})")
        ganadora = max(r, key=r.get)
        escribir(f"   -> Causa más probable: {NOMBRE_FACIL[ganadora]}")

    # --- Comprobación: el cálculo a mano debe dar lo mismo ---
    escribir()
    escribir("=" * 66)
    escribir("COMPROBACIÓN DE LA CONSULTA C2 (cálculo a mano, 512 combinaciones)")
    a_mano = calcular_a_mano("IndicesFaltantes", {"ConsultasLentas": SI})
    con_red = resultados["C2"]["IndicesFaltantes"]
    escribir(f"   A mano:   P(Tablas sin índices | Sistema lento) = {a_mano:.4f}")
    escribir(f"   Con red:  P(Tablas sin índices | Sistema lento) = {con_red:.4f}")
    if not HAY_PGMPY:
        escribir("   (sin pgmpy ambos valores salen del mismo cálculo a mano;")
        escribir("    instala pgmpy para comparar los dos métodos)")
    escribir("   -> Coinciden" if abs(a_mano - con_red) < 1e-6
             else "   -> ¡NO coinciden! Revisar el modelo")

    # --- ¿Qué pista influye más? (una pista a la vez) ---
    escribir()
    escribir("=" * 66)
    escribir("INFLUENCIA DE CADA PISTA (viendo solo esa pista en 'Si')")
    escribir("Entre paréntesis: cuántos puntos subió respecto a no ver nada")
    inicial = resultados["C1"]
    for pista in PISTAS:
        r = preguntar({pista: SI})
        partes = [f"{NOMBRE_FACIL[c]}: {r[c] * 100:.1f} % "
                  f"({round((r[c] - inicial[c]) * 100, 1) + 0.0:+.1f})"
                  for c in CAUSAS]
        escribir(f"   {NOMBRE_FACIL[pista]}:")
        for parte in partes:
            escribir(f"      {parte}")

    # --- Guardar todo ---
    with open(os.path.join(carpeta, "consultas.txt"), "w",
              encoding="utf-8") as archivo:
        archivo.write("\n".join(lineas) + "\n")
    dibujar_red(os.path.join(carpeta, "diagrama_red.png"))
    graficar_evolucion(resultados,
                       os.path.join(carpeta, "evolucion_probabilidades.png"))
    print()
    print(f"Listo. Archivos guardados en la carpeta '{carpeta}/'.")


if __name__ == "__main__":
    main()
