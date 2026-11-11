# Sani Center: publicación manual y activación

Esta es la guía vigente. El código se entrega compilable para Netlify, con login real y escrituras reales **sin activar**. Las cuatro operaciones reales autorizadas ya se completaron y verificaron: correo técnico de ROCOVARRUBIAS corregido, campo `role: "admin"` agregado a FCUADROS, reglas definitivas publicadas y contador CP creado en cero mediante transacción. No se crearon cuentas. JBERNALES conserva su UID, contraseña, perfil, rol trabajador y área Inventario; JPAREDES y el contador HE permanecieron intactos.

## Compilar

Usar Node 24 y ejecutar desde la carpeta del proyecto:

```powershell
npm.cmd ci
npm.cmd run build
```

`build:netlify` es equivalente. El build ahora selecciona Netlify, no Cloudflare. Lee la configuración pública existente de sanicenterdb; si falta, falla sin publicar. El login real se habilita en el build de producción salvo desactivación explícita; las escrituras requieren un indicador separado. Los previews desactivan ambos accesos reales.

Resultados verificables:

- `dist/`: archivos públicos sin credenciales administrativas.
- `.netlify/functions-prepared/workflow.mjs`: backend compilado con runtime exclusivamente real, sin importaciones de emuladores.
- `.netlify/functions-internal/server/`: función SSR de las pantallas existentes.
- `.netlify/deploy-functions/workflow.zip` y `server.zip`: ambas funciones empaquetadas con la biblioteca oficial de Netlify, dependencias y manifiesto de rutas.
- `.netlify/production-readiness.json`: proyectos/indicadores del build, hashes de reglas e índices y SHA-256 de los paquetes. No contiene secretos.

**No basta con arrastrar dist al navegador:** se perderían las funciones. Publicar desde la raíz mediante CLI, que incorpora frontend, funciones, rutas y cabeceras. No usar `nitro deploy`, push ni conexión automática a Git para esta publicación manual.

## Variables de Netlify

Configurar únicamente para el contexto **Production**. Las variables públicas también deben estar disponibles al build local de la CLI. Referencias sin secretos: `netlify.public.env.example` y `netlify.env.example`.

| Públicas, incorporadas al navegador          | Valor                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| VITE_REAL_FIREBASE_ENABLED                   | true                                                                    |
| VITE_REAL_FINANCIAL_WRITES_ENABLED           | false inicialmente; true solo tras autorización y nuevo build           |
| VITE_FIREBASE_PROJECT_ID                     | sanicenterdb                                                            |
| VITE_FIREBASE_AUTH_DOMAIN                    | sanicenterdb.firebaseapp.com, o el dominio de Auth existente verificado |
| VITE_FIREBASE_API_KEY / VITE_FIREBASE_APP_ID | Valores públicos de la aplicación web existente en Firebase Console     |
| VITE_WORKFLOW_API_URL                        | Vacío: /api/workflow utiliza el mismo origen HTTPS                      |

| Exclusivas del servidor       | Valor                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| GOOGLE_CLOUD_PROJECT          | sanicenterdb                                                                              |
| APP_ORIGIN                    | https://TU_SITIO.netlify.app o dominio final exacto, sin barra final                      |
| WORKFLOW_PRODUCTION_ENABLED   | false inicialmente; true solo al autorizar conexión del backend                           |
| WORKFLOW_WRITE_MODE           | disabled inicialmente; pilot/enabled solo con autorización                                |
| WORKFLOW_ALLOWED_ACTOR_UIDS   | Solo en pilot: UID reales autorizados, separados por coma                                 |
| WORKFLOW_ALLOWED_WORKER_UIDS  | Solo en pilot: UID reales de trabajadores autorizados                                     |
| FIREBASE_SERVICE_ACCOUNT_JSON | JSON privado de una identidad dedicada, introducido en la configuración segura de Netlify |

Nunca poner la identidad en VITE_*, Git, dist, netlify.toml ni informes. No reutilizar la sesión personal de Firebase CLI para servir la aplicación. Limitar el secreto al scope Functions si el plan permite scopes; en Free puede estar disponible al build, por lo que deben restringirse colaboradores/plugins y evitarse logs de entorno. Cambiar variables de Functions exige **otro despliegue**. No configurar hosts de emuladores ni WORKFLOW_EMULATOR_MODE en Netlify.

