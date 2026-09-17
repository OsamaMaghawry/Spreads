-- What the weekly email SAID, kept beside the record that it was sent.
--
-- The owner: *"Last week I got the Weekly Digest where Alton made 2.7k+ on the
-- previous week window. Now when I filter this very same window, I see a
-- complete different result!!!! How this can happen."*
--
-- It could happen because nothing in this database remembered the figures.
-- `weekly_digest_sends` recorded WHO was mailed and WHEN; the numbers lived
-- in the email and nowhere else. The email is built from `account_equity_daily`
-- at send time, and that series is REWRITTEN in full by every nightly rebuild
-- -- so by Tuesday the rows the Saturday email was computed from no longer
-- existed, and the only evidence of what was sent was the owner's inbox.
--
-- That made his question unanswerable from our side, which is worse than
-- either answer. A figure a product mails to people is a statement it has to
-- be able to stand behind later: the same number, on demand, with the day it
-- was measured to. So the week's figures are stored with the send -- the
-- headline, its four parts, the broker's equity change, the trades closed and
-- opened, what was unpriced and what was withheld -- as a plain jsonb copy of
-- what the email rendered.
--
-- Display and audit only. Nothing computes from this column; it is what was
-- said, not what is true now. When the two differ, that difference is the
-- finding, and it is now visible instead of lost.
alter table public.weekly_digest_sends
  add column if not exists figures jsonb;

comment on column public.weekly_digest_sends.figures is
  'The figures the email rendered, as sent: headline (performance), premiumLine, sharesBooked, sharesMark, optionsMark, equityChange, measuredFrom/To, closed and opened trade summaries, unpriced, withheld. A record of what was said -- never an input to anything.';
