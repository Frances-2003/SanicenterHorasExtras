# Entorno aislado de Sani Center Horas Extras

La aplicación de prueba utiliza exclusivamente el proyecto ficticio **demo-sanicenter**. No necesita un proyecto en Firebase Console, facturación, cuentas reales ni credenciales privadas de Google.

## Acceso visual

Dirección: **http://127.0.0.1:8080/**. Utilizar esta dirección exacta: el servicio valida el origen del navegador.

Contraseña ficticia para todas las cuentas: **SaniDemo2026!**

| Usuario    | Rol                 | Área             | Resultado esperado                                 |
| ---------- | ------------------- | ---------------- | -------------------------------------------------- |
| ANA        | Trabajador          | Almacen          | Registro propio, compensaciones y calendario       |
| LUIS       | Trabajador          | Almacen          | Otra cuenta para verificar privacidad y calendario |
| MARIA      | Trabajador          | Ventas           | Trabajadora de otra área                           |
| JEFE       | Jefe                | Almacen          | Revisa únicamente su área                          |
| JEFEVENTAS | Jefe                | Ventas           | Revisa únicamente Ventas                           |
| JEFEMULTI  | Jefe                | Almacen y Ventas | Comprueba el acceso a varias áreas autorizadas     |
| ADMIN      | Administrador       | Gerencia         | Revisa todas las áreas y consulta usuarios         |
| INACTIVO   | Trabajador inactivo | Almacen          | El acceso a la aplicación se rechaza               |

El aviso «Entorno local de pruebas · Datos ficticios» identifica esta versión. No utilizar aquí contraseñas de producción.

## Datos de demostración

Se crean cuatro registros de horas extras (aprobados y pendientes, uno termina a medianoche), cuatro compensaciones (pendiente y aprobadas), entradas de calendario y contadores ficticios. Los consecutivos iniciales del emulador son HE-001004 y CP-000104; las operaciones posteriores continúan desde esos valores sin reiniciarlos.

ANA dispone de horas aprobadas para solicitar descansos; JEFE puede revisar su solicitud pendiente y confirmar el descanso aprobado de octubre, cuyo horario ya terminó. LUIS tiene un descanso aprobado dentro de tres días: permite comprobar el aviso de compañeros y el rechazo de una confirmación prematura. MARIA tiene horas pendientes para que JEFEVENTAS o ADMIN las revisen.

Los datos permanecen mientras se ejecutan los emuladores. Al cerrar y volver a iniciar el conjunto, se genera una nueva demostración temporal; no hay exportación de datos de Firebase real. La carga inicial es aditiva e idempotente dentro de una misma sesión. Las pruebas de navegador crean además usuarios QA propios por ejecución, sin borrar las cuentas de demostración ni reiniciar contadores.

## Componentes y aislamiento

- React/Vite: `127.0.0.1:8080`, modo `emulator`.
- Servicio Node: `127.0.0.1:8788`.
- Authentication Emulator: `127.0.0.1:9099`.
- Firestore Emulator visual: `127.0.0.1:8085`.
- Firestore de pruebas de reglas: `127.0.0.1:8095`, separado del visual para no borrar sus datos.

El modo `emulator` sustituye los valores Firebase de `.env.local` por constantes demo. Usa una instancia Firebase separada y conecta explícitamente ambos SDK a los puertos locales. También ignora cualquier `VITE_WORKFLOW_API_URL` externa: las escrituras se envían al proxy local.

Antes de iniciar sesión o guardar, el navegador comprueba `/api/local-health`. Antes de arrancar y antes de cada petición, Node verifica proyecto, variables de ambos emuladores y disponibilidad de sus endpoints. Si faltan servicios, se bloquea la operación. No hay alternativa hacia producción.

El servidor local emplea una identidad sintética con una clave efímera generada únicamente en su memoria. No se lee una cuenta de servicio real y esa identidad rechaza cualquier solicitud de tokens OAuth a Google. Nada de esto se incorpora al frontend. Las credenciales de Google del entorno no se transmiten a los procesos hijos.

Las pruebas del navegador bloquean solicitudes HTTP externas y comprueban que no se haya intentado acceder a dominios de Firebase real. El certificado sintético es una adaptación exclusiva al modo local; las comprobaciones del entorno impiden utilizarlo como configuración de producción.

## Ejecución automatizada

Estas tareas ya fueron ejecutadas por el agente. Se documentan para poder repetirlas en otra sesión; no es necesario que el usuario las ejecute ahora.

```powershell
npm.cmd run local:demo
npm.cmd run test:e2e
npm.cmd test
npx.cmd tsc --noEmit
npx.cmd tsc --noEmit -p tsconfig.server.json
npm.cmd run lint
npm.cmd run build
```

`local:demo` inicia ambos emuladores, crea cuentas/datos, inicia Node y abre el puerto de Vite sin lanzar ventanas. El script selecciona el Java 21 instalado en este equipo si no hay un JAVA_HOME configurado. Las pruebas de navegador usan el Chrome instalado, en modo headless.

Para la suite separada de seguridad, Java 21 debe estar primero en PATH. El agente lo configura para el proceso y ejecuta `npm.cmd run test:security`, sin cambiar la configuración global de Windows. Sus puertos están en `firebase.security.json`.

## Casos verificados

