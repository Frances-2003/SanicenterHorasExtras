# Preparación del piloto real — sanicenterdb

Revisión: 10 de noviembre de 2026. Estado: **NO ACTIVAR TODAVÍA**. Este documento es un procedimiento revisable, no un script de despliegue o migración.

**Preparación técnica posterior completada:** la guía vigente es [NETLIFY_FIREBASE.md](NETLIFY_FIREBASE.md). Incluye la adaptación local a Functions, bloqueo de producción por defecto, respaldo/restauración tipada, diagnóstico CP y dependencias corregidas. Las referencias antiguas de este documento a sesión ausente, ADC y doce vulnerabilidades son contexto histórico y no describen el estado actual. JBERNALES permanece trabajador de Inventario.

**Actualización posterior:** se completó la autenticación de Firebase CLI y una auditoría real de solo lectura, descrita en [AUDITORIA_SANICENTERDB.md](AUDITORIA_SANICENTERDB.md). Se verificaron proyecto, reglas, índices, Authentication, perfil de JBERNALES y estructura. El estado inicial descrito a continuación corresponde a la preparación anterior: ya no representa la disponibilidad actual de la sesión ni implica que la auditoría siga pendiente. No se activó la aplicación ni se modificó producción.

## Qué se comprobó y qué falta comprobar

Comprobado localmente:

- Rama `feature/firebase-approval-workflow`, conservando los cambios locales existentes.
- El identificador Firebase configurado en `.env.local` coincide con `sanicenterdb`. No se mostraron claves ni se modificó la configuración.
- Firebase CLI tiene **cero cuentas autorizadas guardadas**. No se consultaron documentos, usuarios, permisos IAM, región, facturación ni reglas publicadas del proyecto real.
- `firestore.rules` es la propuesta probada en emuladores; no es una copia verificada de las reglas de producción.
- El arranque `local:demo` continúa fijado a `demo-sanicenter` y a ambos emuladores. No iniciar `dev`, `preview` ni `workflow:serve` como una prueba real improvisada: el modo que no es de emulador ya utiliza la configuración Firebase existente y el servicio puede utilizar ADC si se le configura un proyecto real.
- La aplicación conserva el login usuario/contraseña. Para `JBERNALES` intenta el correo técnico `jbernales@auth.sanicenter.invalid`, lee `users/{uid}`, requiere `username: "JBERNALES"`, `active: true` y rol reconocido. La existencia y correspondencia reales **no están verificadas**.
- `npm audit --omit=dev --json` continúa reportando **12 avisos: 6 altos y 6 moderados**, incluyendo cadenas transitivas. No son necesariamente doce fallos independientes. El análisis incluye Firebase/gRPC, Vite, Zod y dependencias de Google. No se aplicó `audit fix`, actualización ni cambio de versión del login.

No se publicó, desplegó, habilitó facturación, inició sesión como un usuario real ni modificó Firebase real. Solo se preparó esta documentación local.

## Orden y autorizaciones

| Etapa                | Trabajo preparable localmente                                                                 | Acceso o acción externa necesaria                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Inventario        | Preparar auditoría de solo lectura y matriz de compatibilidad                                 | Acceso de solo lectura a reglas, configuración, Auth y Firestore; el alcance de la revisión ya está solicitado, pero falta una sesión/identidad autorizada |
| 2. Respaldo          | Preparar exportador lógico y recuperación tipada; probarlos con datos ficticios               | Aprobar ubicación cifrada, ventana sin escrituras y creación del respaldo real; cualquier cambio de IAM o reglas para lograrlo requiere autorización       |
| 3. Compatibilidad    | Generar informe y diffs de migración sin ejecutarlos                                          | Aprobar expresamente cada cambio de datos, perfil, contador o política; si hay conflicto, bloquear en vez de corregir automáticamente                      |
| 4. Servicio          | Corregir y probar medidas de seguridad, empaquetado y configuraciones de ejemplo sin secretos | Elegir proveedor y autorizar IAM, secretos, contratación/facturación y despliegue                                                                          |
| 5. Reglas            | Comparar las publicadas con la propuesta y probar la combinación en emuladores                | Autorizar publicación coordinada y una ventana de mantenimiento para escritores antiguos                                                                   |
| 6. Piloto de lectura | Preparar una versión y lista de UID autorizados                                               | Autorizar el acceso real con cuentas existentes y el cambio explícito de entorno                                                                           |
| 7. Piloto financiero | Preparar casos, límites, reconciliación y botón de detención                                  | Autorizar operaciones concretas, que crearán registros reales y avanzarán contadores normalmente                                                           |

