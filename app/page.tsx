import {
  getBalances,
  MissingCredentialError,
  type InstitutionBalances,
  type SimpleFinAccount,
} from "../lib/simplefin";

function formatBalance(account: SimpleFinAccount): string {
  const amount = Number(account.balance);
  if (Number.isNaN(amount)) {
    return `${account.balance} ${account.currency}`;
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: account.currency,
    }).format(amount);
  } catch {
    return `${account.balance} ${account.currency}`;
  }
}

function formatAsOf(account: SimpleFinAccount): string {
  return new Date(account.balanceDate * 1000).toLocaleString();
}

export default async function Home() {
  let groups: InstitutionBalances[];
  try {
    groups = await getBalances();
  } catch (error) {
    const message =
      error instanceof MissingCredentialError
        ? "SimpleFin is not configured. Set SIMPLEFIN_ACCESS_URL in your environment and reload."
        : "Could not load accounts from SimpleFin. Please try again later.";
    return (
      <main>
        <h1>Balances</h1>
        <p role="alert">{message}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Balances</h1>
      {groups.length === 0 ? (
        <p>No accounts found.</p>
      ) : (
        groups.map(({ orgName, accounts }) => (
          <section key={orgName}>
            <h2>{orgName}</h2>
            <ul>
              {accounts.map((account) => (
                <li key={account.id}>
                  <span>{account.name}</span>
                  <span> — {formatBalance(account)}</span>
                  <span> (as of {formatAsOf(account)})</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
