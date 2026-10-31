import { pretty } from "./trace";

export const StatusBadge = ({ status }: { status: string }) => (
  <span className={`badge ${status}`}>
    <span className="status-dot" />
    {pretty(status)}
  </span>
);
export const Json = ({ value }: { value: unknown }) => (
  <pre>{JSON.stringify(value, null, 2)}</pre>
);
