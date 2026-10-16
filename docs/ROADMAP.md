# Hoja de ruta: cobro, verificación de identidad y cancelaciones

Decisión guardada el 2026-10-16. Es el orden acordado para cuando toque implementarlo; cada punto es un paso independiente y se puede entregar por separado.

## El problema que resuelve

Hoy la cuenta del cliente es solo un número de teléfono. Si cancela con la grúa cerca, la app registra un cargo de Q50 pero nadie lo cobra, y si desinstala y vuelve con otro chip, la deuda desaparece. Un número de teléfono se cambia en cinco minutos; un DPI no.

## Orden de implementación

1. **Que el cargo exista de verdad, no solo en texto.**
   Guardar un **saldo pendiente** en la cuenta (`User.balanceDueQ`) cuando se aplica un cargo de cancelación, y **bloquear nuevos servicios** hasta pagarlo: en efectivo al siguiente gruero, por transferencia o con tarjeta. La API debe rechazar `POST /api/requests` con un código claro (`BALANCE_DUE`) y la app mostrar cuánto debe y cómo pagarlo.

2. **Pedir la verificación justo antes del primer servicio de grúa, no al instalar.**
   Instalar, registrarse y ver precios debe ser libre (si no, la gente no entra). En el momento en que una grúa va a salir a buscarlo, ahí sí: **DPI + rostro** (KYC) **o tarjeta registrada**. Es exactamente el punto donde nace el riesgo. Los socios que ya pagaron su membresía pasan sin fricción.

3. **Si tiene tarjeta, se cobra solo; si no, la deuda queda atada al DPI.**
   Con tarjeta registrada (tokenizada en el procesador de pagos, nunca en nuestra base), el cargo de cancelación se cobra automáticamente. Sin tarjeta, la deuda queda ligada a la identidad verificada: guardamos solo un **hash del número de DPI** para detectar reinscripciones con otro teléfono, **nunca la foto del documento** (se queda en el proveedor de KYC). Así nadie puede "nacer de nuevo" con otro número.

4. **Reducir las cancelaciones de raíz, como Uber.**
   - **2 minutos gratis** después de asignar la grúa; después aplica el cargo.
   - El cargo se muestra claro **antes** de confirmar: "Al pedir aceptas Q50 si cancelas con la grúa en camino".
   - **El cargo se lo lleva el gruero**: compensa su tiempo y lo motiva a seguir aceptando.

5. **A los grueros, verificación obligatoria desde el día 1.**
   DPI + rostro + licencia + papeles del vehículo. Un gruero no puede ponerse "Disponible" sin estar verificado. Esto no cambia.

## Diseño técnico previsto

- Modelo `IdentityVerification { subjectType (USER|PROVIDER), subjectId, provider, externalId, status (PENDING|VERIFIED|REJECTED|MANUAL_REVIEW), documentHash, resultJson }` y `identityStatus` en `User` y `Provider`.
- `POST /api/identity/start` abre la sesión con el proveedor de KYC; `POST /api/webhooks/identity/<proveedor>` recibe el resultado con **firma HMAC verificada** e **idempotencia** por `externalId`.
- Regla configurable: `IDENTITY_REQUIRED_FOR_TOW=true` (clientes, antes del primer servicio de grúa) e `IDENTITY_REQUIRED_FOR_PROVIDERS=true`.
- Modo desarrollo con proveedor simulado para probar el flujo completo sin cuenta ni costo.
- Pagos: tarjeta tokenizada (Recurrente u otro procesador con presencia en Guatemala) para cobrar cargos y la cuota mensual.

## Pendiente de decidir

- **Proveedor de KYC** que maneja el contacto del usuario. Si no hay uno, la propuesta es **Metamap** (cobertura del DPI de Guatemala y presencia en Centroamérica); alternativas: Veriff, Sumsub, Truora, Incode.
- **Procesador de pagos** para la tarjeta registrada.
- Si el registro inicial lleva **código por WhatsApp/SMS** (Twilio Verify o WhatsApp Cloud API) además del KYC.
