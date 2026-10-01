import { listConnections } from "@/lib/connections";
import { isOwner } from "@/lib/owner";

import { revokeAction } from "./actions";
import { PasswordForm, TokenForm } from "./forms";

export const dynamic = "force-dynamic";

const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "never";

function Nav() {
  return (
    <nav className="nav" aria-label="Main">
      <a className="wordmark" href="/">
        SimpleFIN MCP
      </a>
    </nav>
  );
}

export default async function SetupPage() {
  if (!(await isOwner())) {
    return (
      <main className="setup sky">
        <Nav />
        <section className="card">
          <h1>Owner setup</h1>
          <p>
            Enter the <code>OWNER_PASSWORD</code> you set on this deployment.
          </p>
          <PasswordForm />
        </section>
      </main>
    );
  }

  const connections = await listConnections();

  return (
    <main className="setup sky">
      <Nav />
      <section className="card">
        <h1>Connect an account</h1>
        <p>
          Create a setup token in{" "}
          <a href="https://beta-bridge.simplefin.org/">SimpleFIN Bridge</a> and
          paste it here. Each token works once.
        </p>
        <TokenForm />
      </section>

      <section className="card" aria-labelledby="connections">
        <h2 id="connections">Connector URLs</h2>
        {connections.length === 0 ? (
          <p>None yet. Connect an account above.</p>
        ) : (
          <ul className="connections">
            {connections.map((c) => (
              <li key={c.keyHash}>
                <span>
                  {c.label ?? "SimpleFIN connection"}
                  <small>
                    Created {day(c.createdAt)}, last used {day(c.lastUsedAt)}
                  </small>
                </span>
                <form action={revokeAction}>
                  <input type="hidden" name="keyHash" value={c.keyHash} />
                  <button className="link-button">Revoke</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
