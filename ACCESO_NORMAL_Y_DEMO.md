# Inicio normal y demo: Sani Center

El login normal vuelve a estar habilitado de forma explícita, sin activar operaciones financieras reales. JBERNALES conserva su cuenta, contraseña, perfil, rol trabajador y área Inventario. No se modificó Firebase real.

## Modo normal: cuenta real

```powershell
npm.cmd run dev
```

Abrir **http://localhost:8081**. Se utiliza localhost, que ya figuraba entre los dominios autorizados en la auditoría, sin modificar Firebase Console. Si había un servidor anterior de desarrollo abierto, detenerlo con Ctrl+C en su terminal antes de ejecutar este comando. Utilizar la dirección nueva, no una pestaña antigua en el puerto 8080.

El comando valida que la configuración pública existente seleccione sanicenterdb y tenga los campos necesarios; habilita Authentication real únicamente en ese proceso. No modifica .env.local ni habilita producción en builds de publicación. No necesita secretos administrativos. El correo técnico de JBERNALES continúa siendo el existente; la contraseña solo la ingresa el usuario en su navegador.

Con credenciales válidas y el perfil activo se espera el mensaje de bienvenida y la pantalla Mis horas extras. Se muestra una franja «Firebase real · Operaciones financieras bloqueadas hasta su activación». El Dashboard y los controles por rol se conservan; JBERNALES no adquiere permisos de jefe/admin.

Todas las acciones financieras de store.ts quedan bloqueadas antes de solicitar tokens o enviar HTTP: registro de horas, compensaciones, revisiones, anulaciones, cancelaciones y confirmación de descanso. No se hacen llamadas para avanzar contadores. Además, el servidor de desarrollo rechaza /api/workflow con HTTP 503 y no reenvía tokens al backend demo. El comando no inicia el backend financiero real; fuerza sus indicadores de activación a false/disabled en el proceso hijo.

Las reglas publicadas actuales pueden negar lecturas de compensaciones, calendario o listados de personal. Si ocurre, aparece un aviso de permisos de lectura separado del login. No publicar reglas ni activar escrituras para ocultar ese aviso. Los módulos sin autorización de lectura no deben considerarse una fuente completa de saldo. La cuenta permanece autenticada si su perfil propio es legible y válido.

## Modo demo: usuarios ficticios

```powershell
npm.cmd run local
```

Abrir **http://127.0.0.1:8080**. `npm.cmd run local:demo` sigue disponible como equivalente. Inicia Auth Emulator (9099), Firestore Emulator (8085), backend demo (8788) y React; proyecto fijo demo-sanicenter. No hereda la identidad administrativa real. Si falta un emulador, se bloquea sin cambiar a Firebase real.

Utilizar ANA, LUIS, MARIA, JEFE, JEFEVENTAS, JEFEMULTI, ADMIN o INACTIVO, según el caso. Contraseña exclusivamente ficticia: SaniDemo2026!. JBERNALES no es una cuenta demo. Los puertos diferentes separan también almacenamiento y sesión del navegador.

## Mensajes y diagnóstico

- Configuración: proyecto/clave pública/aplicación faltante o acceso real deshabilitado.
- Conexión: fallo de red o emuladores no disponibles.
- Credenciales: usuario o contraseña rechazados por Authentication.
- Perfil/permisos: lectura Firestore denegada o perfil inválido; no se presenta automáticamente como contraseña incorrecta.

La consola registra solo `login_failed` y el código de diagnóstico, nunca el objeto completo de error, contraseña, tokens ni customData. No se probó la contraseña real de JBERNALES: las pruebas del login usan respuestas simuladas y los flujos completos de demo usan emuladores. La configuración efectiva normal se verificó en navegador con todas las conexiones externas bloqueadas.

## Netlify

Se conservan netlify.toml, SSR y la función workflow. Builds normales mantienen el acceso real cerrado si no se configura expresamente. Para una futura activación financiera de producción se requiere, además del backend/piloto autorizado, VITE_REAL_FINANCIAL_WRITES_ENABLED=true en el build autorizado. El desarrollo normal impide escrituras incluso si ese indicador se activara por error. No establecerlo todavía. La guía NETLIFY_FIREBASE.md sigue aplicándose para respaldo, IAM, reglas y publicación.