No se solicita activar nada con este documento. No se cambiarán UID, contraseñas, registros ni contadores para facilitar las pruebas.

## 1. Inventario de solo lectura

Obtener la versión actualmente publicada de reglas y sus identificadores de release/ruleset; conservar el texto completo y su hash. Comparar todas las colecciones, no solo las conocidas por esta aplicación. Obtener también índices/exenciones, ubicación y nombre de la base de datos: el servicio actual utiliza `(default)`.

Inventariar usuarios de Authentication y sus perfiles Firestore sin cambiar sus cuentas. Para JBERNALES verificar correo técnico, proveedor correo/contraseña, UID, estado de la cuenta, perfil vinculado, nombre de usuario, rol, área y áreas adicionales autorizadas. No pedir ni exportar su contraseña en texto claro. Si la cuenta existente utiliza otro identificador técnico, adaptar el mapeo tras revisión; no recrearla ni cambiar su UID.

Revisar documentos y subcolecciones, propietarios/UID referenciados, estados, tipos, duración en minutos, fechas/horas, códigos, asignaciones, duplicados, superposiciones y reservas ya comprometidas. Detectar documentos sin `area`, perfiles huérfanos y saldos incoherentes. Un indicador que excluye datos antiguos no es una reconciliación válida del saldo real.

Esta inspección consume lecturas/cuota. Definir un alcance acotado y una ventana adecuada, sin escanear repetidamente historiales completos.

## 2. Compatibilidad de reglas y datos

| Elemento                  | Contrato del flujo nuevo                                                                                                                     | Comprobación necesaria en producción                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `users/{uid}`             | UID de Authentication; `username` en mayúsculas; `name`, `role`, `area`, `active` booleano; `authorizedAreas` opcional como lista de cadenas | Conservar UID y contraseña. Informar campos ausentes o tipos incorrectos; no asignar roles/áreas por suposición                                |
| Login                     | Un usuario autenticado puede leer su propio perfil, incluso inactivo, para explicar el rechazo                                               | No bloquear el login al publicar reglas. Los inactivos no deben leer datos financieros ni calendario                                           |
| `overtime`                | `workerId`, código HE, fecha YYYY-MM-DD, horarios HH:mm, minutos enteros, motivo y estado                                                    | Validar estados `pendiente/aprobada/rechazada/anulada`; `activo` y `anulado` son legados. No convertir `activo` en aprobación automáticamente  |
| `compensations`           | Código CP, propietario, horario, minutos, asignaciones a registros aprobados y estado                                                        | Verificar orígenes, sumas, consumo y estados. Pendiente/aprobada/anulación pendiente/efectuada comprometen saldo; anulada/rechazada lo liberan |
| Área en registros         | Los jefes consultan por `area`; el Dashboard también limita trabajadores por el perfil autorizado                                            | Completar campos faltantes solo con una fuente fiable y autorización. No trasladar registros de área por inferencia silenciosa                 |
| Jefaturas                 | `area` más `authorizedAreas` adicionales; admin accede a todas                                                                               | Confirmar la jerarquía de la empresa y evitar conceder acceso global a un jefe                                                                 |
| `counters/overtime`       | `lastNumber` entero seguro, no negativo, compatible con códigos existentes                                                                   | Conservar el valor. Compararlo con todos los códigos HE, no solo con el siguiente: una colisión ausente no demuestra que esté actualizado      |
| `counters/compensations`  | Mismo criterio para códigos CP                                                                                                               | Si no existe, proponer creación con el máximo real; cero únicamente si no hay ningún código previo. No reemplazar un contador existente        |
| `calendar`                | Proyección compartida sin motivos, asignaciones ni saldos                                                                                    | Inventariar antes de crear entradas. Una proyección con el mismo ID no se sobrescribe sin comparar; conservar datos originales                 |
| `audit` y `workflowLocks` | Auditoría transaccional y serialización de operaciones por trabajador                                                                        | Verificar colisiones con colecciones/documentos existentes y compatibilidad con otros servicios                                                |
| Índices                   | Consultas simples por `workerId`, `area` o `code`; sin índices compuestos nuevos en el código actual                                         | Comprobar exenciones reales de índices individuales. No borrar índices ajenos al flujo                                                         |
| Duración y zona horaria   | Fin menor o igual al inicio cruza medianoche; igualdad representa 24 h; decisiones temporales en Perú UTC-5                                  | Detectar registros antiguos que interpretaban igualdad como cero o fechas con otro tipo/zona. No recalcular y sobreescribir horas históricas   |

