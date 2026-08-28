// The trading_accounts columns a browser is allowed to read. Migration 0004
// revokes the credential columns from the `authenticated` role, so selecting
// "*" now fails outright — this list is what the database will actually return.
export const SAFE_ACCOUNT_COLUMNS =
  "id, user_id, name, is_paper, is_oauth, api_key_hint, broker_account_number, spreads_client_prefix, wheel_client_prefix, created_at";
