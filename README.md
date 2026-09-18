# ai-multiworker

Delega el trabajo pesado en tokens y liviano en razonamiento desde Claude Code
hacia workers más baratos de Antigravity (`agy`), para que el contexto caro
quede libre para razonar.

La mayor parte de lo que hace un agente de código no es pensar: es I/O. Leer un
archivo de 900 líneas para responder una sola pregunta gasta miles de tokens de
contexto caro en material que nunca vas a volver a mirar. Un worker barato lo
lee por vos y devuelve solo la respuesta.

Medido sobre este propio repo: **96-97% de ahorro** en lectura de archivos y en
triage de logs de test.

## Requisitos

- Node.js >= 18
- [`agy`](https://antigravity.google) (Antigravity CLI) instalado y autenticado

Funciona igual en Windows y en Linux: todo es Node, sin scripts de shell por
plataforma.

## Instalación

Como plugin de Claude Code:

```bash
claude plugin marketplace add RodrigoAlexander7/ai-multiworker
claude plugin install ai-multiworker@ai-multiworker
```

O directo desde el repo clonado:

```bash
npm install
node src/interfaces/cli/main.js --help
```

## Uso

```bash
# Preguntar sobre archivos grandes sin cargarlos al contexto
multiworker read -i "¿Dónde se valida el token de sesión?" -f src/auth/session.js

# Filtrar resultados ruidosos de búsqueda
rg -n "createUser" | multiworker search-digest -i "dónde está la definición real, ignorá tests" --stdin

# Extraer las fallas reales de una corrida de tests
npm test 2>&1 | multiworker log-analysis -i "qué tests fallaron y por qué" --stdin

# Generar documentación
multiworker docs -i "README de este módulo" -f src/payments/index.js

# Generar boilerplate directo a disco: el código nunca pasa por el contexto
multiworker boilerplate -i "<spec precisa>" -o src/generated/types.ts

# Ver el ahorro acumulado
multiworker stats
```

## Cómo funciona

Tres capas, siguiendo el patrón que Spotify describió en Portal:

1. **Hook `PreToolUse`** — mide el archivo que Claude está por leer. Por debajo
   de 300 líneas no dice nada; entre 300 y 800 sugiere delegar; por encima de
   800 bloquea la lectura directa y propone el comando exacto.
2. **CLI `multiworker`** — arma el prompt, elige el modelo según la tarea, llama
   a `agy` y devuelve solo la respuesta.
3. **Skill `delegating-work`** — le enseña a Claude qué conviene delegar y, más
   importante, qué no.

El contenido de los archivos nunca entra al contexto de Claude: lo lee el script
de Node y se lo pasa al worker por stdin en NDJSON.

## Ruteo de modelos

| Tarea | Modelo | Por qué |
|---|---|---|
| `read` | `gemini-3.8-flash-medium` | Claude confía en la respuesta sin releer: prima la exactitud |
| `search-digest` | `gemini-3.8-flash-low` | Filtrado mecánico, sin síntesis |
| `log-analysis` | `gemini-3.8-flash-medium` | Encontrar señal entre ruido |
| `docs` | `gemini-3.8-flash-high` | Prosa que va a leer una persona |
| `boilerplate` | `gemini-3.8-flash-high` | Código que aterriza en disco |

Cada tarea tiene una cadena de fallback (3.8 → 3.7 → 3.6). No es decorativo: el
proveedor devuelve 503 en versiones puntuales de modelo mientras otras siguen
arriba, y sin la cadena una sola caída empujaría el trabajo de vuelta al
orquestador caro.

## Qué NO delegar

**Cualquier cosa donde escribir la instrucción cueste casi lo mismo que hacer el
trabajo.** Esa es la trampa: si el worker necesita una spec tan precisa que no
pueda equivocarse, ya gastaste los tokens que querías ahorrar y encima sumaste
riesgo de mala interpretación.

También quedan del lado de Claude:

- Lógica de negocio y decisiones de arquitectura.
- Refactors que cruzan varios archivos.
- Archivos chicos: por debajo de ~300 líneas la lectura directa es más barata
  que el overhead fijo del worker.
- Texto que necesitás literal para editarlo (usá `Read` con `offset`/`limit`).

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

Variable de entorno: `AGY_BIN` para apuntar a un binario de `agy` no estándar.

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

La ganancia concreta: toda la lógica de delegación —fallback entre modelos,
umbrales, contabilidad— se testea con un worker falso, sin invocar `agy` ni
gastar cuota.

```bash
npm run check   # typecheck + tests
```

## Seguridad

- El worker se lanza sin shell, así el contenido delegado nunca llega a una
  línea de comandos.
- Se pasa `--disable-slash-commands`: material no confiable cuya línea empiece
  con `/` sería expandido como slash command por el worker.
- El content source rechaza rutas fuera de la raíz del proyecto.

## Licencia

MIT
