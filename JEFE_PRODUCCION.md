# Cuenta independiente del jefe

JPAREDES ya fue creado manualmente por el propietario y verificado mediante lectura: nombre Jamil Paredes, rol `jefe`, área `Inventario`, `active: true`, UID coincidente entre Authentication y Firestore. No tiene áreas adicionales configuradas. No crear otra cuenta ni otro perfil ni cambiar su contraseña. Su ámbito autorizado es exclusivamente Inventario.

El contenido siguiente se conserva como referencia del esquema, no como una instrucción para crear o modificar la cuenta existente.

Después de una única autorización que identifique esos datos, crear una cuenta independiente en Authentication, con contraseña propia entregada por un canal privado. El login existente convierte el usuario a mayúsculas para comprobar el perfil y utiliza el correo técnico `<usuario-en-minúsculas>@auth.sanicenter.invalid`. No utilizar el correo técnico de JBERNALES. Este dominio técnico no recibe correos de recuperación; conservar el procedimiento administrativo seguro de recuperación de contraseña.

Verificar previamente que no exista el usuario ni su correo técnico. Si existe, detenerse: no sobrescribirlo ni cambiar su contraseña. Crear el perfil con el UID devuelto por Authentication usando una operación **create**, nunca set/merge sobre un perfil existente:

```typescript
// Esquema; los identificadores entre corchetes deben reemplazarse por datos autorizados.
users/[UID_NUEVO_JEFE] = {
  id: "[UID_NUEVO_JEFE]",
  username: "[USUARIO_REAL_EN_MAYUSCULAS]",
  name: "[NOMBRE_REAL]",
  role: "jefe",
  area: "[AREA_PRINCIPAL_AUTORIZADA]",
  authorizedAreas: [/* únicamente otras áreas explícitamente autorizadas */],
  active: true
}
```

El área principal también concede acceso. Si solo administra Inventario, usar `area: "Inventario"` y `authorizedAreas: []`. No asignar `admin`. No cambiar ningún campo ni credencial de JBERNALES.

Authentication y Firestore no comparten una transacción: si la cuenta se crea pero falla la creación del perfil, detener la activación y registrar su UID; no recrear, borrar ni reparar otra cuenta automáticamente. Sin perfil activo, esa cuenta no obtiene acceso financiero.

Por autorización expresa del propietario, el jefe puede registrar solicitudes personales pendientes y aprobarlas o rechazarlas en una operación separada. El backend comprueba rol y áreas en cada transacción: esta excepción no permite autoaprobación a trabajadores ni amplía las áreas de JPAREDES. La auditoría conserva `actorId`, `workerId` y `selfReview` en las revisiones propias. Las reglas siguen negando escrituras directas desde el navegador incluso a jefes y administradores. No se modifican perfiles, custom claims ni el login.
