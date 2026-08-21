-- Support Alpaca OAuth-connected accounts alongside manually-entered API keys.
-- OAuth accounts store a bearer access token instead of a key/secret pair.

alter table public.trading_accounts
  alter column api_key drop not null,
  alter column api_secret drop not null,
  add column oauth_access_token text;

alter table public.trading_accounts
  add constraint trading_accounts_credentials_present check (
    (oauth_access_token is not null)
    or (api_key is not null and api_secret is not null)
  );
