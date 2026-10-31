# @lp-labs/react-network-inspector

A controlled request list, relative timing waterfall, headers and payload detail
view for React 18 or 19. Supply your own request records. This package never
patches fetch, XMLHttpRequest, browser globals or application networking.
It has no runtime dependencies; React is its only peer.

## Installation

```sh
npm install @lp-labs/react-network-inspector react
```

```tsx
import { useState } from "react";
import {
  NetworkInspector,
  type NetworkRequest,
} from "@lp-labs/react-network-inspector";
import "@lp-labs/react-network-inspector/styles.css";

const requests: NetworkRequest[] = [{
  id: "request-1",
  method: "POST",
  url: "/api/orders",
  startedAt: 100,
  duration: 85,
  status: 201,
  requestHeaders: { Authorization: "Bearer hidden", "Content-Type": "application/json" },
  responseHeaders: { "Content-Type": "application/json" },
  requestBody: { product: "book" },
  responseBody: { orderId: 42 },
  timings: [{ name: "Waiting", duration: 70 }, { name: "Download", duration: 15 }],
}];

export function Requests() {
  const [selectedId, onSelect] = useState<string | null>(null);
  const [query, onQueryChange] = useState("");
  return (
    <NetworkInspector
      requests={requests}
      selectedId={selectedId}
      onSelect={onSelect}
      query={query}
      onQueryChange={onQueryChange}
      redactHeaderNames={["x-internal-token"]}
    />
  );
}
```

Named ESM and CommonJS exports are equivalent. For CommonJS, use
`const { NetworkInspector } = require("@lp-labs/react-network-inspector")`.
Load the stylesheet through your application's CSS-aware bundler, not Node.
There is no default export. No DOM access occurs during module import.

## NetworkInspector props

`NetworkInspectorProps` is the exported props interface. Selection and filtering
are controlled: callbacks request changes, and the parent supplies the next props.

| Prop | Type | Default / behavior |
| --- | --- | --- |
| `requests` | `readonly NetworkRequest[]` | Required; caller order, unique stable IDs |
| `selectedId` | `string \| null` | `null`; missing IDs show selection prompt |
| `onSelect` | `(id: string) => void` | Absent; selection buttons disabled |
| `query` | `string` | `""` |
| `onQueryChange` | `(query: string) => void` | Absent; filter is read-only |
| `redactHeaderNames` | `readonly string[]` | `[]`; extends built-in sensitive names |
| `maxPayloadLength` | `number` | `10000`; per displayed payload, character count |
| `renderPayload` | `(payload: unknown, kind: "request" \| "response") => ReactNode` | Absent; escaped, formatted text |
| `className` | `string` | `""`; appended to `lp-network` |
| `style` | `CSSProperties` | Absent; applied to outer section |
| `ariaLabel` | `string` | `"Network inspector"` |

`renderPayload` receives the original unredacted payload, bypasses the default
formatter and its length limit, and is responsible for safe rendering and cost.
Consumer render callbacks are not caught; use your application's error boundary.
Request `error` text is shown as an alert, not thrown. There are no package-specific
error classes.

## Data types

- `HeaderMap`: `Readonly<Record<string, string>>`; normalized header values supplied
  by your application. Combine repeated values yourself.
- `RequestTiming`: `{ name: string; duration: number }`; duration in milliseconds.
  These named phases are displayed as supplied, not inferred or reconciled.
- `NetworkRequest`: required `id`, `url`, `method` strings and `startedAt` number.
  Optional `duration` (ms), `status` (HTTP code), `requestHeaders` and
  `responseHeaders` (`HeaderMap`), `requestBody` and `responseBody` (`unknown`),
  `timings` (`readonly RequestTiming[]`) and `error` (`string`). Use a consistent
  millisecond clock for all `startedAt` values. Omitted duration/status means pending.
- `WaterfallItem`: `{ id, offset, duration, left, width }`; `id` is a string;
  other fields are numbers. Offset and duration are ms; left and width are percentages.
- `NetworkInspectorProps`: all component props in the table above.

## Pure helpers and constant

All helper inputs are left unmodified.

### DEFAULT_REDACTED_HEADERS

Frozen `readonly string[]`: `authorization`, `proxy-authorization`, `cookie`,
`set-cookie`, `x-api-key`. These names always remain redacted.

### redactHeaders(headers = {}, additionalNames = [])

Accepts `HeaderMap` and optional `readonly string[]`. Returns a new
`Record<string, string>` with matching values replaced by `"[REDACTED]"`.
Matching is case-insensitive; original key spelling and other values are preserved.
Additional names extend, never replace, the defaults.

### formatPayload(payload, maxLength = 10000)

Accepts `unknown`, returns `string`. Strings display verbatim; other values use
indented JSON. `undefined` returns `""`. Circular objects, bigint and JSON
serialization failures return `"[Unserializable payload]"`; no exception escapes
from serialization. Nonfinite limits fall back to 10000; finite limits are floored
and clamped to at least zero. Overflow appends `"\n[Truncated]"` after the retained
characters; the marker is not part of the limit.

### filterRequests(requests, query)

Accepts `readonly NetworkRequest[]` and `string`, returns a new
`NetworkRequest[]` containing original records in original order. Trimmed,
case-insensitive substring matching searches method, URL, status (or `"pending"`)
and error text. An empty query matches everything.

### buildWaterfall(requests)

Accepts `readonly NetworkRequest[]`, returns `WaterfallItem[]` in input order.
The earliest start is the origin and the latest end defines the shared span
(at least 1 ms). Invalid start times become zero; missing, negative and nonfinite
durations become zero. Pending records have zero-width bars. The UI gives every
bar a minimum visible width of two CSS pixels; helper widths remain mathematically
zero. An empty array returns `[]`.

```ts
import {
  DEFAULT_REDACTED_HEADERS, redactHeaders, formatPayload,
  filterRequests, buildWaterfall, type WaterfallItem,
} from "@lp-labs/react-network-inspector";

const headers = redactHeaders({ Authorization: "secret", Accept: "json" });
const text = formatPayload({ accepted: true }, 200);
const matches = filterRequests(requests, "201");
const bars: WaterfallItem[] = buildWaterfall(matches);
console.log(DEFAULT_REDACTED_HEADERS, headers, text, bars);
```

## Customization and accessibility

Override `--lp-network-accent` and `--lp-network-border` on `.lp-network`,
or pass `className` / `style`. Use `renderPayload` for a domain-specific summary:

```tsx
<NetworkInspector
  requests={requests}
  selectedId="request-1"
  style={{ borderRadius: 0 }}
  renderPayload={(payload, kind) => <pre>{kind}: {String(payload)}</pre>}
/>
```

Native labeled input, table caption, buttons with `aria-pressed`, live result
count, alert errors and visible focus outlines support keyboard and screen-reader
use. Data is text, never injected HTML. Custom rendering must preserve these
properties. The overflow container allows horizontal scrolling on small screens.

## Performance and real limits

No interception, storage, request execution, HAR import, byte accounting, streaming,
or phase measurement is provided. Parent records remain the source of truth.
Filtering is linear; all matching rows render without virtualization. Keep supplied
records bounded for large sessions. Formatting serializes a complete payload before
truncation, so the character limit is not a memory/security boundary. Supply already
bounded plain data rather than large objects, proxies or throwing getters.

Header redaction is display-only, not data removal. URLs, query strings, error
messages, bodies and custom output are NOT redacted; sanitize sensitive data
before supplying it. Timing bars are relative to the filtered set and durations
are supplied estimates. This is not a browser developer-tools replacement.

## License

[MIT](./LICENSE).

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
