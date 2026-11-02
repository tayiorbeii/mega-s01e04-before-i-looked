import type { NightDigest } from '../digest/types.js';

export function DigestPage({ night, digest }: { night: string; digest: NightDigest }) {
  if (digest.rows.length === 0) {
    return (
      <>
        <h1>digest</h1>
        <p class="mute">
          {night} · nothing ran
          {digest.badLines > 0 && ` · bad lines ${digest.badLines}`}
        </p>
      </>
    );
  }

  const rowsWithClass = digest.rows.map((row) => ({
    row,
    className: row.retries >= 3 || row.lastStatus === 'fail' ? 'warn' : '',
  }));

  return (
    <>
      <h1>digest</h1>
      <p class="mute">
        {night} · ok {digest.counts.ok} · retry {digest.counts.retry} · fail {digest.counts.fail}
        {digest.badLines > 0 && ` · bad lines ${digest.badLines}`}
      </p>
      <table>
        <thead>
          <tr>
            <th>job</th>
            <th>owner</th>
            <th>runs</th>
            <th>retries</th>
            <th>last status</th>
            <th>last error</th>
            <th>first at</th>
            <th>last at</th>
          </tr>
        </thead>
        <tbody>
          {rowsWithClass.map(({ row, className }) => (
            <tr class={className}>
              <td>{row.job}</td>
              <td>{row.owner ?? '—'}</td>
              <td>{row.runs}</td>
              <td>{row.retries}</td>
              <td>{row.lastStatus}</td>
              <td>{row.lastError ?? '—'}</td>
              <td>{row.firstAt}</td>
              <td>{row.lastAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
