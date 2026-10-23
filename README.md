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

The chart prints a life, not a calendar date. Day counts treat the date you enter as day 1.

- 12 days from a delivery on 1 Oct 2026 ends on 12 Oct 2026.
- Dough is still the date on the tray plus 1 calendar day.
- Hours, including the 48-hour mac and cheese prep and the 15-hour ambient sauces, are added to the time you enter.
- Where the row says "Date on pack", that printed date is the unopened use-by. If the prepped life runs past it, follow the pack date. Opened and prepped dates must not go past the date on the original packaging.

Both pepperoni rows are kept: 12 days from delivery when it is defrosted from frozen, and date-on-pack plus 12 days prepped when it is a chilled item.
