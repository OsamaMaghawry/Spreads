export default function DisclaimerFooter() {
  return (
    <footer className="border-t border-dm-line px-5 sm:px-10 py-5 text-[11px] leading-relaxed text-dm-sub">
      DeltaMint is not a broker-dealer and does not provide investment advice. Options trading involves substantial
      risk of loss and is not suitable for every investor. Trades are placed through your own Alpaca brokerage
      account, under Alpaca's terms — DeltaMint never holds your funds or securities.
      {" "}
      <a href="https://deltamint.app/terms" className="underline hover:text-dm-accent">Terms</a>
      {" · "}
      <a href="https://deltamint.app/privacy" className="underline hover:text-dm-accent">Privacy</a>
    </footer>
  );
}
