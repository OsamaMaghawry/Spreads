// The stocks and funds that get a public /expected-move page.
//
// The most-traded US option underlyings: index and sector funds first, then
// the single names people most often search an expected move for. A symbol
// and the name a reader knows it by; the page title uses both. Edit freely:
// the refresh job picks up a new symbol on its next run, and a removed one
// simply stops being refreshed (its page then shows its last update time).
export const TICKER_PAGES: [string, string][] = [
  ["SPY", "SPDR S&P 500 ETF"], ["QQQ", "Invesco QQQ"], ["IWM", "iShares Russell 2000 ETF"],
  ["DIA", "SPDR Dow Jones ETF"], ["TLT", "iShares 20+ Year Treasury Bond ETF"], ["GLD", "SPDR Gold Shares"],
  ["SLV", "iShares Silver Trust"], ["XLF", "Financial Select Sector SPDR"], ["XLE", "Energy Select Sector SPDR"],
  ["SMH", "VanEck Semiconductor ETF"], ["EEM", "iShares MSCI Emerging Markets ETF"], ["KRE", "SPDR S&P Regional Banking ETF"],
  ["TSLA", "Tesla"], ["NVDA", "NVIDIA"], ["AAPL", "Apple"], ["AMZN", "Amazon"], ["AMD", "AMD"],
  ["META", "Meta Platforms"], ["MSFT", "Microsoft"], ["GOOGL", "Alphabet"], ["NFLX", "Netflix"],
  ["PLTR", "Palantir"], ["COIN", "Coinbase"], ["MSTR", "Strategy"], ["BABA", "Alibaba"], ["INTC", "Intel"],
  ["AVGO", "Broadcom"], ["SOFI", "SoFi Technologies"], ["MARA", "MARA Holdings"], ["RIVN", "Rivian"],
  ["NIO", "NIO"], ["F", "Ford"], ["GM", "General Motors"], ["BAC", "Bank of America"], ["JPM", "JPMorgan Chase"],
  ["WFC", "Wells Fargo"], ["C", "Citigroup"], ["GS", "Goldman Sachs"], ["MS", "Morgan Stanley"],
  ["XOM", "Exxon Mobil"], ["CVX", "Chevron"], ["OXY", "Occidental Petroleum"], ["DIS", "Disney"],
  ["BA", "Boeing"], ["NKE", "Nike"], ["SBUX", "Starbucks"], ["MCD", "McDonald's"], ["WMT", "Walmart"],
  ["COST", "Costco"], ["TGT", "Target"], ["HD", "Home Depot"], ["LOW", "Lowe's"], ["KO", "Coca-Cola"],
  ["PEP", "PepsiCo"], ["PFE", "Pfizer"], ["MRNA", "Moderna"], ["JNJ", "Johnson & Johnson"], ["LLY", "Eli Lilly"],
  ["UNH", "UnitedHealth"], ["ABBV", "AbbVie"], ["MRK", "Merck"], ["CVS", "CVS Health"], ["V", "Visa"],
  ["MA", "Mastercard"], ["PYPL", "PayPal"], ["XYZ", "Block"], ["HOOD", "Robinhood"], ["UBER", "Uber"],
  ["ABNB", "Airbnb"], ["SHOP", "Shopify"], ["SNOW", "Snowflake"], ["CRM", "Salesforce"], ["ORCL", "Oracle"],
  ["ADBE", "Adobe"], ["IBM", "IBM"], ["CSCO", "Cisco"], ["QCOM", "Qualcomm"], ["MU", "Micron"],
  ["TSM", "Taiwan Semiconductor"], ["ARM", "Arm Holdings"], ["SMCI", "Super Micro Computer"], ["DELL", "Dell"],
  ["CRWD", "CrowdStrike"], ["PANW", "Palo Alto Networks"], ["NET", "Cloudflare"], ["ROKU", "Roku"],
  ["SNAP", "Snap"], ["RBLX", "Roblox"], ["DKNG", "DraftKings"], ["GME", "GameStop"], ["CCL", "Carnival"],
  ["AAL", "American Airlines"], ["DAL", "Delta Air Lines"], ["UAL", "United Airlines"], ["T", "AT&T"],
  ["VZ", "Verizon"], ["CAT", "Caterpillar"], ["RIOT", "Riot Platforms"], ["HIMS", "Hims & Hers"],
  ["AFRM", "Affirm"], ["CVNA", "Carvana"], ["IREN", "IREN"]
];