La identidad debe tener permisos mínimos de lectura/listado/creación/actualización de entidades Firestore y transacciones, más `firebaseauth.users.get` para comprobar revocación. No necesita borrar documentos, gestionar usuarios, contraseñas, reglas o IAM. Un rol personalizado debe validarse con el servicio real antes de abrir escrituras; no se concede Owner/Editor automáticamente. La creación de identidad/IAM y el registro del secreto son acciones reales pendientes de autorización.

En el runtime de Functions configurar también `NODE_OPTIONS=--experimental-require-module` para que Firebase Admin pueda cargar su dependencia ESM bajo Node 24/Lambda. No modifica permisos ni habilita escrituras. La ejecución local real mediante Netlify Dev tiene un launcher separado y requiere autorización de IAM, credencial y escrituras: [ops/BACKEND_REAL.md](ops/BACKEND_REAL.md).

## Publicar manualmente — lo ejecuta el propietario

Estos comandos externos **no se ejecutaron** durante la preparación:

```powershell
npx.cmd netlify-cli@27.17.0 login
```

Si no existe un sitio, crear uno sin Git (la CLI lo vincula a esta carpeta):

```powershell
npx.cmd netlify-cli@27.17.0 sites:create --name TU_NOMBRE_UNICO
```

Si ya existe, usar en su lugar:

```powershell
npx.cmd netlify-cli@27.17.0 link --id TU_SITE_ID
```

Configurar las variables anteriores desde Netlify UI y ejecutar:

```powershell
npx.cmd netlify-cli@27.17.0 build --context production
npx.cmd netlify-cli@27.17.0 deploy --prod --context production --no-build
```

El primer comando compila y prepara funciones; el segundo **publica** ese build. No ejecutar un build diferente entre ambos. Comprobar en el resultado las dos funciones `workflow` y `server`, la ruta /api/workflow y navegación directa a /horas, /resumen y /dashboard según rol. No publicar solo dist ni omitir la función SSR.

En Firebase Console > Authentication > Settings > Authorized domains, añadir el dominio final sin quitar localhost ni dominios existentes. Mantener email/password y las cuentas actuales. El login de JBERNALES debe conducir a Mis horas extras; no debe darle permisos de jefe/admin.

## Antes de autorizar escrituras

1. **Comprobaciones completadas:** se utiliza la verificación ya realizada de las siete cuentas oficiales. JBERNALES permanece activo y trabajador de Inventario; HE=0 sin modificar. CP fue creado como entero cero tras comprobar transaccionalmente su ausencia y que no había compensaciones. No repetir la auditoría ni reinicializar contadores.
2. **Respaldo completado:** utilizar la copia cifrada verificada indicada abajo. No generar otra copia para esta activación.
3. **Usuarios configurados:** conservar las siete cuentas oficiales. JPAREDES tiene ámbito exclusivamente Inventario. Las correcciones de ROCOVARRUBIAS y FCUADROS ya se ejecutaron; no repetirlas ni duplicar cuentas. RCOVARRUBIAS no fue encontrado y no debe crearse ni incorporarse. Estado: [USUARIOS_ACTIVACION.md](USUARIOS_ACTIVACION.md).
4. **CP configurado:** el contador ya existe. No ejecutar nuevamente su creación ni modificar HE. El comando de mantenimiento permanece como herramienta protegida para otros casos expresamente autorizados.
5. **Reglas definitivas publicadas:** `firestore.rules` conserva perfil propio para login, limita jefes por área —incluido el calendario— y niega toda escritura de cliente, incluso admin. Las escrituras pasan por Admin SDK y vuelven a comprobar permisos. El backend comprueba área actual del trabajador y área original del registro; no autoriza implícitamente una solicitud de otra área tras un traslado. No se modificaron índices y no debe desplegarse un listado vacío para borrar índices existentes.
6. **Activar:** con autorización, configurar backend true, WORKFLOW_WRITE_MODE=pilot y listas de UID, y el indicador público financiero true; recompilar/publicar. Validar IAM, latencia, rechazo de autoaprobación, áreas, consecutivos y saldo mediante operaciones reales expresamente acordadas. Esas operaciones avanzan contadores y permanecen en auditoría. Tras aceptación, autorizar enabled y publicar de nuevo. No habilitar escrituras antes de copia, permisos y reglas correctas.

