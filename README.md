# Sani Center Horas Extras

Sistema de gestión, control de horas extras y solicitud de descansos compensatorios para **Sani Center**.

Construido con React, TypeScript, TanStack Start, Vite y Tailwind CSS.

## Arquitectura y Reglas del Sistema

- **Acceso a datos centralizado:** Todo el acceso a datos y mutaciones se canaliza a través de `src/services/store.ts`. En la fase de producción, este archivo se reemplazará por la integración con Cloud Firestore sin requerir modificaciones en las rutas ni componentes.
- **Reglas contables puras:** Todas las reglas de saldo, validación de asignaciones y anulaciones residen en `src/services/ledger.ts`. Las duraciones se manejan en minutos enteros.
- **Saldos:**
  - _Saldo histórico:_ Total de horas extras válidas acumuladas menos compensaciones aprobadas a lo largo de todo el historial.
  - _Horas reservadas:_ Minutos comprometidos en compensaciones pendientes.
  - _Saldo disponible:_ Saldo histórico menos horas reservadas.
  - _Movimientos mensuales:_ Horas extras y compensaciones correspondientes exclusivamente al mes seleccionado.
- **Compensaciones:** Permite selección manual de múltiples registros de horas extras de origen para respaldar un descanso compensatorio, con asignaciones parciales y control estricto de disponibilidad.

## Preparación para Firebase

En la siguiente etapa se conectará con:

- **Firebase Authentication:** Autenticación mediante correo electrónico y contraseña. Cuentas creadas por el Administrador.
- **Cloud Firestore:** Colecciones `/users`, `/overtime`, `/compensations` con transacciones atómicas (`runTransaction`) para prevenir condiciones de carrera y validación segura en backend.

## Desarrollo Local

```sh
npm install
npm run dev
npm test
npm run build
```
