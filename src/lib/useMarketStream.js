// Kept as the import path every call site already uses. The socket itself is
// shared through MarketStreamProvider -- see the note there for why one
// connection per account is a correctness requirement and not a tidy-up.
export { default } from "@/lib/MarketStreamProvider";
