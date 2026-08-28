// The columns of trading_accounts that are safe to return to a browser: every
// column except the three that hold credentials. Column-level grants in
// migration 0004 enforce the same list at the database, so this is the shape a
// client can read, not merely the shape we choose to send.
export const SAFE_ACCOUNT_COLUMNS =
  "id, user_id, name, is_paper, is_oauth, api_key_hint, broker_account_number, spreads_client_prefix, wheel_client_prefix, created_at";
