import {
  getBalances,
  MissingCredentialError,
  type InstitutionBalances,
  type SimpleFinAccount,
} from "../lib/simplefin";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Kicker, Panel } from "../components/ui/panel";

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

function PageHeader() {
  return (
    <Panel className="mb-6 w-full sm:mb-10" shape="chamfer-tr" fillClassName="p-4 sm:p-6">
      <Kicker tone="orange">SimpleFin</Kicker>
      <h1 className="font-serif text-2xl leading-tight break-words sm:text-3xl">Balances</h1>
    </Panel>
  );
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
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <PageHeader />
        <p role="alert" className="break-words text-sm font-medium text-[#b00020]">
          {message}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <PageHeader />
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accounts found.</p>
      ) : (
        <div className="flex w-full flex-col gap-4 sm:gap-6">
          {groups.map(({ orgName, accounts }) => (
            <Card key={orgName} className="w-full">
              <CardHeader>
                <Kicker>Institution</Kicker>
                <CardTitle className="font-serif text-lg break-words sm:text-xl">
                  {orgName}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2">
                  {accounts.map((account) => (
                    <li
                      key={account.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-ink/10 py-2 last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 break-words font-medium">
                        {account.name}
                      </span>
                      <span className="min-w-0 flex-shrink-0 break-words text-right font-medium">
                        {formatBalance(account)}
                      </span>
                      <span className="w-full min-w-0 break-words text-xs text-muted-foreground">
                        as of {formatAsOf(account)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
