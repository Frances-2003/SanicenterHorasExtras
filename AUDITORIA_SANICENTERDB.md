# Auditoría de solo lectura — sanicenterdb

Fecha: **10 de noviembre de 2026, 00:38, hora de Perú**. Comparación adicional de permisos en emulador: 00:40. Estado: **auditoría completada; activación no autorizada ni ejecutada**.

## Alcance y evidencia

Se completó el inicio de sesión con el mecanismo oficial de Firebase CLI y se guardó la sesión exclusivamente en su configuración local habitual. No se utilizaron contraseñas de empleados, cuentas de servicio nuevas ni claves privadas para la auditoría. No fue necesario añadir roles, permisos, APIs ni facturación: las consultas funcionaron con los permisos existentes de la cuenta autorizada.

El proyecto se verificó mediante Firebase API como `sanicenterdb`, nombre `SanicenterDB`, estado `ACTIVE`. Las consultas apuntaron explícitamente a ese proyecto; no se ejecutó `firebase use`, no se cambió el alias por defecto y no existe `.firebaserc` local. La configuración existente de la aplicación coincide con el identificador auditado, pero no se inició la aplicación contra producción.

Base consultada: `(default)`, Firestore Native, edición Standard, ubicación `southamerica-west1`, concurrencia `PESSIMISTIC`. La protección administrativa contra eliminación de la base está desactivada. No se cambió.

La consulta final utilizó 27 peticiones de API de lectura. Una primera pasada de 16 peticiones detectó dos consultas de índices con argumentos no aceptados; se corrigieron al formato de Firebase CLI y se repitió la inspección. No se trataba de falta de permisos y no se ampliaron privilegios. El número de peticiones HTTP no equivale al número de lecturas facturables de Firestore.

El script `scripts/audit-firebase-readonly.mjs` permite únicamente GET y tres operaciones POST de lectura: listar IDs de colecciones, consultas agregadas y búsqueda de cuentas de Authentication. Bloquea otros hosts, proyectos y operaciones. No utiliza SDKs de escritura ni funciones de despliegue. El informe de metadatos está en `AUDITORIA_SANICENTERDB_2026-11-10.local.json`; no contiene contraseñas, hashes de contraseñas, tokens, claves privadas, motivos personales ni UID completos. Las referencias a UID se representan mediante hashes parciales. Los literales desconocidos de las reglas se omiten antes de escribirlos.

Esta auditoría no es un respaldo ni una instantánea transaccional. El script limita la inspección a 100 colecciones raíz, 100 documentos por colección conocida y 10 documentos padre por colección para descubrir subcolecciones. En el estado encontrado no hubo paginaciones truncadas: se inspeccionaron ambos documentos raíz existentes y no se encontraron subcolecciones bajo ellos. No se afirma que nunca hayan existido registros borrados anteriormente. No se auditó un historial de eliminación ni se cambió configuración de billing/IAM.

## 1. Authentication y JBERNALES

| Comprobación                               | Resultado                            |
| ------------------------------------------ | ------------------------------------ |
| Proveedor correo/contraseña                | Habilitado, con contraseña requerida |
| Número de cuentas inspeccionadas           | 1; inventario sin truncar            |
| Usuario solicitado                         | JBERNALES encontrado                 |
| Cuenta deshabilitada                       | No                                   |
| Proveedor de la cuenta                     | `password`                           |
| Correo técnico utilizado por la aplicación | Coincide con la cuenta existente     |
| Perfil `users/{uid}` correspondiente       | Existe y corresponde al mismo UID    |
| `username`                                 | Coincide con `JBERNALES`             |
| `role`                                     | `trabajador`                         |
| `area`                                     | `Inventario`                         |
| `active`                                   | Booleano `true`                      |
| Nombre de presentación                     | Presente; no se copia al informe     |
| Cuentas sin perfil / perfiles sin cuenta   | Ninguno entre los inventariados      |
| Jefe / administrador real existente        | Ninguno encontrado                   |
| MFA del proyecto                           | Deshabilitado; no se cambió          |

Dominios autorizados observados: `localhost`, `sanicenterdb.firebaseapp.com`, `sanicenterdb.web.app`. Cuando se elija la URL real de la web, revisar si requiere incorporar su dominio para los mecanismos de autenticación/enlaces que se utilicen. No se añadieron dominios ni se supuso que un dominio externo ya está autorizado.

**Conclusión:** no es necesario recrear JBERNALES, cambiar su UID ni restablecer su contraseña para el contrato de login actual. No se probó su contraseña ni se inició sesión como él. La identidad Google usada para auditar mediante Firebase CLI es independiente del rol de trabajador que su aplicación asigna a JBERNALES.

