import { AskBar } from "./_components/AskBar";

const REPO = "https://github.com/duckling1169/simplefin-mcp";
const DEPLOY =
  "https://vercel.com/new/clone?repository-url=" +
  encodeURIComponent(REPO) +
  "&env=OWNER_PASSWORD&envDescription=" +
  encodeURIComponent("Any long password. It unlocks /setup.");

export default function Home() {
  return (
    <main>
      <section className="hero sky">
        <nav className="nav" aria-label="Main">
          <span className="wordmark">SimpleFIN MCP</span>
          <span className="nav-links">
            <a href={REPO}>GitHub</a>
            <a className="button" href="/setup">
              Set up
            </a>
          </span>
        </nav>

        <h1>Connect your finances to your agents</h1>
        <p className="lede">
          Your bank accounts, available to Claude, ChatGPT and any MCP client.
          Read-only, and hosted by you.
        </p>
        <AskBar />
      </section>

      <section className="steps-section on-horizon" aria-labelledby="setup">
        <div className="steps-inner">
          <h2 id="setup">Set it up</h2>
          <p>About five minutes. You need a Vercel account.</p>
          <ol className="steps">
            <li>
              <div>
                <h3>Deploy your own copy</h3>
                <p>
                  Choose an <code>OWNER_PASSWORD</code> and add a Neon Postgres
                  database from the Vercel Marketplace. The tables are created
                  on first use.
                </p>
              </div>
              <a className="button dark" href={DEPLOY}>
                Deploy to Vercel
              </a>
            </li>
            <li>
              <div>
                <h3>Get a SimpleFIN setup token</h3>
                <p>
                  Link your banks in SimpleFIN Bridge (a small paid service) and
                  create a setup token.
                </p>
              </div>
              <a
                className="button dark"
                href="https://beta-bridge.simplefin.org/"
              >
                Open SimpleFIN
              </a>
            </li>
            <li>
              <div>
                <h3>Claim it on your setup page</h3>
                <p>
                  Paste the token at <code>/setup</code> on your deployment. You
                  get a connector URL, shown once.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3>Add it to your assistant</h3>
                <p>
                  Paste the URL as a custom connector in Claude, ChatGPT or
                  Cursor. The setup page shows where.
                </p>
              </div>
            </li>
          </ol>
          <p className="footnote">
            Your bank login never reaches this server. It stores a SimpleFIN
            access URL, encrypted with a key that exists only in your connector
            URL.
          </p>
        </div>
      </section>
    </main>
  );
}
