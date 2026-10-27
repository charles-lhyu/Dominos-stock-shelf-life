# Shelf life

A checker for the Domino's Campaign 5 shelf life chart (all stores, version 1, issued 7 September 2026, valid to 17 November 2026). Type a product from the chart. The life is shown immediately. Enter the delivery, prep, or pack date and the use-by date is worked out.

The chart is built in. Dates stay in the browser.

## Run it

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4721](http://127.0.0.1:4721).

```bash
npm test
npm run lint
```

## How a date is counted

The chart prints a life, not a calendar date. The delivery or prep date you enter is day 1 of that life.

- 12 days from a delivery on 1 Oct 2026 is 12 Oct 2026.
- Prep and ambient day lives use that same count, and end at 23:59 on the last day. 10 days prepped on 1 Oct 2026 is 10 Oct 2026 at 23:59.
- Dough is the date on the tray plus 1 day.
- Hours, including the 48-hour mac and cheese prep and the 15-hour ambient sauces, are added on the store clock. 15 hours from 14:30 is 05:30, including the night the clocks go back.
- Where the row says "Date on pack", that printed date is the unopened use-by. If the prepped life runs past it, follow the pack date. Opened and prepped dates must not go past the date on the original packaging.

Pepperoni, Chorizo, and Nduja share one frozen from-delivery life on the chart (Prepped uses that remaining life). Only Pepperoni also has a chilled row (date on pack + 12 days prepped).
