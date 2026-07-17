import {
  fetchSimpleFinAccounts,
  MissingCredentialError,
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

function groupByInstitution(
  accounts: SimpleFinAccount[],
): Map<string, SimpleFinAccount[]> {
  const groups = new Map<string, SimpleFinAccount[]>();
  for (const account of accounts) {
    const group = groups.get(account.orgName);
    if (group) {
      group.push(account);
    } else {
      groups.set(account.orgName, [account]);
    }
  }
  return groups;
}

export default async function Home() {
  let accounts: SimpleFinAccount[];
  try {
    accounts = await fetchSimpleFinAccounts();
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

  const groups = groupByInstitution(accounts);

  return (
    <main>
      <h1>Balances</h1>
      {groups.size === 0 ? (
        <p>No accounts found.</p>
      ) : (
        Array.from(groups.entries()).map(([orgName, orgAccounts]) => (
          <section key={orgName}>
            <h2>{orgName}</h2>
            <ul>
              {orgAccounts.map((account) => (
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
