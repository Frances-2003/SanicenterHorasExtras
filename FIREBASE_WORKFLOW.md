# Sani Center: activación del flujo de horas

**Actualización de preparación Netlify:** consulte [NETLIFY_FIREBASE.md](NETLIFY_FIREBASE.md) para la configuración vigente, respaldo cifrado, contador CP, reglas propuestas, permisos, dependencias, activación y reversión. Esa preparación reemplaza las instrucciones antiguas de ADC/alojamiento siguientes. La cancelación ahora archiva la proyección del calendario, sin borrarla. Producción continúa deshabilitada.

Actualización de pruebas locales: se añadió un entorno completo de Authentication y Firestore Emulator con cuentas ficticias, datos iniciales, arranque automático del servicio y la web, pruebas de navegador y bloqueos contra conexiones de producción. Consulte [PRUEBAS_LOCALES.md](PRUEBAS_LOCALES.md) para acceso, cuentas y alcance. Los pendientes siguientes sobre Firebase real continúan sin ejecutarse.

El login existente de usuario y contraseña continúa usando Firebase Authentication. Las lecturas permanecen en `src/services/store.ts`; las escrituras pasan desde ese archivo a un servicio Node de confianza (`server/index.ts` y `server/workflow-store.ts`). `src/services/ledger.ts` contiene el cálculo puro de saldos y `workflow.ts` las transiciones y permisos.

## Estado de esta entrega

Solo se modificó código local en la rama de desarrollo. No se publicó, desplegó ni modificó Firebase real. El nuevo flujo necesita el servicio y las reglas propuestos antes de usarse con datos reales. Sin servicio disponible, las operaciones muestran un error; no se simulan guardados en memoria.

Los estados `activo` y `anulado` antiguos se conservan y se muestran. `activo` bloquea superposiciones, pero no se considera aprobación. No existe conversión automática de datos históricos.

## Garantías y alcance

- Las solicitudes nuevas nacen pendientes. Solo las horas extras `aprobada` financian compensaciones.
- La creación lee el contador existente, incrementa exactamente uno y verifica colisiones de código. Nunca crea ni reinicia `counters/overtime`.
- Todas las mutaciones del trabajador leen y escriben `workflowLocks/{uid}` dentro de la misma transacción. También leen sus registros actuales: solicitudes concurrentes no pueden reservar el mismo saldo ni insertar horarios superpuestos. Las asignaciones duplicadas se agrupan.
- Fin menor o igual al inicio significa cruce de medianoche; horarios iguales representan 24 horas, conforme a AGENTS.md. Los intervalos son semiabiertos: terminar justo al comenzar otro turno no es superposición. Las confirmaciones comparan el fin del descanso con la hora del servidor en Perú (UTC-5).
- Pendiente, aprobada, cancelación pendiente y efectuada mantienen saldo comprometido. Solo rechazo o cancelación autorizada lo liberan. No se suma saldo mediante incrementos: se deriva de los registros, evitando devoluciones dobles.
- Una anulación denegada vuelve a aprobada. Solicitar o autorizar una anulación, incluida la directa del jefe, solo es posible antes del inicio del descanso (hora de Perú). Un descanso efectuado no se puede anular. Solo jefe/admin confirma su realización después del fin del horario. No hay confirmación automática ni equivalencia entre aprobación y realización.
- Se exige motivo para todas las decisiones. Auditoría inmutable para clientes, con actor, rol, trabajador, estado anterior y posterior, motivo y fecha del servidor, escrita en la misma transacción. Los reintentos con el mismo identificador son idempotentes; cambiar su contenido se rechaza.
- Se verifica el ID token (incluida revocación) y se lee el perfil actual en cada transacción. Trabajadores operan sobre sí mismos, jefes sobre su área y las adicionales de `authorizedAreas`, y admin sobre cualquier área. No se permite autoaprobación. No se confía en roles recibidos del navegador.
- El calendario comparte únicamente nombre, área, fecha, horario, duración, código y estado. No comparte motivos personales, asignaciones ni saldos. Incluye aprobadas, cancelaciones pendientes y efectuadas; al autorizar una cancelación se elimina su entrada.
- Las reglas propuestas niegan todas las escrituras directas, incluso a perfiles admin. El Admin SDK las omite y por ello el servicio valida permisos y transiciones explícitamente. No debe mantenerse otro servicio/escritor con credenciales que ignore este protocolo.
- El servicio consulta el historial del trabajador para comprobar los invariantes. Su coste crece con el historial; si se alcanzan límites/cuotas, la operación falla sin efectuar escrituras parciales. Para volúmenes mayores se necesita particionar intervalos y mantener saldos materiales con su reconciliación, también desde un backend de confianza; no eliminar validaciones.

## Acciones manuales pendientes (requieren autorización)

