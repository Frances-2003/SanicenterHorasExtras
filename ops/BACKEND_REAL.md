# Backend real: preparación general sin listas UID

La identidad, el rol personalizado y su asignación IAM ya existen. Se mantienen. La clave anterior fue declarada expuesta y no debe reutilizarse: preparar su sustitución y revocación según [PRODUCCION_GENERAL.md](PRODUCCION_GENERAL.md). No se ha rotado la clave ni se ha autorizado la nueva activación general.

Antecedentes de configuración, sin repetir ni ejecutar ahora:

1. Crear la identidad `sanicenter-workflow@sanicenterdb.iam.gserviceaccount.com`.
2. Crear el rol personalizado `projects/sanicenterdb/roles/sanicenterWorkflow` con los seis permisos exactos de `workflow-runtime-role.json` y asignarlo únicamente a esa identidad, conservando las demás asignaciones IAM mediante su etag. No asignar Owner, Editor ni permisos para gestionar usuarios, reglas, IAM, borrados o facturación.
3. La futura clave de reemplazo debe guardarse en un archivo nuevo fuera del repositorio, con ACL restringida al propietario Windows y SYSTEM. No mostrarla ni incluirla en logs, VITE_*, Git o archivos públicos. Su copia a Netlify necesita autorización y configuración privada de Functions.
4. El launcher ya no utiliza UID fijos ni modo `pilot`. Al autorizar su inicio real, permite a todos los perfiles activos válidos operar por rol/área con modo `enabled`, incluidos los usuarios futuros. No concede autoaprobación al trabajador ni áreas adicionales a JPAREDES. Las operaciones crean registros reales y auditoría; no se eliminan automáticamente. Iniciar el servidor no crea solicitudes financieras.

Solo tras sustituir/revocar la clave comprometida y autorizar la activación general, iniciar:

```powershell
npm.cmd run netlify:real -- --start-real --authorize-general-writes --credential-file "C:\Users\JULIO B\SaniCenter-Secrets\sanicenter-workflow-rotada.json"
```

Abrir `http://localhost:8888`. El launcher compila el frontend de producción sin entregarle la credencial y sirve las dos funciones mediante Netlify Dev offline. Offline impide operaciones de Netlify; Firebase usa la red real cuando el usuario inicia sesión o realiza operaciones. No publica el sitio. `npm.cmd run dev` continúa como login real con finanzas bloqueadas.

`npm.cmd run netlify:real -- --locked` sirve la misma entrada sin credencial ni escrituras y permite comprobar las rutas locales. No usar `--live`, dominios remotos ni exponer el puerto. Los previews siguen bloqueados y producción sigue requiriendo HTTPS. Las reglas de Firestore continúan denegando escrituras financieras del navegador.

Los permisos IAM son a nivel de base/proyecto, no filtros de colecciones o áreas. El código transaccional impone roles, áreas, saldos, idempotencia y auditoría. La clave otorga creación/actualización de documentos: mantenerla privada y revocarla si se compromete. No se habilitan APIs ni facturación automáticamente; si una política impide crear la clave o el rol, detenerse y explicar el bloqueo.

La activación es temporal y únicamente local: cerrar Netlify Dev detiene el servicio; `npm.cmd run dev` conserva las operaciones financieras bloqueadas. No se cambian usuarios, contraseñas, reglas ni contadores manualmente. Los registros y aprobaciones que el propietario realice desde la aplicación sí se conservan en Firebase y avanzan sus contadores mediante el backend. No se ha desplegado Netlify ni autorizado su activación productiva.

Compatibilidad Node 24/Lambda: configurar también `NODE_OPTIONS=--experimental-require-module` en el runtime de Netlify. El launcher ya lo configura para Netlify Dev. Firebase Admin incluye una dependencia CommonJS que requiere `jose` ESM; Lambda y su emulación local deshabilitan esa interoperabilidad por defecto. Este indicador no modifica permisos ni validaciones de autenticación.

Referencias: [Netlify Dev](https://docs.netlify.com/api-and-cli-guides/cli-guides/local-development/), [permisos de Firestore](https://docs.cloud.google.com/firestore/native/docs/security/iam), [consulta de usuarios Auth](https://docs.cloud.google.com/identity-platform/docs/access-control).
