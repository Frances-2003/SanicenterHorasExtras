# Backend real: activación local autorizada

La identidad, el rol personalizado exacto y su asignación IAM ya se crearon con autorización del propietario. La clave se guardó fuera del repositorio con acceso únicamente para el propietario Windows y SYSTEM. Se verificaron con esa identidad la lectura y consulta de Firestore, una transacción de solo lectura y la consulta de Authentication. No repetir la creación de identidad, rol o clave.

Estas son las operaciones autorizadas y completadas para la activación local:

1. Crear la identidad `sanicenter-workflow@sanicenterdb.iam.gserviceaccount.com`.
2. Crear el rol personalizado `projects/sanicenterdb/roles/sanicenterWorkflow` con los seis permisos exactos de `workflow-runtime-role.json` y asignarlo únicamente a esa identidad, conservando las demás asignaciones IAM mediante su etag. No asignar Owner, Editor ni permisos para gestionar usuarios, reglas, IAM, borrados o facturación.
3. Crear una clave privada de esa identidad y guardarla únicamente en `C:\Users\JULIO B\SaniCenter-Secrets\sanicenter-workflow.json`, fuera del repositorio, con ACL restringida al propietario Windows y SYSTEM. No mostrarla ni incluirla en logs, VITE_*, Git o archivos públicos. Su copia futura a Netlify se realiza mediante la configuración privada de Functions.
4. Autorizar la ejecución local con escrituras reales limitadas por UID a JBERNALES como trabajador y JPAREDES como aprobador. Las operaciones crean registros reales, avanzan contadores y conservan auditoría; no son una demo ni se eliminan automáticamente. No se ejecutan solicitudes financieras automáticamente al iniciar el servidor.

Para iniciar la activación local ya autorizada, ejecutar:

```powershell
npm.cmd run netlify:real -- --start-real --authorize-real-writes --credential-file "C:\Users\JULIO B\SaniCenter-Secrets\sanicenter-workflow.json"
```

Abrir `http://localhost:8888`. El launcher compila el frontend de producción sin entregarle la credencial y sirve las dos funciones mediante Netlify Dev offline. Offline impide operaciones de Netlify; Firebase usa la red real cuando el usuario inicia sesión o realiza operaciones. No publica el sitio. `npm.cmd run dev` continúa como login real con finanzas bloqueadas.

`npm.cmd run netlify:real -- --locked` sirve la misma entrada sin credencial ni escrituras y permite comprobar las rutas locales. No usar `--live`, dominios remotos ni exponer el puerto. Los previews siguen bloqueados y producción sigue requiriendo HTTPS. Las reglas de Firestore continúan denegando escrituras financieras del navegador.

Los permisos IAM son a nivel de base/proyecto, no filtros de colecciones o áreas. El código transaccional impone roles, áreas, saldos, idempotencia y auditoría. La clave otorga creación/actualización de documentos: mantenerla privada y revocarla si se compromete. No se habilitan APIs ni facturación automáticamente; si una política impide crear la clave o el rol, detenerse y explicar el bloqueo.

La activación es temporal y únicamente local: cerrar Netlify Dev detiene el servicio; `npm.cmd run dev` conserva las operaciones financieras bloqueadas. No se cambian usuarios, contraseñas, reglas ni contadores manualmente. Los registros y aprobaciones que el propietario realice desde la aplicación sí se conservan en Firebase y avanzan sus contadores mediante el backend. No se ha desplegado Netlify ni autorizado su activación productiva.

Compatibilidad Node 24/Lambda: configurar también `NODE_OPTIONS=--experimental-require-module` en el runtime de Netlify. El launcher ya lo configura para Netlify Dev. Firebase Admin incluye una dependencia CommonJS que requiere `jose` ESM; Lambda y su emulación local deshabilitan esa interoperabilidad por defecto. Este indicador no modifica permisos ni validaciones de autenticación.

Referencias: [Netlify Dev](https://docs.netlify.com/api-and-cli-guides/cli-guides/local-development/), [permisos de Firestore](https://docs.cloud.google.com/firestore/native/docs/security/iam), [consulta de usuarios Auth](https://docs.cloud.google.com/identity-platform/docs/access-control).
