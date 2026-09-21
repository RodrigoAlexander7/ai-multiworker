# ai-multiworker

Delega el trabajo pesado en tokens y liviano en razonamiento desde Claude Code
hacia workers más baratos de Antigravity (`agy`), para que el contexto caro
quede libre para razonar.

La mayor parte de lo que hace un agente de código no es pensar: es I/O. Leer un
archivo de 900 líneas para responder una sola pregunta gasta miles de tokens de
contexto caro en material que nunca vas a volver a mirar. Un worker barato lo
lee por vos y devuelve solo la respuesta.

---

## Funcionalidades

Tres tareas, todas de lectura. Ninguna usa herramientas: el material se le pasa
al worker como texto, así que **no requieren ningún permiso** y el worker nunca
toca tus archivos ni ejecuta comandos.

| Tarea | Qué hace | Entrada |
|---|---|---|
| `read` | Responde una pregunta sobre archivos grandes sin que su contenido entre a tu contexto | `-f` (uno o varios) |
| `log-analysis` | Extrae las fallas raíz de salidas largas de tests, builds o CI | `--stdin` |
| `docs-audit` | Encuentra afirmaciones de la documentación que el código **contradice** | `-f` doc + código |

Más dos comandos de soporte:

| Comando | Para qué |
|---|---|
| `doctor` | Verifica el entorno e imprime la configuración que falte |
| `stats` | Muestra el ahorro acumulado, por tarea |

> **Por qué solo tres.** El proyecto llegó a tener siete. Se recortó a las que se
> ganaron el lugar midiendo uso real. Las otras se pueden recuperar del historial
> de git si hacen falta — ver `git log`.

---

## Requisitos