La propuesta local permite leer registros propios o de áreas autorizadas, comparte solo el calendario público y niega escrituras directas del navegador, incluso a perfiles admin. La auditoría se limita a gestores autorizados y los contadores/bloqueos no se exponen a clientes.

**Publicar la propuesta sin comparación puede romper clientes antiguos:** el registro anterior desde el navegador escribe en horas/contadores; esas escrituras quedarían prohibidas. También el bloqueo final de rutas desconocidas puede afectar otros módulos. La aplicación nueva y las reglas deben activarse de forma coordinada, conservando las políticas necesarias de módulos ajenos y sin reabrir escrituras financieras inseguras.

El Admin SDK omite estas reglas. IAM y las validaciones de la API son obligatorios; cambiar solo reglas no protege un servicio con credenciales comprometidas.

## 3. Respaldo previo y prueba de recuperación

El servicio administrado de exportación/importación de Firestore requiere Blaze/facturación y un bucket adecuado. No se activará para obtener un respaldo sin autorización. Una captura de pantalla o copia de unos documentos no constituye un respaldo completo.

Alternativa conservando Spark: preparar y revisar un **exportador lógico de solo lectura** con identidad separada del servicio de escritura. No está implementado todavía. Debe:

1. Enumerar todas las colecciones y subcolecciones, incluidas las que no conoce esta aplicación y las que tengan documentos padre inexistentes.
2. Preservar rutas, IDs, tipos Firestore, referencias, bytes, geopuntos y timestamps con nanosegundos; no serializar todo a cadenas ISO.
3. Generar un manifiesto con alcance, fecha, proyecto/base, conteos, hashes SHA-256, metadatos de lectura y actualización, y errores. Un error invalida el respaldo.
4. Guardar resultados cifrados fuera del repositorio y fuera de directorios públicos, con acceso y retención acordados. No incluir datos personales en logs.
5. Copiar reglas publicadas, índices y configuración necesarios. Para Auth, conservar inventario de UID/proveedores/estado; una exportación recuperable de hashes exige permisos especiales y debe tratarse como secreto. El servicio de ejecución no necesita esos permisos. No restablecer contraseñas ni importar usuarios durante este piloto.
6. Recuperar la copia en un emulador aislado y comprobar conteos, hashes de contenido, tipos, saldos y relaciones. Un inventario de usuarios sin hashes **no** permite prometer recuperación de contraseñas; declarar el alcance del respaldo Auth.
7. Hacer una copia final durante una ventana sin escrituras de todos los clientes, integraciones y servicios Admin. Una exportación por páginas con escritores activos puede ser inconsistente. Si no se puede asegurar la ventana, no activar el piloto financiero.

Un cambio de reglas para imponer mantenimiento, IAM o permisos de exportación también requiere autorización. La preparación local no constituye autorización para ejecutarlo en producción.