La publicación de reglas autorizada se limita a:

```powershell
npx.cmd firebase deploy --only firestore:rules --project sanicenterdb
```

La publicación equivalente ya se completó mediante la API de Firebase Rules y se verificó contra el contenido local. No es necesario ejecutar este comando para la entrega actual. No desplegar otros servicios ni índices.

## Respaldo y recuperación

**El respaldo de esta activación ya existe y fue verificado. No ejecutar una nueva exportación.**

Carpeta privada fuera del repositorio:
`C:\Users\JULIO B\SaniCenter-Backups\sanicenterdb_2026-11-10_22-34-05_d7468a`.

Archivo `sanicenterdb.scbackup`, SHA-256:
`b522b7ce5efef79b1d83d484a7668d484aee742fd41f6e669b6c8722a81e11bf`.

Incluye los documentos y tipos de Firestore, Authentication, reglas publicadas, índices y configuración de recuperación capturados. La clave está protegida con DPAPI del usuario Windows en `clave-recuperacion.dpapi`; conservar también `VERIFICACION.json` y `RECUPERACION.txt`. No publicar estos archivos ni copiar su contenido a Netlify. Se comprobó nuevamente el hash del archivo existente al cerrar esta preparación.

Los comandos siguientes son referencia para copias futuras del formato lógico Firestore; **no deben ejecutarse ahora ni reemplazan la copia completa anterior**. Para recuperar la copia completa existente, seguir su `RECUPERACION.txt` privado.

Usar una sesión CLI con permiso de lectura, destino cifrado fuera del repositorio y ventana sin escritores. Solicitar la frase sin mostrarla ni guardarla en el historial:

```powershell
$backupSecret = Read-Host "Frase del respaldo (mínimo 20 caracteres)" -AsSecureString
$env:BACKUP_PASSPHRASE = [System.Net.NetworkCredential]::new("", $backupSecret).Password
npm.cmd run backup:firestore -- export --ack-read-only-sanicenterdb --writers-paused --out "D:\RespaldoPrivado\sanicenterdb.scbackup"
npm.cmd run backup:firestore -- verify "D:\RespaldoPrivado\sanicenterdb.scbackup"
Remove-Item Env:BACKUP_PASSPHRASE
$backupSecret.Dispose()
```

La exportación lee dos veces y cancela si cambian documentos. Cifra AES-256-GCM/scrypt; verify comprueba descifrado/integridad y devuelve SHA-256, fecha y número de documentos, sin revelar contenido. No sustituye el respaldo de Authentication: no exporta contraseñas, usuarios Auth, IAM o configuración. Incluye documentos, subcolecciones y tipos nativos de Firestore; createTime/updateTime quedan como evidencia, pero una restauración obtiene nuevos metadatos de sistema. Límite preventivo 5 000 documentos; excederlo cancela, no trunca.

Para verificar recuperación, iniciar **un emulador privado vacío** (Java 21+) en otra terminal, sin crear cuentas ni sembrar demos:

```powershell
npx.cmd firebase emulators:start --config firebase.security.json --only firestore --project demo-sanicenter
```

En una terminal separada, suministrar la frase de forma segura, fijar GCLOUD_PROJECT=demo-sanicenter y FIRESTORE_EMULATOR_HOST=127.0.0.1:8095 y ejecutar:

```powershell
npm.cmd run backup:firestore -- restore-emulator "D:\RespaldoPrivado\sanicenterdb.scbackup"
```

Exigir verified:true, retirar la frase y cerrar esa terminal. El restaurador solo admite ese emulador vacío; no sobrescribe ni borra destinos, remapea referencias al demo y rechaza referencias externas. No proporciona restauración masiva sobre producción. No ejecutar pruebas que vacían el emulador sobre una copia privada que se quiera conservar.

