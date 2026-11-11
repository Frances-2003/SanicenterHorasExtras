# Activación futura: Netlify y Firebase sanicenterdb

**Guía de cierre vigente:** [PUBLICACION_FINAL.md](PUBLICACION_FINAL.md). El build ahora empaqueta las dos funciones publicables y usa runtime productivo sin emuladores. `npm.cmd run build` es el build Netlify; las rutas y comandos anteriores se conservan abajo como antecedente.

Actualizado: 10/11/2026. **Preparación local completada; producción deshabilitada.** Este documento sustituye las instrucciones anteriores de alojamiento y dependencias. No se desplegó, modificó producción, creó credenciales reales ni habilitó facturación.

**Acceso local actualizado:** `npm.cmd run dev` habilita únicamente el login real de sanicenterdb en http://localhost:8081, con todas las operaciones financieras reales bloqueadas. `npm.cmd run local` inicia el demo aislado en http://127.0.0.1:8080. Véase [ACCESO_NORMAL_Y_DEMO.md](ACCESO_NORMAL_Y_DEMO.md). Esta autorización de login local no habilita los builds de producción. La futura apertura financiera también requiere VITE_REAL_FINANCIAL_WRITES_ENABLED=true en el build autorizado, además de los controles del backend descritos aquí; actualmente permanece false.

## Implementación

- `netlify/functions/workflow.ts`: endpoint nativo Request/Response, reutilizando `server/http.ts`, `workflow-store.ts`, permisos y transacciones existentes. No mantiene un servidor permanente en Netlify. El servidor Node local usa el mismo manejador.
- Conserva login, revocación de tokens, perfiles activos, áreas autorizadas, consecutivos, bloqueo por trabajador, reserva de saldo, anulaciones, auditoría e idempotencia. La confirmación de descanso continúa siendo manual.
- `netlify.toml` y `build:netlify`: Node 24, frontend en `dist`, función de workflow y SSR de TanStack Start/Nitro. El build excluye `/api/*` del catch-all de SSR y comprueba el paquete del workflow. No agregar una redirección universal SPA a index.html.
- Frontend y backend comparten origen (`/api/workflow`), sin credenciales administrativas en el navegador. Solo las variables públicas `VITE_*` se incorporan al cliente.
- Producción requiere activación explícita. Las escrituras admiten `disabled`, `pilot` y `enabled`. El piloto limita tanto al actor como al trabajador y sigue exigiendo rol/área válidos en cada transacción.
- Se bloquean previews con `context.deploy.context` de Netlify; no se depende solo de `CONTEXT`, que no está garantizada en runtime. El build de previews desactiva Firebase real en el frontend.
- Origen HTTPS exacto, cuerpo máximo 32 KiB, respuestas sin caché, límite Netlify de 120 solicitudes/IP/dominio/minuto y límite transaccional de 30 operaciones exitosas/UID/minuto. Los reintentos ya confirmados no consumen este último límite. Ajustar el límite IP para oficinas con muchos usuarios detrás de la misma conexión.
- Las actualizaciones conservan campos históricos desconocidos. Al anular se archiva la proyección de calendario con `active:false`; el documento se conserva y deja de ser legible en el calendario compartido. Las consultas exigen `active:true`.
- Una proyección de calendario preexistente con otro propietario o campos inesperados bloquea la operación para revisión; no se sobrescribe ni se vuelve pública automáticamente.

## Viabilidad y costos

**Netlify Functions es viable sin exigir Blaze en Firebase.** El backend externo utiliza Admin SDK, Firestore y Authentication. No usa Cloud Functions de Firebase, Cloud Run, tareas programadas, TTL, PITR ni exportaciones administradas. Confirmar el plan vigente antes de activar, sin cambiarlo automáticamente.

Firestore gratuito incluye 1 GiB almacenado, 50 000 lecturas y 20 000 escrituras diarias, además de límites de transferencia y borrados. Listeners, reglas, dashboard, respaldos y reintentos consumen cuotas. Cada operación lee el historial del trabajador y escribe registro, auditoría, bloqueo y límite; según el flujo también contador/calendario. No puede garantizarse capacidad según el número de empleados sin medir historiales y tráfico. Agotar Spark puede interrumpir el servicio.