## 4. Alojamiento

| Alternativa                                     | Encaje y costo                                                                            | Condiciones                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equipo local controlado para piloto supervisado | Sin contratar alojamiento nuevo; Node y web locales, Firebase real solo tras autorización | Equipo encendido, ligado a loopback, identidad dedicada de mínimos permisos y ventana de prueba. No exponer puertos por túneles improvisados. Es una prueba supervisada, no un servicio permanente                                                                                                    |
| Render Free                                     | Candidato para un piloto pequeño y temporal, manteniendo Spark en Firebase                | HTTPS y secretos del proveedor; duerme tras 15 minutos sin tráfico, tiene cupos y puede suspenderse. Render desaconseja usar Free para producción. Verificar transferencia, builds y condiciones vigentes antes de aprobarlo                                                                          |
| Render con cómputo pago pequeño                 | Alternativa de costo mensual más predecible para uso continuado                           | Confirmar precio vigente, impuestos y extras; no se ha contratado nada. Preferir una región cercana a Firestore y medir latencia de transacciones                                                                                                                                                     |
| Cloud Run                                       | Identidad gestionada sin una clave JSON permanente y cobro por uso con tramo gratuito     | Requiere cuenta de facturación en el proyecto anfitrión; builds, registro, secretos, red y logs pueden costar. Vincular facturación a `sanicenterdb` lo convierte a Blaze. Un proyecto anfitrión separado con permisos entre proyectos es una alternativa a evaluar, no una configuración ya validada |

Recomendación: primero auditoría y ensayo de recuperación; después piloto supervisado local si se quiere evitar alojamiento. Si se necesita un endpoint compartido sin cambiar Spark, evaluar Render Free solo para piloto y un plan pequeño para continuidad. Si se acepta facturación por uso, evaluar Cloud Run por la identidad gestionada. No prometer costo cero para la operación real.

Guardar cualquier cuenta de servicio externa como secreto del proveedor, nunca en el frontend, Git, `.env` público ni imágenes. Preferir identidad gestionada/federada donde sea viable. Usar identidad exclusiva para el servicio, permisos de datos y consulta de usuarios necesarios para verificar revocación; nunca Owner/Editor. Los permisos de reglas, IAM, exportación de hashes o despliegue no corresponden al servicio de ejecución.

## 5. Cambios del servicio que faltan antes de alojarlo

Son tareas pendientes, no modificaciones aplicadas en esta revisión:

- Fijar una versión Node LTS compatible, corregir o justificar cada aviso de dependencias y repetir pruebas. No ejecutar reparaciones forzadas ni retroceder Firebase siguiendo ciegamente la sugerencia de npm.
- Empaquetar el servicio de manera independiente: `workflow:serve` depende hoy de `tsx`, que es dependencia de desarrollo; un alojamiento que omita dependencias dev no podrá ejecutarlo tal como está. Preparar artefacto compilado o estrategia de dependencias explícita, sin empaquetar secretos ni fixtures.
- Adaptar puerto y host a la plataforma (`PORT` o mapeo explícito a `WORKFLOW_PORT`, interfaz pública del contenedor detrás de HTTPS). El servidor actual escucha loopback por defecto. Añadir salud/readiness de producción sin revelar datos: la única salud actual es local.
- Exigir origen HTTPS exacto en alojamiento compartido y mantener validación del token de Firebase; CORS no sustituye autenticación. En un piloto totalmente local se permite el origen loopback acordado, sin acceso externo.
- Añadir arranque explícito para `sanicenterdb`, protección contra mezclar emuladores/producción, modo de solo lectura inicial, interruptor de escrituras y lista de UID del piloto. La lista debe comprobar tanto al actor como al trabajador afectado: permitir a un admin no debe abrir escrituras sobre toda la empresa.
- Añadir límites por IP/UID, tamaño/tiempos de peticiones y concurrencia, logs sin datos sensibles, monitoreo de fallos/cuota y procedimientos de rotación/revocación. Verificar autenticación sin asumir que App Check ya está implementado.
- Sustituir la escritura completa `transaction.set(recordRef, data)` de documentos existentes por actualizaciones del conjunto de campos previsto, preservando campos desconocidos y usando precondiciones en cualquier migración. La transacción de negocio puede cambiar estado/motivo conforme a una operación autorizada; no debe reemplazar metadatos ajenos.
- Resolver la conservación estricta de proyecciones: la anulación actual elimina `calendar/{id}` como caché pública. Antes del piloto real, acordar expresamente esa eliminación derivada o implementar archivo/desactivación sin borrado y ajustar consultas/reglas para ocultar el descanso. La compensación original y su auditoría se conservan en cualquier caso.
- Revisar tipos de perfiles en el servidor, rendimiento de consultar todo el historial en cada operación y costos de listeners/lecturas de reglas. La ausencia de errores en emuladores no garantiza cuotas, IAM, red ni latencia de producción.