Para probar el flujo de dos personas hace falta identificar una cuenta real de jefe o administrador y autorizar su alta/perfil si no existe. Un jefe deberá tener `area: "Inventario"` o esa área entre sus autorizadas adicionales. No se debe convertir JBERNALES en administrador para evitar esta separación: el servicio también impide autoaprobar sus propias solicitudes.

## 2. Colecciones, registros históricos y contadores

| Colección       | Documentos observados | Observación                                         |
| --------------- | --------------------: | --------------------------------------------------- |
| `users`         |                     1 | Perfil de JBERNALES compatible                      |
| `counters`      |                     1 | Solo `counters/overtime`                            |
| `overtime`      |                     0 | Sin registros de horas extras en la base consultada |
| `compensations` |                     0 | Sin solicitudes existentes                          |
| `calendar`      |                     0 | Sin proyecciones existentes                         |
| `audit`         |                     0 | Sin auditoría del nuevo flujo                       |
| `workflowLocks` |                     0 | Sin bloqueos del nuevo flujo                        |

`counters/overtime.lastNumber` es un entero válido con valor **0**. No hay códigos HE existentes en esta base con los que entre en conflicto. **Debe conservarse tal cual; no requiere reinicio ni corrección.** El servicio asignaría el siguiente número únicamente cuando se autorice y confirme una nueva operación real.

No existe `counters/compensations`. El servicio actual rechaza las altas de compensación cuando falta ese contador. Por no haber registros CP, el cambio propuesto sería crear ese documento con `lastNumber: 0`, mediante creación condicionada a que continúe ausente y con una nueva comprobación de códigos. **No se creó.** Debe contar con autorización antes de cualquier escritura.

No se encontraron estados históricos `activo`, `anulado` ni otros estados que migrar porque no hay registros financieros. Por tanto, en el estado auditado no hace falta una migración masiva de horas o compensaciones ni una reconstrucción del calendario histórico. Si antes de la activación aparecen registros nuevos, habrá que volver a comprobarlos, sin asumir que siguen vacías las colecciones.

## 3. Reglas publicadas frente a reglas locales

Ruleset publicado: `projects/sanicenterdb/rulesets/8f1488d9-fed6-424a-88c7-f36d8f05de25`.

Release: `projects/sanicenterdb/releases/cloud.firestore`, actualizado el **8 de noviembre de 2026 a las 20:38:43, hora de Perú** (`2026-11-09T01:38:43.753179Z`).

Huella SHA-256 del archivo publicado: `9b9c262009b80c7f579247171acea1e3c74ee9009dd362f239065b6ec36fef80`.

Huella SHA-256 del archivo local revisado: `86e26cc195cd49245fcb7cde76f1b67e8bdb949248472b7a98c6bae83f1619b8`.

| Función                               | Reglas publicadas                              | Propuesta local                                          | Efecto para activar                                                                     |
| ------------------------------------- | ---------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Lectura de perfil propio              | Permitida al usuario autenticado               | Se conserva                                              | Compatible con el login de JBERNALES                                                    |
| Perfiles del equipo                   | Denegados a jefe/admin salvo su propio perfil  | Permitidos por área a jefe y globalmente a admin activos | El Dashboard y los nombres del equipo no funcionan plenamente con las reglas publicadas |
| Horas extras propias                  | Lectura del propietario activo                 | Se conserva                                              | Compatible para lectura                                                                 |
| Horas extras de otras personas        | Un jefe/admin activo puede leer cualquier área | Jefe limitado a sus áreas; admin todas                   | Corregir alcance antes de introducir jefaturas reales                                   |
| Lectura de compensaciones             | Denegada por bloqueo general                   | Propietario o gestor autorizado                          | El historial, reservas y revisión requieren reglas nuevas                               |
| Calendario compartido                 | Lectura denegada                               | Lectura de proyección pública para perfiles activos      | Resumen y aviso de compañeros requieren reglas nuevas                                   |
| Auditoría                             | Lectura denegada                               | Gestores autorizados                                     | Decidir quién puede consultar auditoría y aplicar alcance                               |
| Escrituras desde navegador            | Denegadas                                      | Siguen denegadas                                         | Mantenerlas así; usar servicio Node validado                                            |
| Contadores y bloqueos desde navegador | Denegados                                      | Siguen denegados                                         | No abrirlos para resolver errores de permisos                                           |
| Rutas desconocidas                    | Lectura/escritura denegadas                    | Se conserva                                              | No se encontraron otros módulos en la estructura auditada                               |

**Riesgo prioritario:** la función publicada `isManager()` comprueba rol y actividad, pero no el área. Actualmente no existe ningún jefe real en el inventario; el riesgo se materializaría al incorporarlo sin corregir antes esa política.

No es necesario ni seguro permitir escrituras financieras al cliente para habilitar el flujo. El Admin SDK del futuro servicio omite estas reglas y debe validar, por separado, permisos y transacciones.