Netlify Free basado en créditos incluye actualmente 300 créditos/mes compartidos por despliegues, cómputo, solicitudes y transferencia. Las cuentas antiguas pueden tener otro esquema. Las funciones síncronas tienen límite de 60 s y memoria predeterminada de 1 GiB. No se configuraron ampliaciones pagadas. Revisar uso y condiciones de la cuenta antes del primer despliegue.

La base auditada está en Santiago y la región predeterminada de Netlify Free es Ohio. Deben medirse latencia y arranque frío en un piloto autorizado. Las transacciones tienen tres intentos máximos. Un timeout de plataforma no cancela retroactivamente un commit: ante respuesta incierta, reenviar **el mismo X-Request-Id y contenido** y verificar auditoría. No crear otra solicitud para simular un reintento.

Si el historial o latencia superan esos límites, detener la apertura de escrituras. Alternativas: backend Node confiable en región apropiada, o una futura implementación de saldos materiales e índices de intervalos reconciliados y transaccionales. Requieren evaluación independiente; no reducir validaciones para evadir cuotas.

Fuentes: [funciones y facturación](https://docs.netlify.com/build/functions/usage-and-billing/), [configuración y regiones](https://docs.netlify.com/build/functions/configuration/), [créditos](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/), [rate limiting por código](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/), [cuotas Firestore](https://firebase.google.com/docs/firestore/quotas), [planes Firebase](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

## Variables futuras, sin secretos en archivos

Referencias: `.env.example` y `netlify.env.example`. No se activó `.env.local`.

| Variable | Configuración futura |
| --- | --- |
| NODE_VERSION | Build: 24, ya indicado en netlify.toml y .nvmrc |
| VITE_REAL_FIREBASE_ENABLED | Build público: false inicialmente, true solo con autorización de conexión real |
| VITE_FIREBASE_PROJECT_ID | Build público: sanicenterdb |
| VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_APP_ID | Build: configuración pública de la aplicación web existente en Firebase Console |
| VITE_WORKFLOW_API_URL | Vacío: API del mismo origen |
| WORKFLOW_PRODUCTION_ENABLED | Servidor: false inicialmente; true solo al autorizar |
| WORKFLOW_WRITE_MODE | Servidor: disabled → pilot → enabled |
| GOOGLE_CLOUD_PROJECT | Servidor: sanicenterdb |
| APP_ORIGIN | Servidor: origen HTTPS exacto del sitio, sin barra final ni comodines |
| WORKFLOW_ALLOWED_ACTOR_UIDS | Servidor: UID autorizados del trabajador y gestores del piloto, separados por coma |
| WORKFLOW_ALLOWED_WORKER_UIDS | Servidor: solo UID de trabajadores del piloto |
| FIREBASE_SERVICE_ACCOUNT_JSON | Secreto exclusivo del servidor: identidad dedicada del proyecto sanicenterdb |

Configurar valores reales solo en el contexto **Production** desde la configuración de entorno de Netlify. Nunca anteponer VITE_ al secreto. No guardarlo en netlify.toml ni archivos del repositorio. Las variables de netlify.toml no se entregan al runtime de Functions.

Si el plan permite scopes, limitar el secreto a Functions. La documentación actual reserva el control de scopes a Pro o superior: en Free el secreto puede estar disponible también al proceso de build, aunque no se publica automáticamente. El build comprueba que `dist` no contenga claves privadas ni nombres de credenciales administrativas. Restringir colaboradores, plugins y logs; no ejecutar builds de ramas no confiables con secretos. Si se exige aislamiento exclusivo de runtime, evaluar otro plan/proveedor.

No configurar WORKFLOW_EMULATOR_MODE, FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST ni GOOGLE_APPLICATION_CREDENTIALS en producción. No copiar CONTEXT como configuración propia. Los cambios de variables Functions requieren **un nuevo despliegue** para aplicarse.

Fuentes: [variables, scopes y redeploy](https://docs.netlify.com/build/functions/environment-variables/), [contexto nativo](https://docs.netlify.com/build/functions/api/).

## Identidad del backend y usuarios reales

Con autorización futura, crear una cuenta de servicio exclusiva. Proponer un rol personalizado que permita lectura/listado/creación/actualización de entidades y transacciones, sin borrado, administración de reglas, índices, bases, IAM o usuarios. Añadir únicamente lectura Auth (`firebaseauth.users.get`) para verificar revocación. Validar los permisos exactos durante la activación: los emuladores no prueban IAM. `roles/datastore.user` es una alternativa predefinida más amplia con borrado; no concederla automáticamente ni utilizar Owner/Editor/Firebase Admin.

Admin SDK omite reglas: una clave robada operaría según IAM. Definir protección, acceso restringido, rotación y revocación. No reutilizar la sesión personal de Firebase CLI ni poner el JSON en frontend. No se creó ninguna clave real. La federación sin claves requeriría soporte verificable del proveedor y otra preparación.

**JBERNALES es trabajador de Inventario. No se cambió su UID, contraseña, área ni rol. No es jefe ni administrador.** El usuario creará las cuentas independientes futuras de jefe y administrador. Con autorización posterior, cada cuenta tendrá su propio `users/{uid}` con username en mayúsculas, name, active booleano, role y area. Jefe: área principal y authorizedAreas opcional como lista de cadenas exactas. Inventario debe estar autorizada explícitamente si corresponde. Admin tiene alcance global por definición actual del rol.

Los perfiles no se escriben desde el navegador. Un trabajador no revisa solicitudes; un gestor no aprueba solicitudes propias. Las listas del piloto no amplían permisos ni áreas.

Fuentes: [IAM Firestore](https://firebase.google.com/docs/firestore/security/iam), [permisos Auth](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaseauth).

## Reglas e índices

Comparación con el ruleset publicado conservado en la auditoría del 10/11. No se reconsultó ni modificó producción durante esta preparación. Antes de publicar volver a comparar release/hash; si cambió, reconciliar primero.

| Colección | Publicadas auditadas | Propuesta local |
| --- | --- | --- |
| users | Perfil propio | Propio o personal del área autorizada; admin global; sin escrituras cliente |
| overtime | Propietario o cualquier jefe/admin activo, sin limitar área | Propietario o gestor autorizado del área; sin escrituras cliente |
| compensations | Bloqueada | Propietario o gestor del área; anuladas conservadas en historial |
| calendar | Bloqueada | Perfil activo reconocido; únicamente proyección mínima con active:true |
| audit | Bloqueada | Gestores de áreas autorizadas |
| counters, workflowLocks, workflowLimits | Bloqueadas | Bloqueadas a todos los clientes; solo backend confiable |

No hacen falta índices compuestos nuevos. Conservar índices individuales de workerId, area, code y active. No desplegar una lista vacía para borrar índices ajenos. La auditoría no encontró compuestos ni registros financieros históricos; confirmar que siga siendo cierto. Si aparecieron documentos antiguos sin area o entradas de calendario sin active, preparar comparación y actualización explícitamente autorizada; no abrir lecturas indiscriminadas.

Las reglas locales permanecen sin publicar. Las actuales bloquean compensaciones/calendario/dashboard y permiten lecturas demasiado amplias a jefes. No activar jefaturas antes de aplicar la política revisada y coordinar la versión nueva.

## Respaldo lógico y restauración

`backup:firestore` exporta **solo Firestore**, sin modificarlo. No exporta Authentication, contraseñas, reglas, índices, IAM o configuraciones. Recorre con paginación todas las colecciones/subcolecciones e incluye padres inexistentes. Conserva representación REST tipada: int64 como cadenas, timestamps con nanosegundos, bytes, referencias, mapas, arrays, geolocalización, null, booleanos y números especiales. Guarda createTime/updateTime como evidencia; la restauración genera nuevos metadatos de sistema porque Firestore no permite establecerlos.

Compara dos recorridos completos; si hay diferencias cancela la copia. **No es un snapshot atómico**: acordar antes una ventana con todos los escritores detenidos, incluidas integraciones y consola. Los flags confirman esa condición pero no detienen servicios automáticamente. Límite preventivo de 5 000 documentos y profundidad 100; no trunca silenciosamente. Dimensionar cuota y límites si aumenta la base.

El archivo .scbackup se cifra con AES-256-GCM y scrypt, sal/IV aleatorios y frase de al menos 20 caracteres. No escribe JSON sin cifrar. Elegir directorio privado fuera del repositorio, dist y almacenamiento público; comprobar permisos NTFS y guardar la frase separada. Suministrar BACKUP_PASSPHRASE con un mecanismo seguro sin escribirla en historial, logs o informes; retirarla al terminar. No solicitar ni exportar contraseñas de usuarios.

Comando preparado para uso **futuro autorizado**, con la frase ya suministrada de forma segura:

```powershell
npm.cmd run backup:firestore -- export --ack-read-only-sanicenterdb --writers-paused --out "D:\RespaldoPrivado\sanicenterdb-FECHA.scbackup"
```

El destino debe ser absoluto y no existir. La sesión CLI necesita lectura/listado de Firestore; explicar cualquier permiso faltante antes de solicitarlo. Resguardar además versión/hash de reglas, índices y configuración no secreta. La recuperación de cuentas Auth requiere otro procedimiento: esta copia no recupera contraseñas ni constituye por sí sola un respaldo completo de Firebase.

La recuperación implementada permite **solo demo-sanicenter en 127.0.0.1:8095**, exige base vacía, crea sin sobrescribir y compara rutas/tipos al terminar. Remapea referencias del proyecto origen al demo y rechaza referencias externas. No restaura sobre producción ni borra destinos. Si falla parcialmente, inspeccionar y usar un emulador nuevo vacío.

Para una recuperación manual futura, iniciar únicamente Firestore Emulator con `firebase.security.json`, Java 21 o superior y proyecto demo-sanicenter. En el proceso del restaurador fijar GCLOUD_PROJECT=demo-sanicenter y FIRESTORE_EMULATOR_HOST=127.0.0.1:8095, suministrar la frase de forma segura y ejecutar `npm.cmd run backup:firestore -- restore-emulator RUTA_PRIVADA.scbackup`. Comprobar el resultado verified:true y retirar la frase del entorno. No ejecutar la suite test:security sobre un emulador que contenga una copia privada a conservar: sus pruebas borran exclusivamente ese destino de pruebas.

`test:security` prueba cifrado/descifrado, contraseña incorrecta, manipulación, colecciones anidadas, padres inexistentes y tipos nativos. Vacía únicamente el emulador separado de seguridad para restaurar datos ficticios. Una prueba con respaldo real necesitará autorización y emulador privado sin acceso compartido. No se ejecutó el respaldo real en esta entrega.

## Contador CP preparado, sin aplicar

`npm.cmd run counter:prepare` diagnostica sin escribir. Si CP existe y es válido, lo conserva. Si falta, propone el máximo código CP histórico, cero solo si no hay registros. Rechaza códigos/contador inválidos. `--apply` hace create transaccional sin reemplazo, con una única creación incluso bajo concurrencia. Nunca reinicia ni modifica HE.

Aplicarlo en real requiere autorización humana, ventana sin escritores, credencial real explícita y PRODUCTION_MAINTENANCE_APPROVED=create-compensations-counter-only. No configurar ese flag en Netlify ni ejecutar mantenimiento en build. La auditoría previa encontró HE=0 y CP ausente; debe revisarse nuevamente, sin convertir esa observación en instrucción de reinicio. No se ejecutó este comando en producción.

## Publicación futura: orden exacto y autorizaciones

1. Revisar y fijar una versión recuperable conservando rama y cambios locales. No conectar automáticamente la rama actual a publicación continua. Compilar localmente con npm.cmd ci, pruebas, TypeScript y npm.cmd run build:netlify; ese comando no publica.
2. Autorizar nueva comprobación de solo lectura de sanicenterdb. Comparar reglas/índices/perfiles/contadores con auditoría; acordar ventana sin escritores, obtener copia cifrada y verificarla en emulador privado. No continuar sin respaldo/configuraciones válidos.
3. El usuario crea sus cuentas independientes de jefe/admin. Autorizar sus perfiles y la identidad IAM del backend; validar áreas exactas y mínimo privilegio. JBERNALES permanece trabajador Inventario.
4. Autorizar únicamente la creación de CP si sigue ausente, según diagnóstico nuevo. No tocar HE, registros o perfiles históricos. Resolver diferencias inesperadas antes de continuar.
5. Autorizar creación/configuración del sitio Netlify y dominio HTTPS, variables y secreto. Añadir dominio final a Authentication > Settings > Authorized domains conservando los anteriores. Mantener email/password y mapeo actual. Revisar restricciones de la API key pública sin tratarlas como sustituto de reglas/tokens.
6. Autorizar publicación solo de reglas revisadas, coordinada con la versión nueva y manteniendo cerrados otros escritores. No hacer deploy genérico de todos los servicios ni borrar índices ajenos. Guardar política anterior para comparación.
7. Autorizar primer despliegue Netlify de artefactos locales, sin push/merge obligatorio. Conectar frontend real para lectura y backend con WRITE_MODE=disabled. Validar login JBERNALES, cuentas independientes, áreas y dashboard sin operaciones financieras. HTTP 503 al intentar escribir es intencional en esta fase.
8. Autorizar piloto financiero con WRITE_MODE=pilot y listas mínimas de UID; aplicar variables mediante nuevo despliegue. Medir arranque frío, tiempo/cuota, IAM y rate limiting reales. Probar casos acordados y reconciliar auditoría/saldos. El piloto crea registros reales y avanza consecutivos: no son datos descartables.
9. Solo tras aceptación autorizar WRITE_MODE=enabled y nuevo despliegue. Mantener monitoreo, rotación y respaldos según cuota/ventana. Revalidar dependencias, condiciones del proveedor y costos vigentes.

Las acciones externas de los pasos 2–9 requieren su autorización correspondiente. No se ejecutó ninguna durante esta preparación.

## Reversión segura

Bloquear escrituras con una versión nueva WRITE_MODE=disabled o pausar el sitio. Cambiar variables en UI por sí solo no detiene funciones de despliegues existentes. En incidente grave, pausar y revocar la credencial/permiso con autorización; IAM puede tardar varios minutos. No prometer cancelación instantánea de peticiones ya en curso.

Revertir a versión compatible con esquema/reglas actuales manteniendo escrituras cerradas. No reabrir una política antigua de jefes sin área. Conservar registros nuevos, auditorías, calendario archivado y consecutivos avanzados. No rebobinar contadores, borrar el piloto ni restaurar toda la copia sobre la base activa. Comparar respaldo/auditoría/estado y autorizar cualquier reparación puntual por separado. El restaurador incluido bloquea producción.

## Calidad y entorno local

```powershell
npm.cmd test
npm.cmd run test:security
npm.cmd run local:demo
# Con local:demo activo, en otro proceso:
npm.cmd run test:netlify
npm.cmd run test:e2e
npx.cmd tsc --noEmit
npx.cmd tsc --noEmit -p tsconfig.server.json
npm.cmd run build:netlify
npm.cmd run build
```

Se actualizaron Vite, Zod y gRPC y reparaciones compatibles sin --force. Auditoría actual: **0 vulnerabilidades de producción; 19 avisos moderados de herramientas de desarrollo, 0 altos/críticos en el árbol completo**. Permanecen cadenas de firebase-tools y ESLint (OpenTelemetry, glob/minimatch, uuid). Las soluciones automáticas incluyen degradaciones/cambios incompatibles del CLI; no se aplicaron a ciegas. Mantener herramientas de desarrollo fuera del runtime y reevaluar antes de publicar: siguen siendo riesgos pendientes.

Resultados de esta preparación: 62 pruebas de aplicación y 25 de seguridad aprobadas, incluidos permisos, reglas publicadas auditadas reproducidas localmente, concurrencia, contador CP y respaldo/restauración. Siete escenarios de navegador aprobados. La función compilada procesó 23 solicitudes de prueba con Auth/Firestore Emulator, también bajo Node 24. TypeScript cliente/servidor, build normal y build Netlify aprobados. ESLint: cero errores, ocho advertencias existentes de Fast Refresh. Persisten avisos de tamaño de bundle y deprecaciones de herramientas/SDK. No se probaron infraestructura Netlify real, IAM real, cuotas, latencia entre regiones ni rate limiting de la plataforma: requieren el piloto autorizado.

Visual: http://127.0.0.1:8080, demo-sanicenter exclusivamente. Cuentas ANA/LUIS (Almacen), MARIA (Ventas), JEFE, JEFEVENTAS, JEFEMULTI, ADMIN e INACTIVO; contraseña ficticia común SaniDemo2026!. No pertenecen a sanicenterdb. Los usuarios QA adicionales son exclusivamente locales.