Configuración futura de referencia: `GOOGLE_CLOUD_PROJECT=sanicenterdb`, `WORKFLOW_EMULATOR_MODE=0`, sin variables de host de emuladores ni identidad sintética local; `APP_ORIGIN` acordado; credencial dedicada exclusivamente del servidor; endpoint HTTPS en `VITE_WORKFLOW_API_URL` si se usan orígenes separados. No se creó un archivo de entorno activable ni se ejecutó esta configuración.

El frontend actual se compila para Cloudflare y el servicio Admin Node es independiente. El endpoint no aparecerá por compilar o alojar solamente la web. No desplegar el build SSR existente suponiendo que incluye la API financiera.

## 6. Migraciones: solo diffs y autorización individual

No hay una migración obligatoria de Authentication si UID, correo técnico y perfil ya corresponden. No importar el demo ni recrear usuarios como JBERNALES. Las contraseñas existentes permanecen.

Si faltan campos, preparar un manifiesto por documento con valor anterior, cambio propuesto, evidencia, motivo y precondición de versión. Añadir solo campos aprobados; no borrar campos desconocidos, cambiar IDs ni aplicar `set` completos. Si la versión o el valor difiere del inventariado, detener ese cambio.

No aprobar registros `activo` en bloque. Acordar su tratamiento y reconciliar reservas antes de proponer una transición auditada; mientras tanto no financian nuevas compensaciones. Si esto impide conservar el saldo esperado de los usuarios reales, se bloquea la prueba financiera hasta resolverlo.

No reiniciar, disminuir ni sustituir contadores. Si el valor actual no permite continuar con códigos seguros, entregar un informe y detener nuevas altas. Cualquier avance correctivo requiere autorización explícita; no se considera autorizado por este procedimiento.

Crear proyecciones o nuevas colecciones solo tras inventariar colisiones, con operaciones de creación que fallen si el destino ya existe. No escribir datos ficticios ni ejecutar los scripts `local-fixtures`, `local-services`, `local:demo` o las suites de seguridad/E2E contra el proyecto real.

## 7. Activación por etapas