## Crear CP sin reiniciar HE — solo tras autorización

En una terminal de mantenimiento sin hosts de emuladores, con FIREBASE_SERVICE_ACCOUNT_JSON cargado de forma segura desde un archivo privado externo y GOOGLE_CLOUD_PROJECT=sanicenterdb, APP_ORIGIN correcto, WORKFLOW_PRODUCTION_ENABLED=true y WORKFLOW_WRITE_MODE=disabled:

```powershell
npm.cmd run counter:prepare
# Revisar: create-if-absent, lastNumber=0, applied=false si no existen CP.
# Solo después de autorizar expresamente esa creación:
$env:PRODUCTION_MAINTENANCE_APPROVED="create-compensations-counter-only"
npm.cmd run counter:prepare -- --apply
Remove-Item Env:PRODUCTION_MAINTENANCE_APPROVED
Remove-Item Env:FIREBASE_SERVICE_ACCOUNT_JSON
```

La transacción usa create, no reemplazo: si CP apareció entre lecturas, conserva el existente. El comando de mantenimiento exige que no existan compensaciones y solo entonces propone o crea cero. Si hay cualquier compensación, se detiene sin crear el contador. Nunca modifica HE ni registros históricos. No ejecutar este mantenimiento desde build o Functions.

## Recuperación operativa y límites pendientes

Ante incidente, pausar el sitio o publicar una versión con escrituras disabled. Un cambio de variables en UI no afecta despliegues anteriores hasta volver a publicar. Conservar todos los registros, auditorías y consecutivos avanzados; no rebobinar contadores ni restaurar toda la base encima de la activa. Reconciliar diferencias y autorizar reparaciones puntuales. Mantener una versión compatible con las reglas actuales; no reabrir acceso global de jefes para volver atrás.

Spark es viable con el backend externo, sujeto a sus cuotas. Netlify tiene cuotas/costos independientes. El tamaño de historial, reintentos, lecturas del dashboard y distancia de región requieren medición real; las funciones síncronas tienen un límite de tiempo. Ante respuesta incierta, reenviar el mismo X-Request-Id/contenido y revisar auditoría. No debilitar transacciones para evitar cuotas. Esta preparación no habilita facturación.

**Pendientes para publicar:** introducir de forma privada la credencial existente en Netlify, configurar el dominio final y efectuar el despliegue/activación por el propietario. La identidad de servicio, IAM y la clave privada local ya se crearon y comprobaron con autorización; la entrada local está limitada a JBERNALES/JPAREDES, según [ops/BACKEND_REAL.md](ops/BACKEND_REAL.md). Las cuentas, sus dos correcciones, las reglas y CP ya están configurados; no repetir esas operaciones. La auditoría y el respaldo están completados. El respaldo anterior no incluye las cuentas creadas posteriormente; conservarlo, sin generar otra copia sin autorización. La conectividad del sitio de Netlify aún requiere su publicación; no se presenta como realizada.

Verificación local de cierre: pruebas de aplicación aprobadas; 13 comprobaciones de producción, reglas, respaldo/restauración y contador aprobadas sin crear cuentas ni perfiles de prueba en Firebase. TypeScript y build/ZIP con Node 24 aprobados. Auditoría del runtime: cero vulnerabilidades; las herramientas de desarrollo mantienen avisos moderados (22 en la instalación final), sin altos/críticos. ESLint conserva ocho advertencias de Fast Refresh y cero errores. No se presentan estas pruebas como una validación de datos o IAM reales.

Login local conservado: `npm.cmd run dev` → http://localhost:8081, sanicenterdb y operaciones financieras bloqueadas. No requiere desplegar ni activar el backend. La contraseña real no fue utilizada en las pruebas.

Referencias: [CLI build](https://cli.netlify.com/commands/build/), [CLI deploy](https://cli.netlify.com/commands/deploy/), [creación sin Git](https://cli.netlify.com/commands/sites/), [variables del runtime](https://docs.netlify.com/build/functions/environment-variables/).
