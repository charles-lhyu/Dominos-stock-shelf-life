# Domino's Stock Shelf Life

A checker for the Domino's all-stores shelf life chart. Type or browse a product, set the delivery or prep date, and see the use-by date. Chart data and store settings stay in the browser on this device.

**Live app:** [https://charles-lhyu.github.io/Dominos-stock-shelf-life/](https://charles-lhyu.github.io/Dominos-stock-shelf-life/)

The same guide is in the app under **Settings → Help**.

**Created by:** Charles Yu (Long Hei Yu)  
**Store:** 28144 Swansea - Marina (UK)

## How to use

### Get started

- Open Settings (gear) and set your Store ID so this device keeps dates, hidden items, and defaults for that store.
- Import a shelf-life chart under Settings → Import: pick a PDF, paste a Google Drive link, or Scan QR.
- Public Drive files shared as “Anyone with the link” load straight away. Private files ask you to sign in with Google so the app can download the PDF.

### Delivery date and prep time

- Set the delivery (or prep) date at the top of the list. That date is day 1 of day-based shelf lives.
- Prep time is used for hour lives (sauces, some sides). Lock a time or leave it live on the store clock.
- Tap a use-by date on the list or card to switch between long and short date formats.

### Find a product

- Scroll the chart list, filter by category or storage, or type in search.
- Tap a product to open item details. Use Back to return to the list.
- Storage and life tags (Delivery / Prepped / Ambient) change which use-by is shown. Multi-storage items can save a default storage for the store.

### Item details

- Each life on the card shows the chart value and the calculated use-by from the date you set.
- Same life names on the chart row are tappable so you can jump to a sibling product.
- When a use-by can be calculated, Same use-by lists other products that share that calendar day, with a storage tag and remaining days.

### Store data

- Hide items you do not use; show them again from Settings → App / Store tools.
- Stored data can copy settings between stores, and import or export a backup file.
- Changing Store ID may ask whether to keep what is on screen or load what that store already saved.

### Display and system

- Settings → Display controls list layout (compact tags), text size, and keep-awake options.
- Settings → System shows the app version, Share app (QR and link), Changelog, and Check for updates.
- Settings → Help (after System) has this guide in the app.

## How a date is counted

The chart prints a life, not a calendar date. The delivery or prep date you enter is day 1 of that life.

- 12 days from a delivery on 1 Oct 2026 is 12 Oct 2026.
- Prep and ambient day lives use that same count, and end at 23:59 on the last day. 10 days prepped on 1 Oct 2026 is 10 Oct 2026 at 23:59.
- Dough is the date on the tray plus 1 day.
- Hours, including the 48-hour mac and cheese prep and the 15-hour ambient sauces, are added on the store clock. 15 hours from 14:30 is 05:30, including the night the clocks go back.
- Where the row says "Date on pack", that printed date is the unopened use-by. If the prepped life runs past it, follow the pack date. Opened and prepped dates must not go past the date on the original packaging.

Pepperoni, Chorizo, and Nduja share a frozen day life that spans From delivery and In use on the chart (both 12 days). Only Pepperoni also has a chilled row (date on pack + 12 days prepped).

## Run it locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4721](http://127.0.0.1:4721).

```bash
npm test
npm run lint
```
