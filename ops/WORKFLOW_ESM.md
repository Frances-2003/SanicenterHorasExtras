# Carga de workflow en Netlify / Node 24

La cadena `firebase-admin/auth -> jwks-rsa@4.1.0 -> jose@6` mezcla CommonJS
(`require('jose')`) con un paquete exclusivamente ESM. Lambda puede deshabilitar
`require(esm)` incluso en Node 24. La opción `NODE_OPTIONS` no resolvió el fallo
en el sitio publicado.

Netlify Functions V2 utiliza NFT para trazar y copiar dependencias, aunque se
configure `node_bundler = "esbuild"`. Por eso la compilación previa de
`scripts/build-netlify.mjs` incluye Firebase Admin/Auth, jwks-rsa y jose en un
bundle ESM. Esbuild transforma la frontera entre módulos antes del trazado de
Netlify. Solo los paquetes Firestore quedan externos, con sus recursos de
gRPC/protobuf. Una importación estática permite a NFT incluir también esos
paquetes externos. El adaptador CommonJS de Netlify conserva `require`, `__filename`
y `__dirname` para los módulos que los necesitan. No se modifica node_modules,
no se reemplaza el verificador de tokens y no se cambian versiones del SDK.

El build verifica el ZIP definitivo con `scripts/check-workflow-package.mjs`:
lo extrae fuera del repositorio, importa la entrada Lambda y workflow en un
proceso aislado con `--no-experimental-require-module` y
`--no-experimental-detect-module`, sin `NODE_OPTIONS`, credenciales ni red.
Comprueba respuestas 503 para GET/POST en producción y deploy previews con el
backend deshabilitado. Un fallo de importación impide completar el build.
`fflate` es una dependencia solo de desarrollo para extraer ese ZIP.

```powershell
npm.cmd run build
npm.cmd run test:workflow-package
```

Para repetir la comprobación con otro ejecutable Node 24:

```powershell
$env:WORKFLOW_TEST_NODE = 'C:\ruta\node.exe'
npm.cmd run test:workflow-package
Remove-Item Env:WORKFLOW_TEST_NODE
```

Esta corrección es local. Publicar requiere autorización separada. No es
necesario activar operaciones financieras para comprobar la carga del módulo.

Referencias: [esbuild: paquetes externos](https://esbuild.github.io/api/#packages),
[incidencia de Firebase Admin](https://github.com/firebase/firebase-admin-node/issues/3181),
[Lambda: características de Node](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html).
