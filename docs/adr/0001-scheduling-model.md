# ADR 0001: Where turnaround time belongs

- **Status:** accepted
- **Date:** 2026-10-21

## Context

A salon appointment is not just the time a stylist is cutting hair. A colour
service needs clean-up before the chair is usable again. This project models
that as `buffer_after_minutes`.

The naive implementation adds the buffer to the *candidate* slot when checking
availability:

```ts
const end = start + (service.duration + service.buffer) * 60_000;
if (overlaps(start, end, existingAppointments)) skip();
```

That is wrong, and a unit test caught it. If an existing colour service runs
10:00–10:30 and needs 30 minutes of clean-up, the chair is genuinely
unavailable until 11:00. The naive version treats the existing appointment as
ending at 10:30, so it offers 10:30 as bookable — and the next customer walks
into a chair that is still covered in foils.

## Decision

Turnaround is owed by the appointment that **just happened**, so it belongs on
the busy interval:

```ts
const owesBuffer = (interval.kind ?? "appointment") === "appointment";
const extra = owesBuffer ? interval.bufferAfterMinutes : 0;
const end = Date.parse(interval.endIso) + extra * 60_000;
```

Consequences:

- `Service.bufferAfterMinutes` describes a service's own clean-up, used when
  that service is booked later.
- `BusyInterval.bufferAfterMinutes` describes turnover already owed by an
  existing appointment.
- Closures and breaks (`kind: "blocked"`) owe no turnaround, so their buffer is
  ignored. A lunch break ends at the stated time, full stop.

The database mirrors this: `appointments.occupied_range` is a generated
`tstzrange(starts_at, ends_at + buffer_minutes)`, and the exclusion constraint
operates on that range. Application code and the constraint therefore agree on
what "occupied" means.

## Alternatives considered

**Add the buffer on both sides.** Simple, and would produce valid output, but it
reserves clean-up twice and silently loses slots at the end of the day. It also
conflates two different concepts: the clean-up *this* booking will need, and the
clean-up it must wait for.

**Model cleaning as a separate bookable service.** Honest, but it leaks an
internal operational concern into the customer-facing catalogue.

**Let the stylist be double-booked and resolve manually.** Rejected: the whole
premise is that the software refuses to do that.

## Verification

`src/lib/scheduling/slots.test.ts` covers the regression directly:
`honours the turnaround time owed by the existing appointment` asserts that
10:30 is not offered after a 10:00 booking with a 30-minute buffer, and
`does not add turnaround time to an all-day closure` asserts that a blocked
interval with a buffer still frees 10:30.
