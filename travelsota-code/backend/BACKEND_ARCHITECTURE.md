# Backend Architecture

This backend is organized around product modules and provider adapters.

## Rule Of The Project

Public APIs should expose normalized product flows, not provider-specific APIs.

Example:
- Good: `POST /flights/search`
- Good: `POST /flights/bookings/confirm`
- Avoid: `POST /travelport/search`

Provider-specific code belongs behind the module registry/adapter layer.

## Folder Model

```txt
src/
  shared/                 reusable platform code
    auth/
    cache/
    config/
    errors/
    health/
    http/
    observability/
    response/
    validation/

  modules/
    settings/             provider toggles and credentials
      api/
      application/
        ports/
        services/
      domain/
      infrastructure/

    flights/              flight product module
      api/                controllers and DTOs
      application/        use-cases, registries, mappers, ports
      domain/             normalized flight entities
      infrastructure/     persistence and provider adapters
        providers/
          travelport/

    hotels/               future hotel product module
    cars/                 future car product module
```

## How To Add A New Flight Provider

1. Create `modules/flights/infrastructure/providers/<provider>/`.
2. Implement the flight provider port.
3. Normalize provider responses into `NormalizedFlightSearchResponse`.
4. Register the provider in `FlightsProviderRegistryService`.
5. Add provider config support in `settings`.

## How To Add Hotels Or Cars

Use the same pattern as flights:

```txt
modules/hotels/
  api/
  application/
    ports/
    services/
  domain/
  infrastructure/
    providers/
      travelport/
      provider2/
```

Each product module owns its normalized domain shape. Each provider adapter only translates third-party responses into that shape.

## Why Settings Is Separate

Provider enable/disable flags and credentials are cross-module admin concerns. They live in `modules/settings`, not inside `modules/flights`, so hotels/cars can reuse the same configuration model later.
