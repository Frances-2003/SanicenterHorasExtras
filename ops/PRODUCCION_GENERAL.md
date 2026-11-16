# Producción general de Horas Extras

Preparación local. No se han cambiado variables remotas, credenciales, usuarios, datos ni reglas; no se ha activado o desplegado producción.

## Modo admitido y alta de usuarios

Se verificó el código anterior: `enabled` ya permitía operación general, mientras `pilot` aplicaba listas de UID. La versión actual admite únicamente `disabled` y `enabled`; `pilot` se rechaza como configuración obsoleta. Las variables `WORKFLOW_ALLOWED_ACTOR_UIDS` y `WORKFLOW_ALLOWED_WORKER_UIDS` ya no se consultan, ni siquiera en el launcher local. Si existen en Netlify, eliminarlas durante la configuración autorizada; no añadir futuros usuarios a ellas.

El endpoint verifica el token Firebase con comprobación de revocación. Cada transacción lee el perfil actual de `users/{uid}` y exige nombre y área no vacíos, rol reconocido, `active: true` y áreas adicionales válidas, si existen. La identidad procede del token, nunca del cuerpo del navegador. Un perfil ausente, inactivo, inválido o sin permisos se rechaza antes de escribir. Una cuenta deshabilitada en Authentication también se rechaza.

Los usuarios futuros necesitan su cuenta Authentication y su documento `users/{mismo UID}`, con `username` coincidente con el login, nombre, área, rol y estado activo. No se crean perfiles automáticamente ni se modifica Netlify para cada alta.

- Trabajador: solicitudes propias; no puede aprobar.
- Jefe: solicitudes propias y revisión separada de sus propias HE/compensaciones; supervisa solo su área principal y las adicionales expresamente autorizadas. JPAREDES conserva únicamente Inventario.
- Administrador: conserva la gestión y revisión ya autorizadas por su rol; no se le agregan funciones personales nuevas.

Saldos, horas completas, reservas, concurrencia, consecutivos, anulaciones, idempotencia, límites y auditoría conservan sus validaciones. Las reglas siguen prohibiendo todas las escrituras del navegador; no se necesitan nuevas reglas ni índices.

## Variables de Netlify

No existen variables nuevas ni listas de usuarios. Usar contexto **Production**, nunca Deploy Previews. La plantilla privada mantiene `WORKFLOW_PRODUCTION_ENABLED=false`; establecer solo `WORKFLOW_WRITE_MODE=enabled` no activa el backend.

| Variable                                         | Valor esperado                                                         | Alcance            |
| ------------------------------------------------ | ---------------------------------------------------------------------- | ------------------ |
| `VITE_REAL_FIREBASE_ENABLED`                     | `true`                                                                 | Build, pública     |
| `VITE_FIREBASE_PROJECT_ID`                       | `sanicenterdb`                                                         | Build, pública     |
| `VITE_FIREBASE_AUTH_DOMAIN`                      | `sanicenterdb.firebaseapp.com`                                         | Build, pública     |
| `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_APP_ID` | Valores públicos existentes de la aplicación web                       | Build, públicas    |
| `VITE_WORKFLOW_API_URL`                          | Vacío: mismo origen `/api/workflow`                                    | Build, pública     |
| `VITE_REAL_FINANCIAL_WRITES_ENABLED`             | `false` hasta autorizar; `true` para operar mediante backend           | Build, pública     |
| `GOOGLE_CLOUD_PROJECT`                           | `sanicenterdb`                                                         | Functions          |
| `APP_ORIGIN`                                     | URL HTTPS final exacta, sin barra final                                | Functions          |
| `WORKFLOW_WRITE_MODE`                            | `enabled` para producción general; `disabled` para detener operaciones | Functions          |
| `WORKFLOW_PRODUCTION_ENABLED`                    | `false` hasta autorizar; `true` para operar                            | Functions          |
| `FIREBASE_SERVICE_ACCOUNT_JSON`                  | JSON privado de reemplazo, de la misma cuenta de servicio              | Functions, secreto |
| `NODE_OPTIONS`                                   | `--experimental-require-module`                                        | Functions          |

No configurar hosts de emuladores, `NETLIFY_DEV` ni `WORKFLOW_LOCAL_REAL_ENABLED` en producción. No poner la clave en variables `VITE_*`, Git, `netlify.toml`, argumentos de consola, informes o capturas. Si el plan no admite scopes separados, impedir que el secreto sea incorporado a los artefactos públicos o registrado durante build. Cambiar variables requiere un nuevo despliegue para aplicarlas; no basta con guardarlas.

## Clave expuesta: sustitución pendiente de autorización

Se conserva `sanicenter-workflow@sanicenterdb.iam.gserviceaccount.com`, sus permisos mínimos y el nombre `FIREBASE_SERVICE_ACCOUNT_JSON`. No se crea otra identidad ni proyecto. El backend valida esa identidad, proyecto, tipo de credencial e ID de clave no vacío.

Antes de operar con datos reales, autorizar estas acciones:

1. Identificar por su **ID público** la clave comprometida y las ubicaciones donde se usó, sin mostrar su contenido. No asumir que otras claves de la cuenta también deban eliminarse.
2. Generar una clave nueva de la misma identidad y guardarla en un archivo nuevo fuera del repositorio, con acceso solo para el propietario Windows y SYSTEM. No sobrescribir archivos ni generar credenciales en el frontend.
3. Sustituir de forma privada `FIREBASE_SERVICE_ACCOUNT_JSON` del sitio existente `sanicenterhorasextras`, contexto Production, manteniendo producción deshabilitada. No usar el JSON como argumento visible de consola ni imprimirlo con `env:list/get`.
4. Comprobar el reemplazo mediante lecturas y una transacción de solo lectura. No registrar HE/CP para probar la clave. Reiniciar procesos o desplegar funciones únicamente si esas acciones también se autorizan.
5. Deshabilitar la clave comprometida por su ID; tras verificar el reemplazo, eliminarla con autorización explícita. No eliminar otras claves, usuarios o la cuenta de servicio como efecto secundario. Retirar de forma autorizada sus copias comprometidas.
6. Solo después, con autorización de activación/publicación, aplicar los indicadores operativos y publicar frontend y funciones juntos. Todos los perfiles activos válidos operarán por rol/área, sin listas de UID.

**No reutilizar la clave expuesta como reversión.** Si falla el reemplazo, mantener el servicio deshabilitado. El bloqueo de la aplicación no impide utilizar una clave robada directamente contra Firebase.

Deshabilitar o eliminar una clave no invalida automáticamente los tokens de corta duración ya emitidos. Si se requiere contención inmediata, hace falta autorización separada para una medida sobre la misma identidad (por ejemplo, deshabilitarla temporalmente), valorando la interrupción. No se ejecutó ninguna de estas medidas. [Respuesta oficial a credenciales comprometidas](https://docs.cloud.google.com/docs/security/compromised-credentials), [administración de claves](https://docs.cloud.google.com/iam/docs/keys-create-delete).

No se consultó el contenido de la clave comprometida ni se utilizó para estas pruebas. Las pruebas emplean mocks o emuladores sin credenciales reales.