1. Aprobar proveedor/identidad, lista de participantes y alcance. Obtener acceso de lectura y completar el inventario; resolver todos los puntos bloqueantes.
2. Completar respaldo, copia de configuración y ensayo de recuperación. Conservar artefactos y hashes de versión anterior/nueva y un plan de detención; no reescribir el historial Git.
3. Aplicar primero en emuladores una copia anonimizada de los datos con el formato real. Probar reglas anteriores/nuevas, migraciones propuestas, conservación de campos, JBERNALES como perfil de ejemplo sin su contraseña y reconciliación contable. No subir datos de empleados a servicios públicos.
4. Preparar el servicio con escrituras deshabilitadas y alcance del piloto. Desplegar o iniciar con identidad real solo tras autorización, y validar que no se ejecute ninguna carga demo.
5. Publicar reglas revisadas y realizar cambios de datos únicamente con autorización, ventana de mantenimiento y diffs aprobados. No permitir escritores antiguos que eviten las mismas transacciones y bloqueos; si no se pueden detener, no activar el piloto nuevo.
6. Con autorización separada, abrir primero la versión de lectura con cuentas existentes. Verificar UID, rol, áreas, historial, Dashboard y conciliación de saldos. No basta con que el login funcione.
7. Autorizar una lista concreta de operaciones financieras y habilitar escrituras solo para actor y trabajador del piloto. Los registros y avances de contador serán reales y permanecerán auditados; no son datos temporales para borrar al terminar.
8. Comprobar consecutivos, saldo antes/después, aprobación/rechazo, anulación antes de inicio, devolución una vez y actualización de calendario. Confirmar descansos solo si realmente se realizaron; no alterar fechas para forzar una prueba. Detener ante discrepancias.
9. Conservar el piloto acotado, revisar errores, cuotas y registros; autorizar una ampliación por separado.

## 8. Reversión conservando información

Ante una discrepancia o incidente:

1. Deshabilitar nuevas escrituras en API y demás escritores; bloquear el piloto si falla la identidad o el alcance. Conservar logs, registros, contadores y auditoría.
2. Tomar una copia posterior al incidente y comparar con el respaldo anterior; identificar exactamente qué operaciones se confirmaron.
3. Revertir aplicación/configuración a un artefacto verificado compatible, inicialmente solo lectura. No asumir que los estados nuevos son comprendidos por el cliente antiguo.
4. Revisar la compatibilidad de reglas antes de restaurar un ruleset. Si las reglas previas permitían escrituras inseguras, no reabrirlas; mantener mantenimiento/solo lectura hasta corregirlas. Tampoco iniciar un servicio antiguo con Admin SDK: puede escribir aun con reglas restrictivas.
5. No importar el respaldo encima de la base activa ni borrar documentos del piloto. Una restauración completa perdería altas y decisiones posteriores válidas. Recuperar una copia aislada y preparar reconciliación por documento con aprobación y precondiciones si hiciera falta.
6. No retroceder contadores ni reutilizar códigos. Reversión de código no equivale a reversión de consecutivos.
7. No revertir en bloque roles/áreas, migraciones ni cuentas. Mantener UID/contraseñas y cambios autorizados posteriores; cualquier corrección financiera se registra de forma auditada, no mediante borrado de evidencia.
8. Si hay compromiso de credenciales, revocarlas/rotarlas y revisar accesos mediante una acción autorizada; no permitir nuevos movimientos hasta cerrar el incidente.

## Criterio para poder probar con JBERNALES

Todo lo siguiente debe estar verificado: reglas publicadas comparadas; identidad/perfil existentes compatibles; saldo reconciliado; contadores válidos; respaldo recuperable probado; dependencias revisadas; servicio preparado con identidad mínima, límites y alcance del piloto; reglas coordinadas sin escritores antiguos; autorización explícita para cambiar entorno y para las operaciones reales. Hoy estos requisitos de producción siguen pendientes.

## Fuentes verificadas

- [Render Free: límites y suspensión](https://render.com/docs/free).
- [Render: secretos](https://render.com/docs/configure-environment-variables) y [requisitos de servicios web](https://render.com/docs/web-services).
- [Precios de Render](https://render.com/pricing): confirmar cotización final antes de contratar.
- [Cloud Run: identidad de servicio](https://docs.cloud.google.com/run/docs/securing/service-identity) y [precios](https://cloud.google.com/run/pricing).
- [Planes Firebase y vinculación de facturación](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).
- [Exportación/importación administrada de Firestore](https://firebase.google.com/docs/firestore/manage-data/export-import).
- [Respaldo de usuarios y permisos sobre hashes](https://firebase.google.com/docs/auth/admin/manage-users).
- [IAM de Firestore](https://firebase.google.com/docs/firestore/security/iam) y [consumo de lecturas](https://firebase.google.com/docs/firestore/pricing).
