# Usuarios reales: cierre de activación

Las cuatro operaciones expresamente autorizadas en `sanicenterdb` se completaron y verificaron. No se crearon ni eliminaron cuentas ni se cambiaron contraseñas. Las escrituras financieras continúan deshabilitadas y no se ha desplegado Netlify.

| Usuario oficial | Resultado                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| JPAREDES        | Authentication habilitado; perfil activo y UID coincidente; Jamil Paredes, jefe, Inventario; sin áreas adicionales.                             |
| JVASQUEZ        | Authentication habilitado; perfil activo y UID coincidente; trabajador, Inventario.                                                             |
| JBERNALES       | Authentication habilitado; perfil activo y UID coincidente; trabajador, Inventario. Intacto.                                                    |
| ROCOVARRUBIAS   | Correo técnico corregido a `rocovarrubias@auth.sanicenter.invalid`. UID, contraseña, estado y perfil conservados; trabajador de Inventario.     |
| RMIJAHUANCA     | Authentication habilitado; perfil activo y UID coincidente; trabajador. Nombre y área conservados.                                              |
| RVISURRAGA      | Authentication habilitado; perfil activo y UID coincidente; trabajador. Nombre y área conservados.                                              |
| FCUADROS        | Authentication habilitado y UID coincidente. Agregado el campo obligatorio `role: "admin"`; los demás campos del perfil permanecieron intactos. |

RCOVARRUBIAS no se encontró entre los perfiles ni las cuentas de Authentication consultadas por usuario/correo técnico. No hay UID que vincular; no se creó ni se eliminó nada. La cuenta existente con el apellido similar es la de Roy descrita arriba. No incorporar RCOVARRUBIAS a ninguna configuración operativa.

## Operaciones completadas: no repetir

1. Authentication de ROCOVARRUBIAS: se comprobó que el destino estaba libre y se corrigió exclusivamente el correo de `rocovarruvias@auth.sanicenter.invalid` a `rocovarrubias@auth.sanicenter.invalid`. Se verificó que UID, contraseña, estado y perfil permanecieran intactos.
2. Perfil existente de FCUADROS: se agregó exclusivamente `role` de tipo string con valor `admin`, con precondición sobre la versión del documento. No se reemplazó el documento ni se modificaron otros campos, incluido el antiguo `rol`.
3. Se publicó exclusivamente el contenido local de `firestore.rules` y se verificó su coincidencia exacta con la versión publicada. Restringe solicitudes, perfiles, auditoría y calendario del jefe a sus áreas autorizadas; mantiene todas las escrituras del navegador denegadas. El backend también valida el área del trabajador y la del registro en cada operación. No se modificaron índices.
4. Se creó `counters/compensations` con `lastNumber` entero `0` en una transacción que confirmó la ausencia del contador y de compensaciones. HE permaneció sin cambios. No reinicializar ningún contador.

JBERNALES y JPAREDES permanecieron intactos. Se conservó el respaldo cifrado existente y se comprobó su hash antes de operar. No publicar índices vacíos ni activar escrituras financieras como efecto secundario. No editar las reglas para aceptar `rol` como alias: el esquema válido utiliza `role`.

## Publicación manual

Las variables privadas del servidor, dominio HTTPS, permisos IAM y comandos están en [PUBLICACION_FINAL.md](PUBLICACION_FINAL.md). Mantener el backend y los indicadores financieros deshabilitados hasta configurar credenciales y reglas. Netlify debe incluir las funciones `workflow` y `server`; no publicar únicamente `dist`. No se ha desplegado ni habilitado facturación.