1. Exportar/resguardar los datos y revisar reglas actualmente publicadas. Estas reglas locales no se han descargado de producción y no incluyen reglas de otros módulos desconocidos.
2. Revisar `users/{uid}`: nombre, rol, área y `active`. El alcance de jefe se define por igualdad exacta de área. Si la organización utiliza otra jerarquía, acordarla antes de activar.
3. Revisar documentos históricos. Para acceso de jefes se necesita `area` en horas extras y compensaciones existentes. Revisar manualmente estados `activo` antes de una eventual migración autorizada a `aprobada`; resolver también datos antiguos inconsistentes. No se proporciona migración automática ni se borra información.
4. Verificar el valor actual de `counters/overtime.lastNumber` contra los códigos existentes. No reiniciarlo. Crear/revisar `counters/compensations.lastNumber` con el último consecutivo real de compensaciones (0 solo si no existe ningún registro/código previo). El servicio rechaza contadores ausentes, inválidos o con colisión; no los repara.
5. Proyectar en `calendar/{compensationId}` las compensaciones históricas aprobadas/efectuadas con los campos públicos descritos. Las nuevas aprobaciones se proyectan automáticamente. Esta tarea pendiente no modifica ni recrea las compensaciones originales.
6. Revisar dependencias con `npm.cmd audit` antes de producción. La revisión local encontró avisos en dependencias existentes y transitivas; no se aplicó `audit fix --force` ni cambios de versión mayor del SDK/login.
7. Alojar el servicio en un servidor Node de confianza externo con HTTPS. Esto permite usar Firestore sin Cloud Functions en Spark; requiere un alojamiento seguro y sus propios costes/cuotas. Alternativa: adoptar un plan que permita un backend administrado y portar el mismo ejecutor a ese entorno. No es seguro sustituirlo por validaciones únicamente del navegador.
8. Configurar credenciales mediante Application Default Credentials, identidad de servicio e IAM con permisos mínimos. Nunca poner JSON de cuenta de servicio ni claves privadas en el repositorio o en variables `VITE_*`. Configurar `GOOGLE_CLOUD_PROJECT`, `APP_ORIGIN` (origen exacto), `WORKFLOW_PORT` (8788 por defecto) y opcionalmente `WORKFLOW_HOST` según el proxy privado. Ejecutar `npm.cmd run workflow:serve` solo después de autorizar la conexión. El servicio está separado del build Cloudflare existente y no se inicia con el build.
9. En desarrollo Vite reenvía `/api/workflow` al puerto local 8788. En producción usar un proxy HTTPS en el mismo origen o configurar `VITE_WORKFLOW_API_URL` con el origen HTTPS del servicio. Agregar límites de solicitudes en ese proxy. El servicio limita el cuerpo a 32 KiB, admite un único origen configurado y exige token Bearer.
10. Publicar las reglas revisadas de forma coordinada con el servicio; mantener bloqueadas las escrituras de la versión antigua. `firestore.indexes.json` no requiere índices compuestos: las consultas filtran únicamente por `workerId`, `area` o `code`; ordenación y filtros de pantalla ocurren localmente. Mantener habilitados los índices de campo individuales predeterminados.
11. Probar en un entorno Firebase de pruebas con cuentas trabajador/jefe/admin: login real, perfiles inactivos, áreas, observadores, reconexión, auditoría y calendario. El login real de producción no se ejercitó porque no se utilizaron credenciales ni datos reales. La administración de perfiles/activación queda en Firebase; se deshabilitó el interruptor que antes solo cambiaba memoria y anunciaba un éxito ficticio.

## Verificación local

Resultado actualizado: 62 pruebas de aplicación, 16 de seguridad/transacciones y 7 escenarios de navegador/API aprobados, incluyendo anulación directa y Dashboard multiárea. Las pruebas concurrentes exigen rechazos de negocio (no aceptan un timeout como evidencia). TypeScript de cliente y servidor y `npm.cmd run build` aprobados. ESLint: cero errores y ocho advertencias de Fast Refresh. El build conserva avisos de tamaño de bundle y configuración del empaquetador.

`npm.cmd audit --omit=dev` reportó 12 avisos (6 altos, 6 moderados), entre ellos el SDK cliente de Firebase a través de gRPC, Vite, Zod y dependencias transitivas de Google. Estos avisos requieren revisión antes de producción; no se afirma que esta entrega esté lista para publicarse. El límite de cuerpo HTTP reduce la exposición de la validación, pero no sustituye la revisión de versiones. No se ejecutaron reparaciones forzadas ni cambios mayores del login.

```powershell
npm.cmd test
npx.cmd tsc --noEmit
npx.cmd tsc --noEmit -p tsconfig.server.json
# Java 21 o superior debe estar primero en PATH para el emulador actual.
npm.cmd run test:security
npm.cmd run build
```

`test:security` utiliza exclusivamente el proyecto ficticio `demo-sanicenter`, carga reglas locales y prueba permisos, escrituras prohibidas, contadores, idempotencia y concurrencia real contra el emulador. Las pruebas se niegan a ejecutarse si no existe `FIRESTORE_EMULATOR_HOST` o el proyecto no es el demo previsto. No ejecutar estos archivos con un proyecto real ni exportar credenciales de producción para pruebas.

Referencias: [transacciones y aislamiento](https://firebase.google.com/docs/firestore/transaction-data-contention), [verificación de ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [reglas y SDK de servidor](https://firebase.google.com/docs/firestore/security/rules-conditions).
