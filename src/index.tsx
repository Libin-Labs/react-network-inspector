import { useId, type CSSProperties, type ReactNode } from 'react';

export type HeaderMap = Readonly<Record<string, string>>;

export interface RequestTiming {
  name: string;
  duration: number;
}

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  startedAt: number;
  duration?: number;
  status?: number;
  requestHeaders?: HeaderMap;
  responseHeaders?: HeaderMap;
  requestBody?: unknown;
  responseBody?: unknown;
  timings?: readonly RequestTiming[];
  error?: string;
}

export interface WaterfallItem {
  id: string;
  offset: number;
  duration: number;
  left: number;
  width: number;
}

export const DEFAULT_REDACTED_HEADERS: readonly string[] = Object.freeze([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
]);

export function redactHeaders(
  headers: HeaderMap = {},
  additionalNames: readonly string[] = [],
): Record<string, string> {
  const names = new Set(
    [...DEFAULT_REDACTED_HEADERS, ...additionalNames].map((name) => name.toLowerCase()),
  );
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      names.has(name.toLowerCase()) ? '[REDACTED]' : value,
    ]),
  );
}

export function formatPayload(payload: unknown, maxLength = 10000): string {
  const limit = Number.isFinite(maxLength) ? Math.max(0, Math.floor(maxLength)) : 10000;
  let text: string;
  try {
    text = typeof payload === 'string' ? payload : (JSON.stringify(payload, null, 2) ?? '');
  } catch {
    text = '[Unserializable payload]';
  }
  return text.length > limit ? `${text.slice(0, limit)}\n[Truncated]` : text;
}

export function filterRequests(
  requests: readonly NetworkRequest[],
  query: string,
): NetworkRequest[] {
  const needle = query.trim().toLowerCase();
  return requests.filter((request) =>
    `${request.method} ${request.url} ${request.status ?? 'pending'} ${request.error ?? ''}`
      .toLowerCase()
      .includes(needle),
  );
}

const nonnegative = (value: number | undefined): number =>
  value !== undefined && Number.isFinite(value) ? Math.max(0, value) : 0;

export function buildWaterfall(requests: readonly NetworkRequest[]): WaterfallItem[] {
  if (!requests.length) return [];
  const starts = requests.map((request) =>
    Number.isFinite(request.startedAt) ? request.startedAt : 0,
  );
  const origin = Math.min(...starts);
  const span = Math.max(
    1,
    ...requests.map(
      (request, index) => (starts[index] ?? origin) - origin + nonnegative(request.duration),
    ),
  );
  return requests.map((request, index) => {
    const offset = (starts[index] ?? origin) - origin;
    const duration = nonnegative(request.duration);
    return {
      id: request.id,
      offset,
      duration,
      left: (offset / span) * 100,
      width: (duration / span) * 100,
    };
  });
}

export interface NetworkInspectorProps {
  requests: readonly NetworkRequest[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
  redactHeaderNames?: readonly string[];
  maxPayloadLength?: number;
  renderPayload?: (payload: unknown, kind: 'request' | 'response') => ReactNode;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

export function NetworkInspector({
  requests,
  selectedId = null,
  onSelect,
  query = '',
  onQueryChange,
  redactHeaderNames = [],
  maxPayloadLength = 10000,
  renderPayload,
  className = '',
  style,
  ariaLabel = 'Network inspector',
}: NetworkInspectorProps) {
  const searchId = useId();
  const visible = filterRequests(requests, query);
  const waterfall = buildWaterfall(visible);
  const selected = requests.find((request) => request.id === selectedId);
  const headers = (title: string, values: HeaderMap | undefined) => (
    <section>
      <h4>{title}</h4>
      <dl className="lp-network-headers">
        {Object.entries(redactHeaders(values, redactHeaderNames)).map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {!Object.keys(values ?? {}).length && <p>No headers supplied.</p>}
    </section>
  );
  return (
    <section className={`lp-network ${className}`} style={style} aria-label={ariaLabel}>
      <label htmlFor={searchId}>Filter requests</label>
      <input
        id={searchId}
        value={query}
        readOnly={!onQueryChange}
        onChange={(event) => onQueryChange?.(event.target.value)}
      />
      <p role="status">{visible.length} requests</p>
      <div className="lp-network-scroll">
        <table>
          <caption>Supplied requests and relative timing</caption>
          <thead>
            <tr>
              <th>Request</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Waterfall</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((request, index) => {
              const timing = waterfall[index];
              return (
                <tr key={request.id} data-selected={request.id === selectedId}>
                  <td>
                    <button
                      type="button"
                      aria-pressed={request.id === selectedId}
                      disabled={!onSelect}
                      onClick={() => onSelect?.(request.id)}
                    >
                      {request.method} {request.url}
                    </button>
                  </td>
                  <td>{request.error ? 'Error' : (request.status ?? 'Pending')}</td>
                  <td>
                    {request.duration === undefined
                      ? 'Pending'
                      : `${nonnegative(request.duration)} ms`}
                  </td>
                  <td>
                    <div
                      className="lp-network-track"
                      aria-label={`Offset ${timing?.offset ?? 0} ms`}
                    >
                      <span
                        style={{
                          marginLeft: `${timing?.left ?? 0}%`,
                          width: `${timing?.width ?? 0}%`,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!visible.length && <p>No matching requests.</p>}
      {selected ? (
        <article className="lp-network-detail" aria-label="Request details">
          <h3>
            {selected.method} {selected.url}
          </h3>
          {selected.error && <p role="alert">{selected.error}</p>}
          {headers('Request headers', selected.requestHeaders)}
          {headers('Response headers', selected.responseHeaders)}
          <h4>Timing phases</h4>
          <ul>
            {selected.timings?.map((timing, index) => (
              <li key={index}>
                {timing.name}: {nonnegative(timing.duration)} ms
              </li>
            ))}
          </ul>
          {(['request', 'response'] as const).map((kind) => {
            const payload = kind === 'request' ? selected.requestBody : selected.responseBody;
            return (
              <section key={kind}>
                <h4>{kind === 'request' ? 'Request payload' : 'Response payload'}</h4>
                {renderPayload ? (
                  renderPayload(payload, kind)
                ) : (
                  <pre>{formatPayload(payload, maxPayloadLength) || '(empty)'}</pre>
                )}
              </section>
            );
          })}
        </article>
      ) : (
        <p>Select a request for details.</p>
      )}
    </section>
  );
}