Resultado de la ejecución final: **62 pruebas de aplicación, 16 de seguridad y 7 escenarios de navegador/API aprobados**. TypeScript de aplicación y servidor, `npm.cmd run build` y `git diff --check` aprobados. ESLint: cero errores y ocho advertencias de Fast Refresh. Se comprobaron las pantallas de Resumen y Dashboard y el entorno local con proyecto `demo-sanicenter`.

Se corrigieron dos problemas detectados por Chrome: interacción con los campos de login antes de completar la hidratación de React y discrepancia entre `localhost` y `127.0.0.1` al validar el origen del navegador. La contraseña y el mecanismo de autenticación existentes se conservan.

- Login real de Authentication Emulator y lectura del perfil con reglas de Firestore.
- Registro de horas desde las pantallas, aprobación, rechazo y anulación.
- Solicitud de compensación, reserva, aprobación y rechazo.
- Cancelación solicitada: conserva el saldo comprometido; rechazo del jefe: vuelve a aprobada; autorización: devuelve exactamente los minutos usados.
- Confirmación manual después del horario; rechazo de confirmaciones prematuras.
- Acceso por rol y área; cuenta inactiva; rechazo de autoaprobación, token inválido, campos de rol falsificados y modificación directa de perfiles.
- Calendario compartido, privacidad de motivos y aviso de compañeros.
- Solicitudes simultáneas, consecutivos, reintentos idempotentes y superposición entre fechas por cruce de medianoche.
- Bloqueo de operaciones cuando falla la comprobación local y validación de que ambos emuladores son obligatorios.

Los informes y capturas están en `playwright-report/` y `test-results/`, excluidos de Git. Los logs locales también están excluidos. El resultado de producción no se da por validado: siguen pendientes el alojamiento seguro, revisión de dependencias, IAM, cuotas, revisión de datos históricos y publicación autorizada de reglas.

## Revisar anulación de compensaciones

1. Ingresar como **ANA** y abrir **Mis compensaciones**. El descanso **CP-000104** está aprobado para dentro de tres días. Elegir **Solicitar anulación**, escribir un motivo y confirmar. Su saldo sigue comprometido durante la solicitud.
2. Cerrar sesión e ingresar como **JEFE**. En **Solicitudes pendientes**, abrir **Anulaciones pendientes**. Se puede **Autorizar anulación** o **Denegar anulación**, siempre con motivo. Al denegar, el descanso sigue aprobado y se puede solicitar nuevamente mientras no haya comenzado.
3. Al autorizar, revisar **Todas** para ver **Anulada** y su motivo. ANA recupera exactamente los 60 minutos, conserva el historial y el descanso deja de figurar en el calendario.
4. Para probar la acción directa del jefe, usar **Anular compensación** en **Aprobadas** sobre **CP-000103**, el descanso futuro de LUIS. Se reutiliza la misma transición, sin una solicitud paralela.
5. La anulación desaparece de las opciones cuando comienza el descanso (hora de Perú). El servidor vuelve a comprobar el límite al guardar, aunque la pantalla quede abierta. No admite descansos efectuados. Si una solicitud venció esperando autorización, el jefe aún puede denegarla para devolverla a aprobada, sin liberar saldo.

Se conservan los nombres internos `requestCancellation`, `reviewCancellation` y `cancelacion_pendiente` por compatibilidad. El campo opcional `direct` reutiliza `reviewCancellation` para la acción del jefe. No se agregó confirmación automática por fecha. La auditoría conserva actor, motivo, fecha, estados y si la anulación fue directa.

## Revisar Dashboard

- Ingresar como **JEFE**, **JEFEMULTI** o **ADMIN** y abrir **Dashboard** en la navegación, o visitar `http://127.0.0.1:8080/dashboard`.
- Elegir meses desde/hasta y área, o **Todo el historial**. Los gráficos, tarjetas y tabla se calculan de los registros del entorno; no contienen cifras de ejemplo fijas.
- **Horas aprobadas**: horas extras actualmente aprobadas realizadas dentro del período. Excluye pendientes, anuladas y registros antiguos sin aprobación.
- **Horas compensadas**: descansos con estado `efectuada` dentro del período, confirmados manualmente. Una aprobación futura no se presenta como descanso realizado.
- **Saldo disponible histórico**: saldo actual de los trabajadores del área elegida sobre todo el historial, descontando reservas, aprobaciones y descansos efectuados. Permanece histórico al cambiar el período para no omitir compromisos de otros meses.
- **Solicitudes pendientes**: horas extras pendientes, compensaciones pendientes y solicitudes de anulación pendientes del período. El gráfico circular cuenta registros de horas extras y compensaciones por su estado actual.
- La tabla filtra horas aprobadas y efectuadas por período; muestra disponibilidad histórica actual. El ranking muestra hasta diez trabajadores y la evolución usa el mes de realización de las horas extras.
- **JEFE** no ve Ventas; **JEFEMULTI** ve Almacen y Ventas; **ADMIN** ve todas las áreas. **ANA** no tiene enlace y se rechaza el acceso directo. El perfil admite `authorizedAreas` como lista opcional de áreas adicionales a `area`, protegida igual que los roles.

Las consultas, reglas y validaciones del servicio aplican el mismo alcance multiárea. No se publicaron reglas ni se modificaron perfiles reales.