### Validación independiente en emulador

Se ejecutaron **dos pruebas aprobadas** en el Firestore Emulator de seguridad, puerto 8095, proyecto ficticio `demo-sanicenter`. Se usaron perfiles y documentos sintéticos; ningún usuario real inició sesión y no se alteró el emulador visual.

1. La copia saneada de las reglas publicadas —sin literales omitidos, solo comentarios retirados— permitió lectura propia de perfil/horas, bloqueó compensaciones/calendario/listado del equipo y permitió a un jefe sintético de Ventas leer horas de Inventario. También rechazó una escritura directa.
2. Las reglas locales permitieron las lecturas previstas de compensaciones, calendario y listado de usuarios del área; rechazaron la lectura de horas de otra área y las escrituras directas.

Estas pruebas verifican la diferencia semántica de reglas, pero no sustituyen el futuro piloto con tokens reales de participantes autorizados. No se publicaron reglas ni se crearon releases.

## 4. Índices

No se encontraron índices compuestos. La política global de campo individual conserva índices ascendentes, descendentes y de pertenencia a arrays en estado `READY`. La respuesta no tuvo paginación pendiente y no aparecieron exenciones específicas de campos ni TTL entre las consultadas.

Esto es compatible con las consultas simples actuales por `workerId`, `area` y `code`; el archivo local tampoco solicita índices compuestos. **No hay una necesidad de crear o borrar índices para el código actual según esta auditoría.** Si cambian consultas, revisar nuevamente; no desplegar índices de otros proyectos ni eliminar los existentes.

## 5. Riesgos y cambios pendientes

| Prioridad                           | Hallazgo                                                                                       | Acción propuesta, sin ejecutar                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Bloqueante funcional                | Reglas publicadas no permiten las lecturas del flujo nuevo                                     | Preparar publicación coordinada de las reglas revisadas, con autorización                                                               |
| Bloqueante funcional                | No hay jefe/admin real                                                                         | Elegir participante y autorizar su cuenta/perfil con áreas correctas, conservando JBERNALES                                             |
| Bloqueante funcional                | Falta contador CP                                                                              | Autorizar creación condicionada de `counters/compensations`, tras volver a validar ausencia/códigos                                     |
| Alto, antes de incorporar gestores  | Jefaturas publicadas sin filtro de área                                                        | Corregir con la política local probada antes de otorgar roles gestores                                                                  |
| Alto, antes de publicar el servicio | Servicio real, identidad mínima, interruptor de escrituras y lista de participantes pendientes | Completar y ensayar la preparación de `ACTIVACION_SANICENTERDB.md`; no usar la sesión personal de auditoría como identidad de ejecución |
| Alto, antes de activar              | Respaldo y recuperación real todavía no preparados                                             | Respaldar los datos/configuración de forma adecuada al plan aprobado y ensayar recuperación sin escribir sobre producción               |
| Pendiente de revisión técnica       | Avisos de dependencias registrados en la revisión anterior                                     | Corregir o justificar y volver a probar antes del piloto; no se realizó una nueva auditoría npm en esta etapa                           |
| Administrativo                      | Protección de eliminación de base desactivada                                                  | Evaluar habilitarla mediante autorización separada; no protege contra borrados de documentos ni reemplaza respaldo                      |
| Operativo                           | MFA no habilitado y URL final aún por decidir                                                  | Evaluar protección para gestores y dominios necesarios, sin habilitar servicios/costos por suposición                                   |

## 6. Secuencia mínima para continuar

1. Revisar este informe y conservar su evidencia de solo lectura. El inventario no demuestra que exista un respaldo recuperable.
2. Preparar y ensayar respaldo/recuperación; definir alojamiento e identidad del servicio, completar medidas pendientes y ensayar una copia de esta estructura en emuladores.
3. Elegir el jefe/admin del piloto y acordar quién autoriza sus roles y áreas. Mantener el usuario JBERNALES existente.
4. Preparar diffs concretos: reglas publicadas → locales revisadas, alta del gestor si procede y creación del contador CP. No hay migración histórica masiva justificada por el estado observado.
5. Solicitar autorización explícita antes de cualquiera de esas escrituras/configuraciones, publicación de reglas, despliegue o eventual facturación.
6. Tras la preparación, realizar primero el piloto real de lectura; habilitar movimientos concretos únicamente después de reconciliar datos y aprobar el alcance financiero.

No cambiar la web al modo real ni reutilizar la sesión de Firebase CLI como credencial del frontend. No ejecutar fixtures, pruebas E2E o scripts de emuladores contra `sanicenterdb`. Los usuarios, contraseñas, documentos, contador, reglas, índices y configuración reales permanecieron sin cambios durante esta auditoría.