- Node.js >= 18
- [`agy`](https://antigravity.google) (Antigravity CLI) instalado y autenticado
- Opcional: [`markitdown`](https://github.com/microsoft/markitdown) si vas a
  delegar PDFs u ofimática — `pip install 'markitdown[all]'`

Funciona igual en Windows y en Linux: todo es Node, sin scripts de shell por
plataforma.

---

## Instalación

**Como plugin de Claude Code** (activa el hook y la skill en todas tus sesiones):

```bash
claude plugin marketplace add RodrigoAlexander7/ai-multiworker
claude plugin install ai-multiworker@ai-multiworker
```

**O desde el repo clonado:**

```bash
git clone https://github.com/RodrigoAlexander7/ai-multiworker.git
cd ai-multiworker
npm install
npm link
multiworker doctor
```

`npm link` expone el comando `multiworker` en tu PATH. Sin ese paso solo existe
como `node src/interfaces/cli/main.js` dentro de esta carpeta. Si tu terminal ya
estaba abierta cuando corriste `npm link`, abrí una nueva — el PATH se resuelve
al iniciar la sesión.

Si `agy` no resuelve en el PATH, apuntá `AGY_BIN` al binario:

```bash
export AGY_BIN=/ruta/a/agy          # Linux / macOS
$env:AGY_BIN = "C:\ruta\a\agy.exe"  # Windows PowerShell
```

`multiworker doctor` te dice exactamente qué falta. No adivines.

---

## Cómo usar

### La regla de decisión

Antes de delegar, una sola pregunta: **¿el material es grande y la respuesta
chica?**

| Situación | Acción |
|---|---|
| Archivo de 800 líneas, necesitás un dato | **Delegá** |
| Archivo de 150 líneas | Leelo directo — el overhead no se paga |
| Salida de tests de 300 líneas con 2 fallas | **Delegá** |
| Necesitás el texto literal para editarlo | `Read` con `offset`/`limit` |
| No sabés qué buscás | Usá un grafo de código, no esto |

Delegar cuesta **10-30 segundos**. Por debajo de ~300 líneas perdés tiempo y no
ganás tokens. El footer te muestra ambos números para que puedas calibrar.

### Preguntar sobre archivos grandes

```bash
multiworker read -i "¿Dónde se valida el token de sesión?" -f src/auth/session.js
```

Varios archivos a la vez, para preguntas que los cruzan:

```bash
multiworker read -i "¿Cómo fluye el pago de punta a punta?" -f src/checkout.js -f src/payments.js
```

La respuesta viene con citas `archivo:línea`. Usalas para abrir con
`Read`/`offset` solo las líneas que importan, en vez de releer todo.

### Documentos que no son texto

Los `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.epub`, `.html` y `.htm` se convierten a
Markdown automáticamente antes de delegarse. No hay paso extra:

```bash
multiworker read -i "¿qué método usan y con qué tamaño de muestra?" -f paper.pdf
```

Sin la conversión esos archivos se leerían como UTF-8 y llegarían al worker como
ruido binario — no fallaría, que es peor: respondería con seguridad sobre basura.
El HTML entra en la lista por otro motivo: su markup puede pesar varias veces más
que su prosa, y Markdown lleva lo mismo por mucho menos.

Requiere `markitdown`. Si falta, el error te dice cómo instalarlo, y
`multiworker doctor` lo reporta.

### Triar salidas largas

El caso más rentable del día a día: una corrida de tests que falla entre ruido.

```bash
npm test 2>&1 | multiworker log-analysis -i "qué tests fallaron y cuál es la causa raíz" --stdin
```

Funciona igual con builds, logs de CI o salidas de linters. Todo lo que entre por
`--stdin`:

```bash
docker compose logs --tail 500 2>&1 | multiworker log-analysis -i "por qué no arranca el contenedor" --stdin
```

### Auditar documentación

La documentación no falla por ausencia, falla por **deriva**. Esto lo detecta:

```bash
multiworker docs-audit -i "verificá los ejemplos y las firmas" -f README.md -f src/index.js
```

Reporta **solo** lo que el código contradice. Una afirmación que las fuentes no
cubren **no** es un hallazgo — la documentación habla de cosas que no están en el
código, y confundir ausencia con contradicción produce ruido que nadie relee.

Si todo está bien devuelve `NO_DISCREPANCIES`, y eso cuesta casi nada. Corrélo
después de cada cambio grande.

### Auditar todo el proyecto de una vez

Para un proyecto con varios documentos, escribir cada par a mano se vuelve
tedioso. Configurá los pares en `.multiworker.json`:

```json
{
  "docsAudits": [
    { "doc": "docs/api.md", "code": ["src/api/routes.py"], "focus": "endpoints y payloads" },
    { "doc": "docs/cli.md", "code": ["src/cli/main.py"], "focus": "comandos y flags" }
  ]
}
```

Y corré todos de una vez:

```bash
multiworker docs-audit --all
```

Cada par sigue siendo una auditoría **enfocada e independiente** — el `focus`
es obligatorio a propósito. Una sola llamada que barra todo el código pierde
justo lo que hace preciso al auditor: sin un foco concreto, no puede distinguir
bien entre "el código lo contradice" y "las fuentes simplemente no lo cubren".
`--all` automatiza juntar los pares, no la precisión de cada auditoría.

Un par que falla (archivo inexistente, timeout) no frena a los demás — se
reporta y el resto sigue. Al final:

```
[multiworker] 5 pair(s), 4 clean, 1 with findings, 0 failed
```

Sale con código 1 solo si **todos** los pares fallaron.

### Rutina sugerida

| Cuándo | Comando |
|---|---|
| Antes de tocar un módulo que no conocés | `read` sobre sus archivos principales |
| Cada vez que fallan los tests | `log-analysis` por stdin |
| Después de un cambio que toca la API pública | `docs-audit` del README contra el código |
| Cada tanto | `stats` para ver si el ahorro justifica la latencia |

### Interpretar las respuestas

Los workers tienen prohibido inventar. Cuando no pueden responder lo dicen:

- **`NOT_IN_SOURCE`** — la respuesta no está en el material que le diste. Ampliá
  el conjunto de archivos y volvé a delegar; no asumas que no miró bien.
- **`NO_DISCREPANCIES`** — el código no contradice nada de la documentación.

Tratá una respuesta como el informe de un compañero: confiable en extracción, y
conviene verificarla antes de construir algo encima.

---

## Cómo leer el reporte de ahorro

```
[multiworker] model=gemini-3.8-flash-medium worker_tokens=20660 took=4.5s avoided~3303in spent~42in saved~99%
```

| Campo | Significa |
|---|---|
| `worker_tokens` | Lo que consumió el worker (contra la cuota de `agy`, no la tuya) |
| `took=4.5s` | **El otro lado del trade-off.** Tokens ahorrados con 30s de latencia puede ser mal negocio |
| `avoided~3303in` | Tokens de **entrada** que no tuviste que leer |
| `+Nout` | Tokens de **salida** que no tuviste que escribir (aparece solo con `-o`) |
| `spent~42in` | Lo que sí llegó a tu contexto |
| `saved~99%` | Ahorro ponderado: la salida evitada cuenta 5× |

Evitar un token que ibas a *escribir* vale unas cinco veces más que evitar uno
que ibas a *leer*, porque la salida se factura a ese ratio.

`multiworker stats` agrega lo mismo acumulado, y le suma una segunda mitad que
responde una pregunta distinta: **¿se está usando cuando debería?**

Un hook `PostToolUse` observa cada `Read`/`Bash` que se completa. No bloquea
nada — corre después de que la lectura ya pasó. Si el archivo estaba en la
banda advisory (300-800 líneas) y se leyó directo en vez de delegarse, queda
registrado en `.multiworker/compliance.jsonl`, separado de las métricas de
delegación:

```
Compliance: 3 large read(s) went direct instead of being delegated.
  advised and ignored: 3
  block bypassed:      0

Worst offenders:
    540 lines  src/legacy/parser.js (Read)
```

Esto ataca el problema que el hook `PreToolUse` no puede resolver solo: en la
banda advisory, sugiere pero no obliga, así que Claude puede ignorarlo. Antes
eso no dejaba rastro. Ahora sí, y con eso podés calibrar el umbral con datos en
vez de intuición — si `advised and ignored` crece mucho, bajá `blockLines` en
`.multiworker.json` en vez de confiar en que la sugerencia se siga.

`block bypassed` (que la lectura haya pasado por encima de 800 líneas pese al
bloqueo duro) no debería ocurrir nunca. Si aparece, es una señal de que el
`PreToolUse` no está corriendo o la config cambió entre ambos hooks — revisalo.

> **Las estimaciones son `chars / 4`**, no un tokenizer real. Sirven para comparar
> delegaciones entre sí, no para auditar tu factura.

**Y un punto ciego honesto:** no medimos la tasa de acierto. Si tenés que rehacer
una de cada tres delegaciones, la cuenta se da vuelta y el reporte no se entera.

---

## Qué NO delegar

- **Lógica de negocio y decisiones de arquitectura.** Acá el trabajo *es* el
  juicio, y el juicio no se delega.
- **El "porqué".** No está en el código: está en la decisión, el incidente, la
  restricción. Un worker que solo ve el código produce una racionalización
  verosímil, que es peor que nada porque suena autorizada.
- **Archivos chicos.** Por debajo de ~300 líneas la lectura directa gana.
- **Texto que necesitás literal para editarlo.** `Read` con `offset`/`limit`.
- **Generación de tests.** Un test generado que pasa puede estar fijando un bug
  existente como comportamiento esperado.

---

## Cómo funciona

Tres capas:

1. **Hook `PreToolUse`** — mide el archivo que Claude está por leer. Por debajo
   de 300 líneas no dice nada; desde 300 sugiere delegar; desde 800 bloquea la
   lectura directa y propone el comando exacto.

   Cubre la herramienta `Read` y los volcados por shell (`cat`, `type`, `less`,
   `more`, y `head`/`tail` con un conteo explícito grande). Deja pasar lo que ya
   es barato: lecturas con `offset`/`limit`, `head`/`tail` con su límite por
   defecto, comandos con pipe —la salida se filtra antes de que alguien la lea—
   y redirecciones, que nunca llegan al contexto.
2. **CLI `multiworker`** — arma el prompt, elige el modelo según la tarea, llama
   a `agy` por NDJSON y devuelve solo la respuesta.
3. **Skill `delegating-work`** — le enseña a Claude qué conviene delegar y qué no.

El contenido de los archivos nunca entra al contexto de Claude: lo lee el script
de Node y se lo pasa al worker por stdin.

---

## Ruteo de modelos

| Tarea | Modelo | Por qué |
|---|---|---|
| `read` | `gemini-3.8-flash-medium` | Claude confía en la respuesta sin releer: prima la exactitud |
| `log-analysis` | `gemini-3.8-flash-medium` | Encontrar señal entre ruido |
| `docs-audit` | `gemini-3.8-flash-high` | Un auditor impreciso produce ruido que nadie relee |

Cada tarea tiene una cadena de fallback de tres modelos. Las de lectura bajan de
versión dentro del mismo tier (3.8 → 3.7 → 3.6); la auditoría escala a
`gemini-3.1-pro-high` como segundo intento.

No es decorativo: el proveedor devuelve 503 en versiones puntuales de modelo
mientras otras siguen arriba. Ya se disparó de verdad en pruebas.

Los errores de permiso, en cambio, **no** consumen la cadena: son configuración
faltante, y todos los modelos hermanos fallarían igual.

---

## Configuración

Opcional, en `.multiworker.json` en la raíz del proyecto:

```json
{
  "models": { "read": ["gemini-3.1-pro-high", "gemini-3.8-flash-medium"] },
  "thresholds": { "adviseLines": 300, "blockLines": 800 },
  "timeoutMs": 240000,
  "exemptPaths": ["docs/", "CHANGELOG"]
}
```

| Clave | Efecto |
|---|---|
| `models` | Reemplaza la cadena de modelos de una tarea |
| `thresholds.adviseLines` | Desde cuántas líneas el hook sugiere delegar |
| `thresholds.blockLines` | Desde cuántas líneas el hook bloquea la lectura directa |
| `timeoutMs` | Timeout por delegación |
| `exemptPaths` | Fragmentos de ruta que el hook nunca intercepta |
| `docsAudits` | Pares doc↔código para `docs-audit --all` (ver arriba) |

Variable de entorno: `AGY_BIN` para un binario de `agy` no estándar.

---

## Arquitectura

Ports & adapters, porque el worker es intercambiable: hoy `agy`, mañana otro CLI
o un modelo local, sin tocar el dominio.

```
src/
  domain/          reglas puras: catálogo de tareas, ruteo, umbrales, ahorro
  application/     caso de uso de delegación + puertos que necesita
  infrastructure/  adaptadores: agy, filesystem, métricas, config
  interfaces/      CLI y hook de Claude Code
```

Toda la lógica de delegación —fallback entre modelos, umbrales, contabilidad— se
testea con un worker falso, sin invocar `agy` ni gastar cuota.

```bash
npm run check   # typecheck + tests
```

---

## Seguridad

- El worker se lanza sin shell, así el contenido delegado nunca llega a una línea
  de comandos.
- Se pasa `--disable-slash-commands`: material no confiable cuya línea empiece con
  `/` sería expandido como slash command por el worker.
- El content source rechaza rutas fuera de la raíz del proyecto.
- Ninguna tarea le da herramientas al worker: solo procesan texto. No hay
  superficie de inyección desde contenido externo, y un worker no puede leer,
  escribir ni ejecutar nada por su cuenta.

---

## Licencia

MIT
